import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { consumeCredit, refundCredit } from '@/lib/credits-server';
import { getOpenRouter, MODELS, cleanJSON } from '@/lib/ai-server';

export const maxDuration = 90;

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
        const response = await ai.chat.completions.create({
            model: MODELS.BANK_OCR,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analiza este extracto bancario y extrae todas las transacciones.
Devuelve SOLO un JSON array con este formato exacto:
[{"date": "YYYY-MM-DD", "description": "texto", "amount": numero, "reference": "ref opcional"}]
- amount debe ser positivo para depósitos/créditos y negativo para débitos/retiros
- Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.`,
                        },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                    ],
                },
            ],
            max_tokens: 8000,
        });

        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error('No se pudo extraer datos del extracto bancario');

        let transactions: unknown;
        try {
            transactions = JSON.parse(cleanJSON(text));
        } catch {
            throw new Error('La IA no devolvió un JSON válido. Intenta con un archivo más legible.');
        }

        if (!Array.isArray(transactions)) {
            throw new Error('La IA no devolvió una lista de transacciones.');
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
