import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { getOpenRouter, MODELS, parseModelJSON } from '@/lib/ai-server';
import { shield, unshield } from '@/lib/privacy';

export const maxDuration = 120;

const MAX_ITEMS = 300;

/**
 * Análisis contable de la conciliación bancaria (metodología colombiana).
 *
 * Toma las partidas que NO cruzaron y produce lo que un contador necesita:
 *  1. Clasificación de cada partida (diferencia temporal vs. permanente)
 *  2. Estado de conciliación formal (saldos ajustados que deben cuadrar)
 *  3. Asientos contables sugeridos con cuentas PUC
 *
 * Marco: Decreto 2649/1993, NIIF (NIC 7), Estatuto Tributario, PUC.
 */
const SYSTEM_PROMPT = `Eres un contador público colombiano experto en conciliaciones bancarias, con dominio del PUC, el Decreto 2649 de 1993, NIIF (NIC 7) y el Estatuto Tributario.

Recibirás las partidas que NO cruzaron en una conciliación bancaria y los saldos. Debes producir el análisis contable profesional.

CLASIFICACIÓN OBLIGATORIA de cada partida:

A) Partidas del EXTRACTO no registradas en libros:
   - "nota_debito_no_registrada": comisiones, cuotas de manejo, GMF/4x1000, seguros, intereses de mora, portes. → PERMANENTE, requiere ajuste.
   - "nota_credito_no_registrada": rendimientos financieros, abono de intereses, reintegros. → PERMANENTE, requiere ajuste.
   - "cheque_devuelto": devoluciones por fondos insuficientes. → PERMANENTE, requiere ajuste.
   - "error_banco": doble débito, acreditación errónea. → TEMPORAL, reclamar al banco.

B) Partidas de LIBROS no reflejadas en el extracto:
   - "deposito_en_transito": consignaciones registradas sin reflejar aún. → TEMPORAL, no requiere ajuste.
   - "cheque_girado_no_cobrado": cheques emitidos no debitados aún. → TEMPORAL, no requiere ajuste.
   - "error_registro": monto o cuenta equivocada en libros. → PERMANENTE, requiere ajuste.

CUENTAS PUC para los asientos sugeridos:
   - 110505 Banco (moneda nacional)
   - 530505 Gastos financieros - comisiones / 530595 GMF (4x1000)
   - 421005 Ingresos financieros - rendimientos
   - 130505 Clientes (cheques devueltos)
   - 236540 Retención en la fuente (si aplica)

Devuelve SOLO un JSON estricto, sin markdown:
{
  "clasificacion": [
    { "origen": "banco|libros", "indice": numero, "descripcion": "texto original", "valor": numero,
      "tipo": "nota_debito_no_registrada|nota_credito_no_registrada|cheque_devuelto|error_banco|deposito_en_transito|cheque_girado_no_cobrado|error_registro",
      "naturaleza": "temporal|permanente", "requiereAjuste": true|false, "explicacion": "1 frase clara" }
  ],
  "estadoConciliacion": {
    "saldoExtracto": numero, "depositosEnTransito": numero, "chequesGiradosNoCobrados": numero,
    "notasCreditoEnTransito": numero, "notasDebitoEnTransito": numero, "saldoAjustadoExtracto": numero,
    "saldoLibros": numero, "notasCreditoNoRegistradas": numero, "notasDebitoNoRegistradas": numero,
    "correccionesErrores": numero, "saldoAjustadoLibros": numero,
    "diferencia": numero, "cuadra": true|false
  },
  "asientos": [
    { "concepto": "texto", "valor": numero,
      "debito": { "cuenta": "530505", "nombre": "Gastos financieros - comisiones" },
      "credito": { "cuenta": "110505", "nombre": "Banco moneda nacional" },
      "soporte": "referencia del movimiento" }
  ],
  "resumen": "diagnóstico en 3-4 frases: qué explica la diferencia y qué debe hacer el contador",
  "alertas": ["hallazgos que requieren atención (cheques antiguos, posibles errores, partidas inusuales)"]
}

Reglas:
1. Clasifica TODAS las partidas recibidas; no inventes ninguna.
2. Los asientos solo para diferencias PERMANENTES (las temporales no se registran).
3. Agrupa conceptos repetidos (ej. varios 4x1000) en un solo asiento por el total.
4. Si no recibes saldos, calcula lo que puedas y marca cuadra=false explicándolo en el resumen.
5. Valores numéricos puros, sin símbolos.`;

interface Partida { description: string; amount?: number; debit?: number; credit?: number; date?: string; reference?: string }

export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    let body: {
        unmatchedBank?: Partida[];
        unmatchedLedger?: Partida[];
        saldoExtracto?: number;
        saldoLibros?: number;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { unmatchedBank = [], unmatchedLedger = [], saldoExtracto, saldoLibros } = body;
    if (unmatchedBank.length === 0 && unmatchedLedger.length === 0) {
        return NextResponse.json({ error: 'No hay partidas por analizar' }, { status: 400 });
    }

    const bancoList = unmatchedBank.slice(0, MAX_ITEMS)
        .map((t, i) => `${i}| ${t.date || ''} | ${t.description} | ${t.amount ?? 0} | ${t.reference || ''}`)
        .join('\n');
    const librosList = unmatchedLedger.slice(0, MAX_ITEMS)
        .map((t, i) => `${i}| ${t.date || ''} | ${t.description} | D:${t.debit ?? 0} C:${t.credit ?? 0} | ${t.reference || ''}`)
        .join('\n');

    try {
        const ai = getOpenRouter();

        const userContent = `SALDOS:
- Saldo según extracto bancario: ${saldoExtracto ?? 'no suministrado'}
- Saldo según libros: ${saldoLibros ?? 'no suministrado'}

PARTIDAS DEL EXTRACTO SIN CRUZAR (índice| fecha | descripción | valor | referencia):
${bancoList || '(ninguna)'}

PARTIDAS DE LIBROS SIN CRUZAR (índice| fecha | descripción | débito/crédito | referencia):
${librosList || '(ninguna)'}`;

        // Privacy Shield: oculta nombres/cédulas de terceros, nunca los montos
        const shielded = shield(userContent);

        const completion = await ai.chat.completions.create({
            model: MODELS.RECONCILER,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: shielded.text },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 12000,
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error('La IA no devolvió el análisis.');

        const parsed = parseModelJSON<Record<string, unknown>>(unshield(raw, shielded.vault));

        return NextResponse.json({
            clasificacion: Array.isArray(parsed.clasificacion) ? parsed.clasificacion : [],
            estadoConciliacion: parsed.estadoConciliacion ?? null,
            asientos: Array.isArray(parsed.asientos) ? parsed.asientos : [],
            resumen: typeof parsed.resumen === 'string' ? parsed.resumen : '',
            alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
        });
    } catch (error: unknown) {
        console.error('Analizar conciliación error:', error);
        const message = error instanceof Error ? error.message : 'Error al analizar la conciliación';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
