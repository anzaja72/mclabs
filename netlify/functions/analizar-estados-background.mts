/**
 * Análisis IA de los Estados Financieros — SEGUNDO PLANO.
 *
 * Los estados (Balance General + Estado de Resultados) se construyen
 * determinísticamente en el cliente por código PUC; esta función solo aporta
 * la capa de análisis profesional: diagnóstico, alertas, notas NIC 1 y
 * recomendaciones. Cobra el crédito de 'dashboards' (idempotente por jobId).
 *
 * Marco: NIC 1, NIIF PYMES, Decreto 2420/2015, Estatuto Tributario.
 */
import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const MODEL = 'minimax/minimax-m3';
const COSTO_DASHBOARDS = 12;

const SYSTEM_PROMPT = `Eres un contador público y analista financiero senior colombiano (NIC 1, NIIF PYMES, Decreto 2420/2015, Estatuto Tributario, PUC).

Recibirás el Balance General y el Estado de Resultados ya construidos desde el balance de prueba, con sus totales, ratios y validación de cuadre. Tu trabajo es el ANÁLISIS PROFESIONAL, en lenguaje claro para un empresario no financiero:

Devuelve SOLO JSON estricto, sin markdown:
{
 "diagnostico": "4-6 frases: salud financiera general, liquidez, endeudamiento, rentabilidad, y qué significan para el negocio",
 "alertas": ["hallazgos que requieren atención inmediata: descuadres, ratios fuera de rango, concentraciones de riesgo, pérdidas, capital de trabajo negativo, etc."],
 "fortalezas": ["aspectos positivos concretos con su cifra"],
 "recomendaciones": [{"titulo":"acción corta","detalle":"qué hacer exactamente y por qué, 1-2 frases"}],
 "notas": [{"titulo":"Nota sugerida (NIC 1)","contenido":"texto breve de la revelación sugerida"}],
 "interpretacionRatios": [{"ratio":"nombre","valor":"X%","interpretacion":"1 frase práctica con benchmark colombiano si aplica"}]
}

Reglas:
1. Sé específico: cita cifras y porcentajes del material recibido.
2. Si el balance NO cuadra, esa es la alerta #1: explica el monto y las causas probables (cuentas omitidas, signo invertido, depreciación mal calculada).
3. Benchmarks de referencia Colombia: razón corriente sana 1.2-2.0; endeudamiento <60%; margen neto pyme comercial 3-7%.
4. Máximo 5 alertas, 4 fortalezas, 5 recomendaciones, 4 notas.
5. Números con formato colombiano en los textos ($1.234.567).
6. NUNCA uses comillas dobles dentro de los textos de los campos (usa comillas simples si necesitas citar).`;

function parseObj(text: string): Record<string, unknown> | null {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { return JSON.parse(clean); } catch { /* buscar objeto balanceado */ }
    const start = clean.indexOf('{');
    if (start === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
        const c = clean[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
            try { return JSON.parse(clean.slice(start, i + 1)); } catch { return null; }
        }
    }
    return null;
}

export default async (req: Request, _context: Context) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let jobId: string | null = null;
    let userId: string | null = null;

    try {
        const { jobId: jid, resumen } = await req.json();
        jobId = jid;

        const auth = req.headers.get('authorization') || '';
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        if (!token || !jobId || !resumen) return new Response('bad request', { status: 400 });

        const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        const { data: userData } = await anon.auth.getUser(token);
        if (!userData?.user) return new Response('unauthorized', { status: 401 });
        userId = userData.user.id;

        await admin.from('ai_jobs').upsert({
            id: jobId, user_id: userId, tipo: 'analisis_estados', estado: 'procesando',
        });

        // Cobrar el crédito de tableros (idempotente por jobId)
        const { error: errConsumo } = await admin.rpc('creditos_consumir', {
            p_user: userId, p_herramienta: 'dashboards', p_referencia: `uso:dashboards:${jobId}`,
        });
        if (errConsumo) {
            const sinCreditos = (errConsumo.message || '').includes('SIN_CREDITOS');
            await admin.from('ai_jobs').update({
                estado: 'error',
                error: sinCreditos ? 'SIN_CREDITOS' : 'No se pudo verificar tus créditos.',
            }).eq('id', jobId);
            return new Response('credit error', { status: 200 });
        }

        // El JSON del modelo falla de forma intermitente (comillas mal escapadas):
        // reintentar una vez suele resolverlo y aquí hay tiempo de sobra.
        let parsed: Record<string, unknown> | null = null;
        let lastApiError = '';
        for (let intento = 0; intento < 2 && !parsed; intento++) {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: String(resumen).slice(0, 14000) },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 8000,
            }),
        });

        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        parsed = text ? parseObj(text) : null;
        if (!parsed) lastApiError = json?.error?.message || '';
        }

        if (!parsed) {
            await admin.rpc('creditos_acreditar', {
                p_user: userId, p_cantidad: COSTO_DASHBOARDS, p_motivo: 'ajuste',
                p_referencia: `reembolso:dashboards:${jobId}`,
                p_vence: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
            });
            await admin.from('ai_jobs').update({
                estado: 'error',
                error: lastApiError || 'No se pudo generar el análisis financiero.',
            }).eq('id', jobId);
            return new Response('no data', { status: 200 });
        }

        await admin.from('ai_jobs').update({ estado: 'listo', resultado: parsed }).eq('id', jobId);
        return new Response('ok', { status: 200 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error en el análisis financiero';
        if (jobId) {
            if (userId) {
                await admin.rpc('creditos_acreditar', {
                    p_user: userId, p_cantidad: COSTO_DASHBOARDS, p_motivo: 'ajuste',
                    p_referencia: `reembolso:dashboards:${jobId}`,
                    p_vence: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
                }).then(() => {}, () => {});
            }
            await admin.from('ai_jobs').update({ estado: 'error', error: msg }).eq('id', jobId);
        }
        return new Response('error', { status: 200 });
    }
};
