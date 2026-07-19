import { InvoiceData } from '@/types/extractor';
import { UserCredits } from '@/types/credits';
import { supabase } from '@/lib/supabase/client';

/**
 * Cliente de los endpoints de IA del servidor. Las claves de OpenRouter
 * viven solo en el servidor; aquí únicamente se envía el archivo y el
 * JWT de la sesión. El descuento de créditos ocurre en el servidor.
 */

export class NeedsPurchaseError extends Error {
    needsPurchase = true as const;
    constructor() {
        super('Sin créditos disponibles');
        this.name = 'NeedsPurchaseError';
    }
}

const getAccessToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autenticado. Inicia sesión nuevamente.');
    return session.access_token;
};

const postAI = async <T>(path: string, body: object): Promise<T & { credits?: UserCredits }> => {
    const token = await getAccessToken();
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    // Si el servidor devolvió HTML (timeout ~26s de Netlify o archivo muy
    // grande), res.json() lanzaría "Unexpected token '<'". Detectarlo y dar
    // un mensaje claro.
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const snippet = (await res.text().catch(() => '')).slice(0, 120);
        if (res.status === 413) {
            throw new Error('El archivo es demasiado grande. Usa un PDF más liviano (menos de ~4 MB).');
        }
        if (res.status === 502 || res.status === 504 || res.status === 408) {
            throw new Error('El análisis tardó demasiado y el servidor lo cortó. Prueba con un extracto más corto o vuelve a intentar.');
        }
        throw new Error(`El servidor devolvió una respuesta inesperada (${res.status}). ${snippet}`);
    }

    const data = await res.json();

    if (res.status === 403 && data.needsPurchase) throw new NeedsPurchaseError();
    if (!res.ok) throw new Error(data.error || 'Error en el servidor de IA');

    return data;
};

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });

export const extractInvoiceData = async (
    base64Data: string,
    mimeType: string,
    fileName: string
): Promise<{ invoice: InvoiceData; credits?: UserCredits }> => {
    const data = await postAI<{ invoice: InvoiceData }>('/api/ai/extract-invoice', {
        base64: base64Data,
        mimeType,
        fileName,
    });
    return { invoice: data.invoice, credits: data.credits };
};

export interface BankTransaction {
    date: string;
    description: string;
    amount: number;
    reference?: string;
}

export interface LedgerTransaction {
    date: string;
    description: string;
    debit: number;
    credit: number;
    reference?: string;
}

/**
 * Extrae el extracto bancario en SEGUNDO PLANO.
 *
 * El OCR de un extracto real tarda ~35s o más y Netlify corta las peticiones
 * normales a ~31s. Por eso el trabajo lo hace una función `-background`
 * (hasta 15 min) y aquí solo consultamos el resultado.
 */
export const extractBankDataFromPDF = async (
    file: File,
    onProgress?: (segundos: number) => void
): Promise<{ transactions: BankTransaction[]; credits?: UserCredits }> => {
    const base64 = await fileToBase64(file);
    const token = await getAccessToken();
    const jobId = crypto.randomUUID();

    const res = await fetch('/.netlify/functions/extract-bank-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, base64, mimeType: file.type || 'application/pdf' }),
    });
    if (res.status !== 202 && !res.ok) {
        throw new Error('No se pudo iniciar el procesamiento del extracto.');
    }

    // Consultar el resultado (RLS: cada quien ve solo sus trabajos)
    const inicio = Date.now();
    const LIMITE_MS = 5 * 60 * 1000;
    while (Date.now() - inicio < LIMITE_MS) {
        await new Promise(r => setTimeout(r, 2500));
        onProgress?.(Math.round((Date.now() - inicio) / 1000));

        const { data } = await supabase
            .from('ai_jobs')
            .select('estado, resultado, error')
            .eq('id', jobId)
            .maybeSingle();

        if (!data) continue;
        if (data.estado === 'listo') {
            const transactions = (data.resultado as { transactions?: BankTransaction[] })?.transactions || [];
            return { transactions };
        }
        if (data.estado === 'error') {
            if (data.error === 'SIN_CREDITOS') throw new NeedsPurchaseError();
            throw new Error(data.error || 'Error procesando el extracto bancario.');
        }
    }
    throw new Error('El procesamiento tardó demasiado. Intenta con un extracto más corto.');
};

export interface AnalisisContable {
    clasificacion: {
        origen: 'banco' | 'libros'; concepto: string; cantidad: number; valor: number;
        tipo: string; naturaleza: 'temporal' | 'permanente'; requiereAjuste: boolean; explicacion: string;
    }[];
    asientos: {
        concepto: string; valor: number;
        debito: { cuenta: string; nombre: string };
        credito: { cuenta: string; nombre: string };
    }[];
    totales?: Record<string, number>;
    /** Costos y gastos bancarios desagregados, consolidados en un total. */
    costosBancarios?: {
        conceptos: { concepto: string; cantidad: number; valor: number }[];
        total: number;
        cuentaSugerida?: string;
    };
    resumen: string;
    alertas: string[];
}

/**
 * Análisis contable colombiano de las partidas sin cruzar: clasifica cada
 * concepto (diferencia temporal vs. permanente) y propone los asientos con
 * cuentas PUC. Corre en segundo plano (la respuesta es larga).
 */
export const analizarConciliacion = async (
    unmatchedBank: unknown[],
    unmatchedLedger: unknown[],
    onProgress?: (segundos: number) => void
): Promise<AnalisisContable> => {
    const token = await getAccessToken();
    const jobId = crypto.randomUUID();

    const res = await fetch('/.netlify/functions/analizar-conciliacion-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, unmatchedBank, unmatchedLedger }),
    });
    if (res.status !== 202 && !res.ok) throw new Error('No se pudo iniciar el análisis contable.');

    const inicio = Date.now();
    while (Date.now() - inicio < 5 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 2500));
        onProgress?.(Math.round((Date.now() - inicio) / 1000));
        const { data } = await supabase
            .from('ai_jobs').select('estado, resultado, error').eq('id', jobId).maybeSingle();
        if (!data) continue;
        if (data.estado === 'listo') {
            const r = (data.resultado || {}) as Partial<AnalisisContable>;
            return {
                clasificacion: r.clasificacion || [],
                asientos: r.asientos || [],
                totales: r.totales,
                costosBancarios: r.costosBancarios,
                resumen: r.resumen || '',
                alertas: r.alertas || [],
            };
        }
        if (data.estado === 'error') throw new Error(data.error || 'Error en el análisis contable.');
    }
    throw new Error('El análisis contable tardó demasiado.');
};

export interface AIReconcileResult {
    matched: { bank: number[]; ledger: number[]; note?: string }[];
    unmatchedBank: number[];
    unmatchedLedger: number[];
    notes: string;
}

export const reconcileBankWithAI = async (
    bankTransactions: BankTransaction[],
    ledgerTransactions: LedgerTransaction[],
    instructions: string
): Promise<AIReconcileResult> =>
    postAI<AIReconcileResult>('/api/ai/reconcile-bank', {
        bankTransactions,
        ledgerTransactions,
        instructions,
    });

export interface DianAdjustment {
    nit: string;
    tipo: string;
    estado?: string;
    nota?: string;
}

export const reconcileDianWithAI = async (
    results: { nit: string; tipo: string; dianTotal: number; dianDocs: number; contableTotal: number; diferencia: number; estado: string }[],
    instructions: string
): Promise<{ adjustments: DianAdjustment[]; summary: string }> =>
    postAI<{ adjustments: DianAdjustment[]; summary: string }>('/api/ai/reconcile-dian', {
        results,
        instructions,
    });

export interface FinancialKPI {
    label: string;
    value: string;
    trend: 'up' | 'down' | 'neutral';
    comment: string;
}

export interface FinancialInsight {
    title: string;
    explanation: string;
    action: string;
}

export interface FinancialAnalysis {
    title: string;
    kpis: FinancialKPI[];
    categoryData: { name: string; value: number }[];
    barData: { name: string; amount: number }[];
    insights: FinancialInsight[];
    summary: string;
}

export const analyzeFinancials = async (
    input: { rows?: Record<string, unknown>[]; file?: File; instructions?: string }
): Promise<{ analysis: FinancialAnalysis; credits?: UserCredits }> => {
    const payload: Record<string, unknown> = { instructions: input.instructions || '' };
    if (input.rows?.length) {
        payload.rows = input.rows;
    } else if (input.file) {
        payload.base64 = await fileToBase64(input.file);
        payload.mimeType = input.file.type || 'application/pdf';
        payload.fileName = input.file.name;
    }
    const data = await postAI<{ analysis: FinancialAnalysis }>('/api/ai/analyze-financials', payload);
    return { analysis: data.analysis, credits: data.credits };
};
