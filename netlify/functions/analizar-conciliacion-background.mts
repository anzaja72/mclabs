/**
 * Análisis contable de la conciliación bancaria — SEGUNDO PLANO.
 *
 * Clasificar decenas de conceptos + proponer asientos genera una respuesta
 * larga (>31s), que es justo el corte de Netlify. Igual que la extracción,
 * corre como función `-background` y deja el resultado en `ai_jobs`.
 *
 * Metodología: conciliación bancaria colombiana (Decreto 2649/1993, NIC 7,
 * Estatuto Tributario, PUC).
 */
import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const MODEL = 'minimax/minimax-m3';

const SYSTEM_PROMPT = `Eres un contador público colombiano experto en conciliaciones bancarias (PUC, Decreto 2649 de 1993, NIC 7, Estatuto Tributario).

Recibirás CONCEPTOS AGRUPADOS de las partidas que NO cruzaron (concepto, # de movimientos y valor total). Analiza POR CONCEPTO.

CLASIFICACIÓN:
A) Del EXTRACTO, no registradas en libros:
   - "nota_debito_no_registrada": comisiones, cuota de manejo, GMF/4x1000, IVA, seguros, portes → PERMANENTE, requiere ajuste.
   - "nota_credito_no_registrada": rendimientos, abono de intereses, reintegros → PERMANENTE, requiere ajuste.
   - "cheque_devuelto": devolución por fondos → PERMANENTE, requiere ajuste.
   - "error_banco": doble débito o abono errado → TEMPORAL, reclamar al banco.
B) De LIBROS, no reflejadas en el extracto:
   - "deposito_en_transito": consignación registrada sin reflejar → TEMPORAL, sin ajuste.
   - "cheque_girado_no_cobrado": cheque emitido no debitado → TEMPORAL, sin ajuste.
   - "error_registro": monto/cuenta equivocada en libros → PERMANENTE, requiere ajuste.

CUENTAS PUC: 110505 Banco · 530505 Gastos financieros-comisiones · 530595 GMF 4x1000 · 421005 Ingresos financieros-rendimientos · 130505 Clientes · 236540 Retención en la fuente · 240805 IVA descontable.

Devuelve SOLO JSON estricto, sin markdown:
{
 "clasificacion":[{"origen":"banco|libros","concepto":"...","cantidad":n,"valor":n,"tipo":"...","naturaleza":"temporal|permanente","requiereAjuste":true|false,"explicacion":"1 frase"}],
 "asientos":[{"concepto":"...","valor":n,"debito":{"cuenta":"530505","nombre":"..."},"credito":{"cuenta":"110505","nombre":"..."}}],
 "totales":{"notasDebitoNoRegistradas":n,"notasCreditoNoRegistradas":n,"depositosEnTransito":n,"chequesGiradosNoCobrados":n,"totalAjustesLibros":n},
 "resumen":"3-4 frases: qué explica la diferencia y qué debe hacer el contador",
 "alertas":["hallazgos que requieren atención"]
}

Reglas: clasifica TODOS los conceptos recibidos; asientos SOLO para permanentes (uno por concepto, por el total); explicaciones de 1 frase; números puros sin símbolos.`;

interface Partida { description?: string; amount?: number; debit?: number; credit?: number; date?: string }

function agrupar(items: Partida[], valor: (p: Partida) => number) {
    const clave = (d: string) =>
        (d || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\d+/g, ' ').replace(/[^A-ZÑ\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const mapa = new Map<string, { concepto: string; cantidad: number; total: number; fecha: string }>();
    for (const it of items) {
        const k = clave(it.description || '') || 'SIN DESCRIPCION';
        const g = mapa.get(k) ?? { concepto: it.description || k, cantidad: 0, total: 0, fecha: it.date || '' };
        g.cantidad += 1; g.total += valor(it);
        mapa.set(k, g);
    }
    return [...mapa.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

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

    try {
        const { jobId: jid, unmatchedBank = [], unmatchedLedger = [], saldoExtracto, saldoLibros } = await req.json();
        jobId = jid;

        const auth = req.headers.get('authorization') || '';
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        if (!token || !jobId) return new Response('bad request', { status: 400 });

        const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        const { data: userData } = await anon.auth.getUser(token);
        if (!userData?.user) return new Response('unauthorized', { status: 401 });

        await admin.from('ai_jobs').upsert({
            id: jobId, user_id: userData.user.id, tipo: 'analisis_conciliacion', estado: 'procesando',
        });

        const gBanco = agrupar(unmatchedBank, (t: Partida) => t.amount ?? 0).slice(0, 40);
        const gLibros = agrupar(unmatchedLedger, (t: Partida) => (t.debit || 0) - (t.credit || 0)).slice(0, 40);

        const userContent = `SALDOS:
- Saldo según extracto: ${saldoExtracto ?? 'no suministrado'}
- Saldo según libros: ${saldoLibros ?? 'no suministrado'}

CONCEPTOS DEL EXTRACTO SIN CRUZAR (concepto | # movimientos | valor total):
${gBanco.map(g => `${g.concepto} | ${g.cantidad} | ${g.total}`).join('\n') || '(ninguno)'}

CONCEPTOS DE LIBROS SIN CRUZAR (concepto | # movimientos | valor total):
${gLibros.map(g => `${g.concepto} | ${g.cantidad} | ${g.total}`).join('\n') || '(ninguno)'}`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 12000,
            }),
        });

        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        const parsed = text ? parseObj(text) : null;

        if (!parsed) {
            await admin.from('ai_jobs').update({
                estado: 'error',
                error: json?.error?.message || 'No se pudo generar el análisis contable.',
            }).eq('id', jobId);
            return new Response('no data', { status: 200 });
        }

        await admin.from('ai_jobs').update({ estado: 'listo', resultado: parsed }).eq('id', jobId);
        return new Response('ok', { status: 200 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error en el análisis contable';
        if (jobId) await admin.from('ai_jobs').update({ estado: 'error', error: msg }).eq('id', jobId);
        return new Response('error', { status: 200 });
    }
};
