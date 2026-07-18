import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';
import { shield, unshield } from '@/lib/privacy';

export const maxDuration = 120;

const MAX_TX = 600;

interface BankTx { date: string; description: string; amount: number; reference?: string }
interface LedgerTx { date: string; description: string; debit: number; credit: number; reference?: string }

const SYSTEM_PROMPT = `Eres un auditor contable experto en conciliaciones bancarias colombianas.
Recibirás dos listas numeradas por índice: BANCO (transacciones del extracto bancario) y CONTABLE (movimientos del libro auxiliar).
Tu tarea es cruzarlas: cada grupo de conciliación puede ser 1 a 1, 1 a muchos o muchos a 1
(por ejemplo, un pago de nómina consolidado en el banco puede corresponder a varios registros desagregados en contabilidad, o viceversa).

Criterios de cruce: montos equivalentes (la suma del grupo debe coincidir, tolerancia de $1), fechas cercanas, descripciones y referencias relacionadas.
Si el usuario da INSTRUCCIONES PERSONALIZADAS, tienen prioridad sobre los criterios generales.

Devuelve SOLO un JSON estricto, sin markdown, con este formato:
{
  "matched": [ { "bank": [indices], "ledger": [indices], "note": "explicación breve del cruce (solo si no es obvio)" } ],
  "unmatchedBank": [indices],
  "unmatchedLedger": [indices],
  "notes": "resumen breve de lo que hiciste, en español, mencionando cómo aplicaste las instrucciones del usuario"
}
Reglas:
1. Cada índice de BANCO y de CONTABLE debe aparecer EXACTAMENTE una vez en total (en matched o en unmatched).
2. No inventes índices fuera de rango.
3. Sé conservador: si no hay evidencia razonable de cruce, deja la transacción sin cruzar.`;

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let body: { bankTransactions?: BankTx[]; ledgerTransactions?: LedgerTx[]; instructions?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { bankTransactions, ledgerTransactions, instructions } = body;
    if (!Array.isArray(bankTransactions) || !Array.isArray(ledgerTransactions)) {
        return NextResponse.json({ error: 'bankTransactions y ledgerTransactions son requeridos' }, { status: 400 });
    }
    if (bankTransactions.length > MAX_TX || ledgerTransactions.length > MAX_TX) {
        return NextResponse.json(
            { error: `Máximo ${MAX_TX} transacciones por lista para el cruce con IA` },
            { status: 400 }
        );
    }

    const bankList = bankTransactions
        .map((t, i) => `${i}| ${t.date} | ${t.description} | ${t.amount} | ${t.reference || ''}`)
        .join('\n');
    const ledgerList = ledgerTransactions
        .map((t, i) => `${i}| ${t.date} | ${t.description} | D:${t.debit} C:${t.credit} | ${t.reference || ''}`)
        .join('\n');

    try {
        const ai = getOpenRouter();

        // Privacy Shield: anonimiza PII en las descripciones (nombres de
        // terceros, cédulas, etc.) antes de la IA. El cruce es por índice
        // numérico y modo contable no toca montos, así que nada se rompe.
        const userContent = `INSTRUCCIONES PERSONALIZADAS DEL USUARIO:\n${(instructions || 'Ninguna').slice(0, 2000)}\n\nBANCO (índice| fecha | descripción | monto | referencia):\n${bankList}\n\nCONTABLE (índice| fecha | descripción | débito/crédito | referencia):\n${ledgerList}`;
        const shielded = shield(userContent);

        const completion = await ai.chat.completions.create({
            model: MODELS.RECONCILER,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: shielded.text },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 16000,
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error('La IA no devolvió resultados.');

        const text = unshield(raw, shielded.vault);

        const parsed = parseModelJSON(text) as {
            matched?: { bank: number[]; ledger: number[]; note?: string }[];
            unmatchedBank?: number[];
            unmatchedLedger?: number[];
            notes?: string;
        };

        // Saneamiento: índices válidos y sin duplicados; lo no asignado queda sin cruzar
        const validBank = (i: unknown): i is number => typeof i === 'number' && i >= 0 && i < bankTransactions.length;
        const validLedger = (i: unknown): i is number => typeof i === 'number' && i >= 0 && i < ledgerTransactions.length;
        const usedBank = new Set<number>();
        const usedLedger = new Set<number>();

        const matched = (parsed.matched || [])
            .map(g => ({
                bank: (g.bank || []).filter(validBank).filter(i => !usedBank.has(i) && (usedBank.add(i), true)),
                ledger: (g.ledger || []).filter(validLedger).filter(i => !usedLedger.has(i) && (usedLedger.add(i), true)),
                note: typeof g.note === 'string' ? g.note : undefined,
            }))
            .filter(g => g.bank.length > 0 && g.ledger.length > 0);

        const unmatchedBank = bankTransactions.map((_, i) => i).filter(i => !usedBank.has(i));
        const unmatchedLedger = ledgerTransactions.map((_, i) => i).filter(i => !usedLedger.has(i));

        return NextResponse.json({
            matched,
            unmatchedBank,
            unmatchedLedger,
            notes: typeof parsed.notes === 'string' ? parsed.notes : '',
        });
    } catch (error: unknown) {
        console.error('Reconcile bank error:', error);
        const message = error instanceof Error ? error.message : 'Error en el cruce con IA';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
