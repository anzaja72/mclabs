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
};

export const cleanJSON = (text: string) =>
    text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
