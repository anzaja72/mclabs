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

Recibirás CONCEPTOS AGRUPADOS de las partidas que NO cruzaron en una conciliación bancaria (cada línea trae: concepto, cuántos movimientos y el valor total) y los saldos. Debes producir el análisis contable profesional POR CONCEPTO.

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
    { "origen": "banco|libros", "indice": numero, "concepto": "texto del concepto", "cantidad": numero, "valor": numero,
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
1. Clasifica TODOS los conceptos recibidos (uno por línea); no inventes ninguno.
2. Los asientos solo para diferencias PERMANENTES (las temporales no se registran).
3. Un asiento por concepto, por el valor TOTAL del grupo.
4. Sé conciso: "explicacion" máximo 1 frase corta.
4. Si no recibes saldos, calcula lo que puedas y marca cuadra=false explicándolo en el resumen.
5. Valores numéricos puros, sin símbolos.`;

interface Partida { description: string; amount?: number; debit?: number; credit?: number; date?: string; reference?: string }

interface Grupo { concepto: string; cantidad: number; total: number; ejemploFecha: string }

/**
 * Agrupa partidas por concepto (quitando números/fechas de la descripción).
 * Un extracto trae decenas de "GMF 4X1000" o "CUOTA MANEJO": al contador le
 * sirve un asiento por concepto, no 111 líneas. Además reduce muchísimo el
 * tamaño de la respuesta de la IA (y con ello el tiempo).
 */
function agrupar(items: Partida[], valor: (p: Partida) => number): Grupo[] {
    const clave = (d: string) =>
        (d || '')
            .toUpperCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\d+/g, ' ')
            .replace(/[^A-ZÑ\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);

    const mapa = new Map<string, Grupo>();
    for (const it of items) {
        const k = clave(it.description) || 'SIN DESCRIPCION';
        const g = mapa.get(k) ?? { concepto: it.description || k, cantidad: 0, total: 0, ejemploFecha: it.date || '' };
        g.cantidad += 1;
        g.total += valor(it);
        mapa.set(k, g);
    }
    return [...mapa.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

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

    // Agrupar por concepto: el contador necesita un asiento por concepto,
    // no una línea por movimiento.
    const gruposBanco = agrupar(unmatchedBank.slice(0, MAX_ITEMS), t => t.amount ?? 0).slice(0, 60);
    const gruposLibros = agrupar(unmatchedLedger.slice(0, MAX_ITEMS), t => (t.debit || 0) - (t.credit || 0)).slice(0, 60);

    const bancoList = gruposBanco
        .map((g, i) => `${i}| ${g.concepto} | ${g.cantidad} movimiento(s) | total ${g.total} | ${g.ejemploFecha}`)
        .join('\n');
    const librosList = gruposLibros
        .map((g, i) => `${i}| ${g.concepto} | ${g.cantidad} movimiento(s) | total ${g.total} | ${g.ejemploFecha}`)
        .join('\n');

    try {
        const ai = getOpenRouter();

        const userContent = `SALDOS:
- Saldo según extracto bancario: ${saldoExtracto ?? 'no suministrado'}
- Saldo según libros: ${saldoLibros ?? 'no suministrado'}

CONCEPTOS DEL EXTRACTO SIN CRUZAR (índice| concepto | # movimientos | valor total | fecha ejemplo):
${bancoList || '(ninguna)'}

CONCEPTOS DE LIBROS SIN CRUZAR (índice| concepto | # movimientos | valor total | fecha ejemplo):
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
            max_tokens: 6000,
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
