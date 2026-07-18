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

export const extractBankDataFromPDF = async (
    file: File
): Promise<{ transactions: BankTransaction[]; credits?: UserCredits }> => {
    const base64 = await fileToBase64(file);
    const data = await postAI<{ transactions: BankTransaction[] }>('/api/ai/extract-bank', {
        base64,
        mimeType: file.type || 'application/pdf',
    });
    return { transactions: data.transactions, credits: data.credits };
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
