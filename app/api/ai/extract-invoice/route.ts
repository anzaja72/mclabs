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
Actúa como un sistema de OCR y extracción de datos experto en FACTURAS ELECTRÓNICAS COLOMBIANAS (DIAN). Analiza el documento y extrae TODOS los datos en JSON estricto.
Estructura JSON requerida:
{
    "generalInfo": { "invoiceNumber": "", "cufe": "", "issueDate": "YYYY-MM-DD", "dueDate": "", "paymentMethod": "", "currency": "COP" },
    "issuerInfo": { "companyName": "", "nit": "", "address": "", "city": "", "phone": "", "email": "" },
    "customerInfo": { "name": "", "idNumber": "", "address": "", "city": "", "email": "" },
    "lineItems": [
        { "description": "", "quantity": 0, "unitPrice": 0, "discount": 0, "taxRate": 0, "taxValue": 0, "totalValue": 0 }
    ],
    "totals": { "subtotal": 0, "discounts": 0, "iva": 0, "inc": 0, "reteFuente": 0, "reteIva": 0, "reteIca": 0, "grandTotal": 0 }
}
Reglas:
1. "cufe": el código CUFE/CUDE completo (cadena hexadecimal larga); si no aparece usa "".
2. Por cada ítem: "taxRate" es la tarifa de IVA/INC en % (ej. 19) y "taxValue" el impuesto en pesos de ESE ítem; si la factura no discrimina impuesto por ítem, calcula proporcional al subtotal del ítem o usa 0.
3. Los números deben ser numéricos puros, sin símbolos ni separadores de miles.
4. Si un campo no está claro, usa null o "" (o 0 para números).
5. Si el documento NO es una factura ni documento equivalente (ej. un extracto bancario), devuelve {"noEsFactura": true, "tipoDetectado": "descripción corta"}.
6. Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.
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

        // ¿La extracción trajo datos reales de factura? (total, número o NIT)
        const hasInvoiceData = (p: Record<string, unknown> | null): boolean => {
            if (!p) return false;
            const g = p.generalInfo as Record<string, unknown> | undefined;
            const i = p.issuerInfo as Record<string, unknown> | undefined;
            const t = p.totals as Record<string, unknown> | undefined;
            const items = p.lineItems as unknown[] | undefined;
            return Boolean(
                (t && Number(t.grandTotal) > 0) ||
                (g && g.invoiceNumber) ||
                (i && i.nit) ||
                (Array.isArray(items) && items.length > 0)
            );
        };

        const runExtraction = async (engine: 'pdf-text' | 'mistral-ocr' | null) => {
            const completion = await ai.chat.completions.create({
                model: MODELS.EXTRACTOR,
                messages: [
                    { role: 'user', content: [{ type: 'text', text: EXTRACTOR_SYSTEM_PROMPT }, fileOrImage] as never },
                ],
                response_format: { type: 'json_object' },
                max_tokens: 4000,
                ...(engine ? { plugins: [{ id: 'file-parser', pdf: { engine } }] } : {}),
            } as never);
            const text = completion.choices[0]?.message?.content;
            if (!text) return null;
            try {
                return parseModelJSON<Record<string, unknown>>(text);
            } catch {
                return null;
            }
        };

        // Una sola llamada: el motor gratuito 'pdf-text' resultó lento y poco
        // fiable en documentos reales (78s y 0 datos en un extracto), y dos
        // intentos encadenados superan el corte de ~31s de Netlify.
        const parsed = await runExtraction(isPdf ? 'mistral-ocr' : null);
        if (parsed && parsed.noEsFactura) {
            const tipo = typeof parsed.tipoDetectado === 'string' && parsed.tipoDetectado
                ? ` (parece ser: ${parsed.tipoDetectado})`
                : '';
            throw new Error(`El documento no es una factura${tipo}. Este módulo extrae facturas y documentos equivalentes.`);
        }
        if (!parsed || !hasInvoiceData(parsed)) {
            throw new Error('No se pudieron leer los datos de la factura. Prueba con un archivo más legible.');
        }

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
