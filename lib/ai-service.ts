import OpenAI from 'openai';
import { InvoiceData } from "@/types/extractor";

// Helper to check for JSON in markdown
const cleanJSON = (text: string) => text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

// 1. Bank Conciliator -> Minimax
export const getBankConciliatorAI = () => new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.NEXT_PUBLIC_OPENROUTER_MINIMAX_KEY || '',
    dangerouslyAllowBrowser: true
});

// 2. Fiscal Conciliator -> Kimi
export const getFiscalConciliatorAI = () => new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.NEXT_PUBLIC_OPENROUTER_KIMI_KEY || '',
    dangerouslyAllowBrowser: true
});

// 3. Dashboard -> GLM5
export const getDashboardAI = () => new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.NEXT_PUBLIC_OPENROUTER_GLM5_KEY || '',
    dangerouslyAllowBrowser: true
});

// 4. Invoice Extractor -> Qwen3
export const getExtractorAI = () => new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.NEXT_PUBLIC_OPENROUTER_QWEN3_KEY || '',
    dangerouslyAllowBrowser: true
});

export const MODELS = {
    BANK: 'google/gemma-3-27b-it:free', // Using Google Gemma 3 27B which supports images and is free on OpenRouter
    FISCAL: 'moonshotai/kimi-k2',
    DASHBOARD: 'z-ai/glm-4.5',
    EXTRACTOR: 'qwen/qwen-max'
};

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
1. Si un campo no está claro, usa null o"".
2. Los números deben ser numéricos puros.
3. Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.
`;

export const extractInvoiceData = async (
    base64Data: string,
    mimeType: string,
    fileName: string
): Promise<InvoiceData> => {
    const ai = getExtractorAI();
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    try {
        const completion = await ai.chat.completions.create({
            model: MODELS.EXTRACTOR,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: EXTRACTOR_SYSTEM_PROMPT },
                        { type: "image_url", image_url: { url: dataUrl } }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 4000
        });

        const text = completion.choices[0]?.message?.content;
        if (!text) throw new Error("La IA no devolvió datos válidos.");

        const parsed = JSON.parse(cleanJSON(text));

        return {
            ...parsed,
            id: Math.random().toString(36).substring(2, 9),
            fileName,
            processedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error("OpenRouter API Error:", error);
        throw error;
    }
};

export const extractBankDataFromPDF = async (file: File): Promise<any[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const ai = getBankConciliatorAI();

    const response = await ai.chat.completions.create({
        model: MODELS.BANK,
        messages: [{
            role: 'user',
            content: [
                {
                    type: "text",
                    text: `Analiza este extracto bancario y extrae todas las transacciones. 
                    Devuelve SOLO un JSON array con este formato exacto:
                    [{"date": "YYYY-MM-DD", "description": "texto", "amount": numero, "reference": "ref opcional"}]
                    - amount debe ser positivo para depósitos/créditos y negativo para débitos/retiros
                    - Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.`
                },
                { type: "image_url", image_url: { url: dataUrl } }
            ]
        }],
        max_tokens: 4000
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('No se pudo extraer datos del PDF bancario');

    return JSON.parse(cleanJSON(text));
};
