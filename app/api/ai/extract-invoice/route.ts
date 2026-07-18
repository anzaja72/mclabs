import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { consumeCredit, refundCredit } from '@/lib/credits-server';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';

export const maxDuration = 60;

type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; file_data: string } };

const EXTRACTOR_SYSTEM_PROMPT = `
Actúa como un sistema de OCR y extracción de datos experto. Analiza el texto de la factura y extrae los datos en formato JSON estricto.
Estructura JSON requerida:
{
    "generalInfo": { "invoiceNumber": "", "issueDate": "YYYY-MM-DD", "dueDate": "", "paymentMethod": "" },
    "customerInfo": { "name": "", "idNumber": "", "address": "", "email": "" },
    "issuerInfo": { "companyName": "", "nit": "" },
    "lineItems": [
        { "description": "", "quantity": 0, "unitPrice": 0, "totalValue": 0 }
    ],
    "totals": { "grandTotal": 0 }
}
Reglas:
1. Si un campo no está claro, usa null o "".
2. Los números deben ser numéricos puros.
3. Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.
`;

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { base64?: string; mimeType?: string; fileName?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { base64, mimeType, fileName } = body;
    if (!base64 || !mimeType) {
        return NextResponse.json({ error: 'base64 y mimeType son requeridos' }, { status: 400 });
    }

    const consumed = await consumeCredit(user.id, 'extractor');
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
            ? { type: 'file', file: { filename: 'factura.pdf', file_data: dataUrl } }
            : { type: 'image_url', image_url: { url: dataUrl } };

        const isPdf = mimeType === 'application/pdf';
        const completion = await ai.chat.completions.create({
            model: MODELS.EXTRACTOR,
            messages: [
                // OpenRouter acepta el content part "file" para PDFs; el SDK de OpenAI no lo tipa
                { role: 'user', content: [{ type: 'text', text: EXTRACTOR_SYSTEM_PROMPT }, fileOrImage] as never },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
            ...(isPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }] } : {}),
        } as never);

        const text = completion.choices[0]?.message?.content;
        if (!text) throw new Error('La IA no devolvió datos válidos.');

        const parsed = parseModelJSON<Record<string, unknown>>(text);

        return NextResponse.json({
            invoice: {
                ...parsed,
                id: crypto.randomUUID(),
                fileName: fileName || 'documento',
                processedAt: new Date().toISOString(),
            },
            credits: consumed.credits,
        });
    } catch (error: unknown) {
        // La extracción falló: devolver el crédito descontado
        await refundCredit(user.id, 'extractor').catch(() => {});
        console.error('Extract invoice error:', error);
        const message = error instanceof Error ? error.message : 'Error al extraer la factura';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
