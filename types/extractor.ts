export interface LineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
}

export interface GeneralInfo {
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    paymentMethod: string;
}

export interface CustomerInfo {
    name: string;
    idNumber: string;
    address: string;
    email: string;
}

export interface IssuerInfo {
    companyName: string;
    nit: string;
}

export interface Totals {
    grandTotal: number;
}

export interface InvoiceData {
    id: string;
    fileName: string;
    generalInfo: GeneralInfo;
    customerInfo: CustomerInfo;
    issuerInfo: IssuerInfo;
    lineItems: LineItem[];
    totals: Totals;
    processedAt: string;
}

export enum ProcessingStatus {
    IDLE = 'IDLE',
    LOADING = 'LOADING',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}
