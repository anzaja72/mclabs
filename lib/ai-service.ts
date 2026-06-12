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
