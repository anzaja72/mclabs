export interface LineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    /** Descuento del ítem en pesos */
    discount?: number;
    /** Tarifa de IVA/INC del ítem en % (ej. 19) */
    taxRate?: number;
    /** Impuesto del ítem en pesos */
    taxValue?: number;
    totalValue: number;
}

export interface GeneralInfo {
    invoiceNumber: string;
    /** CUFE/CUDE completo de la factura electrónica DIAN */
    cufe?: string;
    issueDate: string;
    dueDate: string;
    paymentMethod: string;
    currency?: string;
}

export interface CustomerInfo {
    name: string;
    idNumber: string;
    address: string;
    city?: string;
    email: string;
}

export interface IssuerInfo {
    companyName: string;
    nit: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
}

export interface Totals {
    subtotal?: number;
    discounts?: number;
    iva?: number;
    inc?: number;
    reteFuente?: number;
    reteIva?: number;
    reteIca?: number;
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
