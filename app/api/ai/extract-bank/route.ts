import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { consumeCredit, refundCredit } from '@/lib/credits-server';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';

export const maxDuration = 90;

type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } };

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { base64?: string; mimeType?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { base64, mimeType } = body;
    if (!base64 || !mimeType) {
        return NextResponse.json({ error: 'base64 y mimeType son requeridos' }, { status: 400 });
    }

    const consumed = await consumeCredit(user.id, 'bank_recs');
    if (!consumed.ok) {
        return NextResponse.json(
            { error: 'Sin créditos disponibles', needsPurchase: consumed.needsPurchase },
            { status: 403 }
        );
    }

    try {
        const ai = getOpenRouter();

        const dataUrl = `data:${mimeType};base64,${base64}`;
        const fileOrImage: ContentPart = mimeType === 'application/pdf'
            ? { type: 'file', file: { filename: 'extracto.pdf', file_data: dataUrl } }
            : { type: 'image_url', image_url: { url: dataUrl } };

        const content: ContentPart[] = [
            {
                type: 'text',
                text: `Analiza este extracto bancario y extrae todas las transacciones.
Devuelve SOLO un JSON array con este formato exacto:
[{"date": "YYYY-MM-DD", "description": "texto", "amount": numero, "reference": "ref opcional"}]
- amount debe ser positivo para depósitos/créditos y negativo para débitos/retiros
- Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.`,
            },
            fileOrImage,
        ];

        const isPdf = mimeType === 'application/pdf';

        // Estrategia por niveles para ahorrar costo y tiempo:
        // 1) PDF → primero 'pdf-text' (GRATIS: extrae texto embebido, sirve
        //    con extractos digitales del banco/DIAN, que son la mayoría).
        // 2) Si no salió nada (PDF escaneado) → 'mistral-ocr' (pago, OCR real).
        // Imágenes → visión directa, sin plugin.
        const runExtraction = async (engine: 'pdf-text' | 'mistral-ocr' | null) => {
            const response = await ai.chat.completions.create({
                model: MODELS.BANK_OCR,
                messages: [
                    { role: 'user', content: content as never },
                ],
                max_tokens: 8000,
                ...(engine ? { plugins: [{ id: 'file-parser', pdf: { engine } }] } : {}),
            } as never);
            const text = response.choices[0]?.message?.content;
            if (!text) return null;
            try {
                const parsed = parseModelJSON(text);
                return Array.isArray(parsed) ? parsed : null;
            } catch {
                return null;
            }
        };

        let transactions = await runExtraction(isPdf ? 'pdf-text' : null);
        // Fallback a OCR solo si el PDF digital no dio resultados (escaneado)
        if (isPdf && (!transactions || transactions.length === 0)) {
            transactions = await runExtraction('mistral-ocr');
        }

        if (!Array.isArray(transactions)) {
            throw new Error('La IA no devolvió una lista de transacciones. Intenta con un archivo más legible.');
        }

        return NextResponse.json({ transactions, credits: consumed.credits });
    } catch (error: unknown) {
        // La extracción falló: devolver el crédito descontado
        await refundCredit(user.id, 'bank_recs').catch(() => {});
        console.error('Extract bank error:', error);
        const message = error instanceof Error ? error.message : 'Error al procesar el extracto';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
