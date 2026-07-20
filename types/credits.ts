export type ToolType = 'bank_recs' | 'conciliator' | 'dashboards' | 'extractor';

export interface UserCredits {
    id: string;
    user_id: string;
    bank_recs_credits: number;
    conciliator_credits: number;
    dashboards_credits: number;
    extractor_credits: number;
    /** Saldo real de la billetera unificada (créditos MC) */
    saldo?: number;
    updated_at: string;
}

// Credit column mapping
export const TOOL_CREDIT_COLUMN: Record<ToolType, keyof UserCredits> = {
    bank_recs: 'bank_recs_credits',
    conciliator: 'conciliator_credits',
    dashboards: 'dashboards_credits',
    extractor: 'extractor_credits',
};

// Credits given per package purchase
export const CREDIT_PACKAGES = {
    // Full package: $100,000 COP — all 4 tools
    FULL: {
        price_cop: 100000,
        bank_recs_credits: 2,
        conciliator_credits: 2,
        dashboards_credits: 2,
        extractor_credits: 30,
        label: 'Paquete Completo',
        description: 'Incluye créditos para las 4 herramientas',
    },
    // Individual packages: $50,000 COP — single tool
    BANK_RECS: {
        price_cop: 50000,
        bank_recs_credits: 2,
        conciliator_credits: 0,
        dashboards_credits: 0,
        extractor_credits: 0,
        label: 'Paquete Bancario',
        description: '2 conciliaciones bancarias',
    },
    CONCILIATOR: {
        price_cop: 50000,
        bank_recs_credits: 0,
        conciliator_credits: 2,
        dashboards_credits: 0,
        extractor_credits: 0,
        label: 'Paquete DIAN',
        description: '2 conciliaciones fiscales',
    },
    DASHBOARDS: {
        price_cop: 50000,
        bank_recs_credits: 0,
        conciliator_credits: 0,
        dashboards_credits: 2,
        extractor_credits: 0,
        label: 'Paquete Tableros',
        description: '2 análisis de tableros',
    },
    EXTRACTOR: {
        price_cop: 50000,
        bank_recs_credits: 0,
        conciliator_credits: 0,
        dashboards_credits: 0,
        extractor_credits: 30,
        label: 'Paquete Extractor IA',
        description: '30 extracciones de facturas',
    },
} as const;

export type PackageType = keyof typeof CREDIT_PACKAGES;

// ============ Billetera unificada (Wompi) ============
// Paquetes MC Pack: a mayor paquete, menor precio por crédito.
// Fuente de verdad para el webhook: tabla `paquetes` en Supabase.
export type PackId = 'p100' | 'p200' | 'p500';

export const PACKS: Record<PackId, {
    label: string;
    precio_cop: number;
    creditos: number;
    precioPorCredito: string;
    wompiUrl: string;
    descripcion: string;
    destacado?: boolean;
}> = {
    p100: {
        label: 'MC Pack 100',
        precio_cop: 100000,
        creditos: 100,
        precioPorCredito: '$1.000',
        wompiUrl: 'https://checkout.wompi.co/l/Z103wm',
        descripcion: 'Para pruebas u operaciones esporádicas: un lote pequeño de facturas o una declaración puntual.',
    },
    p200: {
        label: 'MC Pack 200',
        precio_cop: 200000,
        creditos: 250,
        precioPorCredito: '$800',
        wompiUrl: 'https://checkout.wompi.co/l/mOxem4',
        descripcion: 'La operación mensual estándar: conciliaciones bancarias y DIAN mes a mes con volumen moderado de facturas.',
        destacado: true,
    },
    p500: {
        label: 'MC Pack 500',
        precio_cop: 500000,
        creditos: 715,
        precioPorCredito: '$699',
        wompiUrl: 'https://checkout.wompi.co/l/eLSGKl',
        descripcion: 'Alta demanda: contadores y firmas que gestionan varios clientes, conciliaciones masivas y múltiples declaraciones.',
    },
};
