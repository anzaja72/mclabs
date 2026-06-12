import OpenAI from 'openai';

/**
 * Cliente de OpenRouter exclusivo del servidor. La clave vive en
 * OPENROUTER_API_KEY (sin prefijo NEXT_PUBLIC_) y nunca llega al navegador.
 */
export const getOpenRouter = () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY no está configurada en el servidor.');
    }
    return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
    });
};

export const MODELS = {
    BANK_OCR: 'google/gemini-3.1-flash-lite', // OCR + extracción estructurada de extractos
    EXTRACTOR: 'google/gemini-3.5-flash', // Extracción de facturas (visión + JSON estructurado)
    RECONCILER: 'google/gemini-3.5-flash', // Cruce bancario/DIAN con instrucciones del usuario
    ANALYST: 'google/gemini-3.5-flash', // Análisis de estados financieros (acepta PDF/imagen)
};

export const cleanJSON = (text: string) =>
    text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

/**
 * Parsea la respuesta JSON de un modelo tolerando texto extra antes o
 * después del objeto (algunos modelos añaden comentarios pese a pedir
 * JSON estricto). Extrae el primer objeto balanceado.
 */
export const parseModelJSON = <T = unknown>(text: string): T => {
    const cleaned = cleanJSON(text);
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const objStart = cleaned.indexOf('{');
        const arrStart = cleaned.indexOf('[');
        const start = objStart === -1 ? arrStart
            : arrStart === -1 ? objStart
            : Math.min(objStart, arrStart);
        if (start === -1) throw new Error('La IA no devolvió un JSON válido.');

        const open = cleaned[start];
        const close = open === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === open) depth++;
            else if (ch === close) {
                depth--;
                if (depth === 0) {
                    return JSON.parse(cleaned.slice(start, i + 1)) as T;
                }
            }
        }
        throw new Error('La IA no devolvió un JSON válido.');
    }
};
