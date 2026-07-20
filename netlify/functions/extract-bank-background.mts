/**
 * Extracción de extractos bancarios en SEGUNDO PLANO.
 *
 * Las funciones `-background` de Netlify devuelven 202 de inmediato y pueden
 * correr hasta 15 minutos, evitando el corte a ~31s que sufre una petición
 * normal (el OCR de un extracto real tarda ~35s o más).
 *
 * Flujo: el navegador crea el job → esta función procesa y escribe el
 * resultado en `ai_jobs` → el navegador consulta el resultado por RLS.
 */
import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const MODEL = 'minimax/minimax-m3';

const PROMPT = `Analiza este extracto bancario y extrae TODAS las transacciones.
Devuelve SOLO un JSON array con este formato exacto:
[{"date": "YYYY-MM-DD", "description": "texto", "amount": numero, "reference": "ref opcional"}]
- amount debe ser positivo para depósitos/créditos y negativo para débitos/retiros
- Devuelve SOLO el JSON, sin texto adicional ni bloques de markdown.`;

/** Extrae el primer array JSON balanceado del texto del modelo. */
function parseArray(text: string): unknown[] | null {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
        const p = JSON.parse(clean);
        return Array.isArray(p) ? p : null;
    } catch {
        const start = clean.indexOf('[');
        if (start === -1) return null;
        let depth = 0, inStr = false, esc = false;
        for (let i = start; i < clean.length; i++) {
            const c = clean[i];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '[') depth++;
            else if (c === ']' && --depth === 0) {
                try {
                    const p = JSON.parse(clean.slice(start, i + 1));
                    return Array.isArray(p) ? p : null;
                } catch { return null; }
            }
        }
        return null;
    }
}

export default async (req: Request, _context: Context) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let jobId: string | null = null;
    let userId: string | null = null;

    try {
        const { jobId: jid, base64, mimeType } = await req.json();
        jobId = jid;

        const auth = req.headers.get('authorization') || '';
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        if (!token || !jobId || !base64) return new Response('bad request', { status: 400 });

        // Validar el usuario dueño del job
        const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        const { data: userData } = await anon.auth.getUser(token);
        if (!userData?.user) return new Response('unauthorized', { status: 401 });
        userId = userData.user.id;

        await admin.from('ai_jobs').upsert({
            id: jobId, user_id: userId, tipo: 'extract_bank', estado: 'procesando',
        });

        // Cobrar el crédito (billetera unificada, idempotente por referencia)
        const { data: consumo, error: errConsumo } = await admin.rpc('creditos_consumir', {
            p_user: userId, p_herramienta: 'bank_recs', p_referencia: `uso:bank_recs:${jobId}`,
        });
        if (errConsumo) {
            const sinCreditos = (errConsumo.message || '').includes('SIN_CREDITOS');
            await admin.from('ai_jobs').update({
                estado: 'error',
                error: sinCreditos ? 'SIN_CREDITOS' : 'No se pudo verificar tus créditos.',
            }).eq('id', jobId);
            return new Response('credit error', { status: 200 });
        }
        void consumo;

        // OCR + estructuración. Para extractos reales el motor gratuito
        // (pdf-text) no funciona y es lentísimo: vamos directo a mistral-ocr.
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const isPdf = mimeType === 'application/pdf';
        const filePart = isPdf
            ? { type: 'file', file: { filename: 'extracto.pdf', file_data: dataUrl } }
            : { type: 'image_url', image_url: { url: dataUrl } };

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, filePart] }],
                max_tokens: 16000,
                ...(isPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }] } : {}),
            }),
        });

        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        const transactions = text ? parseArray(text) : null;

        if (!transactions) {
            // Devolver el crédito: no hubo resultado utilizable
            await admin.rpc('creditos_acreditar', {
                p_user: userId, p_cantidad: 12, p_motivo: 'ajuste',
                p_referencia: `reembolso:bank_recs:${jobId}`,
                p_vence: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
            });
            await admin.from('ai_jobs').update({
                estado: 'error',
                error: json?.error?.message || 'No se pudieron extraer transacciones del extracto.',
            }).eq('id', jobId);
            return new Response('no data', { status: 200 });
        }

        await admin.from('ai_jobs').update({
            estado: 'listo', resultado: { transactions },
        }).eq('id', jobId);

        return new Response('ok', { status: 200 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error procesando el extracto';
        if (jobId) {
            if (userId) {
                await admin.rpc('creditos_acreditar', {
                    p_user: userId, p_cantidad: 12, p_motivo: 'ajuste',
                    p_referencia: `reembolso:bank_recs:${jobId}`,
                    p_vence: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
                }).then(() => {}, () => {});
            }
            await admin.from('ai_jobs').update({ estado: 'error', error: msg }).eq('id', jobId);
        }
        return new Response('error', { status: 200 });
    }
};
