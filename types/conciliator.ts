export interface FileState {
    contable: File | null;
    dian: File | null;
}

export interface DataState {
    contable: Map<string, any> | null;
    dian: Map<string, any> | null;
    contableCount: number;
    dianCount: number;
}

export interface ResultItem {
    nit: string;
    tipo: string;
    dianTotal: number;
    dianDocs: number;
    contableTotal: number;
    diferencia: number;
    estado: string;
    detallesDian: any[];
    detallesContable: any[];
    debugContable: any;
    [key: string]: any;
}

export const TIPO_CLASIFICACION = {
    VENTA: 'VENTA',
    COMPRA: 'COMPRA',
    NOMINA: 'NOMINA',
    OTRO: 'OTRO'
};
