import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { consumeCredit, refundCredit } from '@/lib/credits-server';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';

export const maxDuration = 120;

const SYSTEM_PROMPT = `Eres un analista financiero senior especializado en pymes colombianas.
Recibirás un estado financiero (estado de resultados, balance general o reporte de movimientos), ya sea como tabla de datos o como documento (PDF/imagen),
y opcionalmente instrucciones del usuario.

Tu tarea: construir un tablero ejecutivo con explicaciones EN TÉRMINOS PRÁCTICOS Y ACCIONABLES (qué significa para el negocio y qué hacer al respecto), en español.

Devuelve SOLO un JSON estricto, sin markdown:
{
  "title": "título corto del análisis (ej: 'Estado de Resultados Ene-Dic 2025')",
  "kpis": [ { "label": "nombre del indicador", "value": "valor formateado (ej: '$45,2 M' o '12,3 %')", "trend": "up|down|neutral", "comment": "qué significa en 1 frase práctica" } ],
  "categoryData": [ { "name": "rubro", "value": numero_positivo } ],
  "barData": [ { "name": "periodo o rubro", "amount": numero } ],
  "insights": [ { "title": "hallazgo corto", "explanation": "explicación práctica sin jerga, 2-3 frases", "action": "acción concreta recomendada, 1-2 frases" } ],
  "summary": "diagnóstico general del negocio en 3-4 frases prácticas"
}
Reglas:
1. 4 a 6 kpis, 3 a 6 insights.
2. categoryData: composición principal (gastos por rubro, o activos, según el documento) — máximo 8 entradas, valores positivos.
3. barData: la serie más informativa (resultados por mes/periodo, o ingresos vs costos vs utilidad) — máximo 12 entradas.
4. Los números deben salir del documento; no inventes cifras.
5. Lenguaje claro para un empresario no financiero.`;

type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } };

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: {
        rows?: Record<string, unknown>[];
        base64?: string;
        mimeType?: string;
        fileName?: string;
        instructions?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { rows, base64, mimeType, fileName, instructions } = body;
    if (!rows?.length && !(base64 && mimeType)) {
        return NextResponse.json(
            { error: 'Se requiere rows (datos tabulares) o base64+mimeType (documento)' },
            { status: 400 }
        );
    }

    const consumed = await consumeCredit(user.id, 'dashboards');
    if (!consumed.ok) {
        return NextResponse.json(
            { error: 'Sin créditos disponibles', needsPurchase: consumed.needsPurchase },
            { status: 403 }
        );
    }

    try {
        const content: ContentPart[] = [
            {
                type: 'text',
                text: `INSTRUCCIONES DEL USUARIO:\n${(instructions || 'Ninguna').slice(0, 2000)}\n\n${
                    rows?.length
                        ? `DATOS DEL ESTADO FINANCIERO (JSON, ${Math.min(rows.length, 1000)} filas):\n${JSON.stringify(rows.slice(0, 1000))}`
                        : 'El estado financiero está en el documento adjunto.'
                }`,
            },
        ];

        if (!rows?.length && base64 && mimeType) {
            const dataUrl = `data:${mimeType};base64,${base64}`;
            if (mimeType === 'application/pdf') {
                content.push({ type: 'file', file: { filename: fileName || 'estado-financiero.pdf', file_data: dataUrl } });
            } else {
                content.push({ type: 'image_url', image_url: { url: dataUrl } });
            }
        }

        const ai = getOpenRouter();

        // Las respuestas largas ocasionalmente traen JSON malformado:
        // temperatura baja + un reintento antes de devolver el crédito
        let parsed: Record<string, unknown> | null = null;
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
            try {
                const completion = await ai.chat.completions.create({
                    model: MODELS.ANALYST,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        // OpenRouter acepta el content part "file" para PDFs; el SDK de OpenAI no lo tipa
                        { role: 'user', content: content as never },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.2,
                    max_tokens: 8000,
                });

                const text = completion.choices[0]?.message?.content;
                if (!text) throw new Error('La IA no devolvió el análisis.');

                const candidate = parseModelJSON<Record<string, unknown>>(text);
                if (!Array.isArray(candidate.kpis) || !Array.isArray(candidate.insights)) {
                    throw new Error('La IA devolvió un análisis incompleto. Intenta de nuevo.');
                }
                parsed = candidate;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                console.warn(`Analyze financials intento ${attempt + 1} falló:`, lastError.message);
            }
        }

        if (!parsed) throw lastError || new Error('La IA no devolvió el análisis.');

        return NextResponse.json({ analysis: parsed, credits: consumed.credits });
    } catch (error: unknown) {
        // El análisis falló: devolver el crédito descontado
        await refundCredit(user.id, 'dashboards').catch(() => {});
        console.error('Analyze financials error:', error);
        const message = error instanceof Error ? error.message : 'Error al analizar el estado financiero';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
