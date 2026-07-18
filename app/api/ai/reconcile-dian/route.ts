import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';
import { shield, unshield } from '@/lib/privacy';

export const maxDuration = 120;

const MAX_ROWS = 500;

interface DianRow {
    nit: string;
    tipo: string;
    dianTotal: number;
    dianDocs: number;
    contableTotal: number;
    diferencia: number;
    estado: string;
}

const ESTADOS_VALIDOS = ['OK', 'ADVERTENCIA', 'CRITICO', 'SOLO_DIAN'];

const SYSTEM_PROMPT = `Eres un auditor tributario experto en conciliación de facturación electrónica DIAN vs contabilidad en Colombia.
Recibirás los resultados de un cruce automático por NIT (valor reportado en DIAN vs valor en contabilidad) y las INSTRUCCIONES PERSONALIZADAS del usuario
(por ejemplo: "los pagos de nómina del NIT X están desagregados en contabilidad, consolídalos", "ignora diferencias menores a $5.000 por redondeo", "el tercero Y factura por anticipos, no es una diferencia real").

Tu tarea: aplicar las instrucciones para AJUSTAR el diagnóstico de las filas afectadas y explicar por qué.
NO inventes filas nuevas ni cambies valores numéricos; solo puedes reclasificar el estado y añadir una nota.

Estados válidos: OK (cuadra), ADVERTENCIA (diferencia menor a revisar), CRITICO (diferencia importante), SOLO_DIAN (no está en contabilidad).

Devuelve SOLO un JSON estricto, sin markdown:
{
  "adjustments": [ { "nit": "...", "tipo": "...", "estado": "OK|ADVERTENCIA|CRITICO|SOLO_DIAN", "nota": "explicación breve en español" } ],
  "summary": "resumen en español de los ajustes aplicados según las instrucciones"
}
Incluye en adjustments SOLO las filas cuyo diagnóstico cambia o que merecen una nota según las instrucciones.`;

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { results?: DianRow[]; instructions?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { results, instructions } = body;
    if (!Array.isArray(results) || results.length === 0 || !instructions?.trim()) {
        return NextResponse.json({ error: 'results e instructions son requeridos' }, { status: 400 });
    }
    if (results.length > MAX_ROWS) {
        return NextResponse.json(
            { error: `Máximo ${MAX_ROWS} filas para el ajuste con IA` },
            { status: 400 }
        );
    }

    const rowsList = results
        .map(r => `${r.nit} | ${r.tipo} | DIAN:${r.dianTotal} (${r.dianDocs} docs) | CONTABLE:${r.contableTotal} | DIF:${r.diferencia} | ${r.estado}`)
        .join('\n');

    try {
        const ai = getOpenRouter();

        // Privacy Shield: anonimiza PII (nombres, cédulas, emails, celulares)
        // antes de enviar a la IA. Modo contable: NO toca montos ni NITs
        // sueltos (la llave de cruce), así el emparejamiento se conserva.
        const userContent = `INSTRUCCIONES PERSONALIZADAS DEL USUARIO:\n${instructions.slice(0, 2000)}\n\nRESULTADOS DEL CRUCE (NIT | tipo | valor DIAN | valor contable | diferencia | estado):\n${rowsList}`;
        const shielded = shield(userContent);

        const completion = await ai.chat.completions.create({
            model: MODELS.RECONCILER,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: shielded.text },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 8000,
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error('La IA no devolvió resultados.');

        // Restaura los datos reales en la respuesta antes de procesarla.
        const text = unshield(raw, shielded.vault);

        const parsed = parseModelJSON(text) as {
            adjustments?: { nit: string; tipo: string; estado?: string; nota?: string }[];
            summary?: string;
        };

        const validKeys = new Set(results.map(r => `${r.nit}::${r.tipo}`));
        const adjustments = (parsed.adjustments || []).filter(a =>
            a && validKeys.has(`${a.nit}::${a.tipo}`) &&
            (a.estado === undefined || ESTADOS_VALIDOS.includes(a.estado))
        );

        return NextResponse.json({
            adjustments,
            summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        });
    } catch (error: unknown) {
        console.error('Reconcile DIAN error:', error);
        const message = error instanceof Error ? error.message : 'Error en el ajuste con IA';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
