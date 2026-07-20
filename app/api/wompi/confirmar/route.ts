import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acreditarCompra } from '@/lib/credits-server';

const WOMPI_API = 'https://production.wompi.co/v1';

/**
 * Confirma una transacción de Wompi tras el redirect del checkout
 * (/compra/confirmacion?id=<tx>) y acredita el paquete al usuario
 * logueado. Idempotente: la referencia wompi:<tx_id> solo acredita
 * una vez, sin importar cuántas veces se recargue la página o si el
 * webhook llegó primero.
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const { transactionId } = (await request.json()) as { transactionId?: string };
        if (!transactionId || !/^[\w-]+$/.test(transactionId)) {
            return NextResponse.json({ error: 'Transacción no válida' }, { status: 400 });
        }

        // La consulta de transacciones de Wompi es pública (no requiere llaves)
        const res = await fetch(`${WOMPI_API}/transactions/${transactionId}`, {
            cache: 'no-store',
        });
        if (res.status === 404) {
            return NextResponse.json({ error: 'La transacción no existe en Wompi' }, { status: 404 });
        }
        if (!res.ok) {
            return NextResponse.json({ error: 'Wompi no respondió, intenta de nuevo' }, { status: 502 });
        }

        const tx = (await res.json())?.data as {
            id: string;
            status: string;
            amount_in_cents: number;
            currency: string;
            payment_link_id?: string | null;
        };

        if (tx.status === 'PENDING') {
            return NextResponse.json({ pending: true }, { status: 202 });
        }
        if (tx.status !== 'APPROVED') {
            return NextResponse.json(
                { error: `El pago no fue aprobado (estado: ${tx.status})`, rejected: true },
                { status: 402 }
            );
        }
        if (tx.currency !== 'COP') {
            return NextResponse.json({ error: 'Moneda no soportada' }, { status: 400 });
        }

        // Resolver el paquete: por payment_link_id; respaldo por monto exacto
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
            return NextResponse.json(
                { error: 'El pago no corresponde a ningún paquete MC. Escríbenos para acreditarlo manualmente.' },
                { status: 422 }
            );
        }

        const { saldo, duplicado } = await acreditarCompra(
            user.id,
            paquete.creditos,
            `wompi:${tx.id}`
        );

        return NextResponse.json({
            success: true,
            duplicado,
            creditos: paquete.creditos,
            paquete: paquete.id,
            saldo,
        });
    } catch (error: unknown) {
        console.error('Error confirmando pago Wompi:', error);
        const message = error instanceof Error ? error.message : 'Error al confirmar el pago';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
