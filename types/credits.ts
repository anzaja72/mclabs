export type ToolType = 'bank_recs' | 'conciliator' | 'dashboards' | 'extractor';

export interface UserCredits {
    id: string;
    user_id: string;
    bank_recs_credits: number;
    conciliator_credits: number;
    dashboards_credits: number;
    extractor_credits: number;
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
