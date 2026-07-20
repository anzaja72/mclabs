import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { VIGENCIA_MESES } from '@/lib/credits-server';

/**
 * Webhook de eventos de Wompi (transaction.updated). Respaldo del flujo
 * de /compra/confirmacion: si el pago es APPROVED, acredita el paquete
 * al usuario cuyo email coincide con el del pagador. Si el email no
 * corresponde a ningún usuario, deja el pago en wompi_pendientes.
 * Idempotente por referencia wompi:<tx_id>.
 */

function valorPorRuta(datos: Record<string, unknown>, ruta: string): unknown {
    let actual: unknown = datos;
    for (const parte of ruta.split('.')) {
        if (typeof actual !== 'object' || actual === null) return null;
        actual = (actual as Record<string, unknown>)[parte];
    }
    return actual;
}

/** Checksum de Wompi: SHA256(valores de properties + timestamp + secreto). */
function firmaValida(evento: {
    signature?: { checksum?: string; properties?: string[] };
    timestamp?: number | string;
    data?: Record<string, unknown>;
}, secreto: string): boolean {
    const checksum = (evento.signature?.checksum || '').trim().toLowerCase();
    if (!checksum || !secreto) return false;
    const cadena =
        (evento.signature?.properties || [])
            .map((p) => {
                const v = valorPorRuta(evento.data || {}, p);
                return v === null || v === undefined ? '' : String(v);
            })
            .join('') +
        String(evento.timestamp ?? '') +
        secreto;
    const calculado = createHash('sha256').update(cadena).digest('hex').toLowerCase();
    return calculado === checksum;
}

export async function POST(request: NextRequest) {
    const secreto = process.env.WOMPI_EVENTS_SECRET;
    if (!secreto) {
        console.error('WOMPI_EVENTS_SECRET no está configurado');
        return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
    }

    let evento;
    try {
        evento = await request.json();
    } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    if (!firmaValida(evento, secreto)) {
        console.error('Firma de evento Wompi inválida');
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    if (evento.event !== 'transaction.updated') {
        return NextResponse.json({ received: true });
    }

    const tx = evento.data?.transaction as {
        id: string;
        status: string;
        amount_in_cents: number;
        currency: string;
        customer_email?: string | null;
        payment_link_id?: string | null;
    } | undefined;

    if (!tx?.id || tx.status !== 'APPROVED' || tx.currency !== 'COP') {
        return NextResponse.json({ received: true });
    }

    try {
        // Resolver paquete por payment_link_id; respaldo por monto exacto
        let paquete = null;
        if (tx.payment_link_id) {
            const { data } = await supabaseAdmin
                .from('paquetes')
                .select('id, creditos, precio_cop')
                .eq('wompi_link', tx.payment_link_id)
                .eq('activo', true)
                .maybeSingle();
            paquete = data;
        }
        if (!paquete) {
            const { data } = await supabaseAdmin
                .from('paquetes')
                .select('id, creditos, precio_cop')
                .eq('precio_cop', Math.round(tx.amount_in_cents / 100))
                .eq('activo', true)
                .maybeSingle();
            paquete = data;
        }
        if (!paquete) {
            console.error(`Pago Wompi ${tx.id} sin paquete (monto ${tx.amount_in_cents})`);
            return NextResponse.json({ received: true, unmatched: true });
        }

        const vence = new Date();
        vence.setMonth(vence.getMonth() + VIGENCIA_MESES);

        if (tx.customer_email) {
            const { data, error } = await supabaseAdmin.rpc('billetera_acreditar_por_email', {
                p_email: tx.customer_email,
                p_cantidad: paquete.creditos,
                p_motivo: 'compra',
                p_referencia: `wompi:${tx.id}`,
                p_vence: vence.toISOString(),
            });
            if (error) throw error;
            const result = data as { ok?: boolean; error?: string };
            if (result?.ok) {
                console.log(`Wompi ${tx.id}: ${paquete.creditos} créditos acreditados a ${tx.customer_email}`);
                return NextResponse.json({ received: true, credited: true });
            }
        }

        // Sin usuario con ese email: registrar como pendiente (el flujo de
        // /compra/confirmacion lo resolverá si el comprador está logueado).
        await supabaseAdmin.from('wompi_pendientes').upsert({
            tx_id: tx.id,
            email: tx.customer_email ?? null,
            paquete_id: paquete.id,
            creditos: paquete.creditos,
            monto_cop: Math.round(tx.amount_in_cents / 100),
        }, { onConflict: 'tx_id' });

        return NextResponse.json({ received: true, pending_user: true });
    } catch (err) {
        console.error('Error procesando webhook Wompi:', err);
        // 500 → Wompi reintenta el evento más tarde
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
