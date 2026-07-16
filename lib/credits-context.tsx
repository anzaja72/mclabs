'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { UserCredits, ToolType, PackId, PACKS } from '@/types/credits';

interface CreditsContextType {
    credits: UserCredits | null;
    loading: boolean;
    refreshCredits: () => Promise<void>;
    useCredit: (tool: ToolType) => Promise<{ success: boolean; needsPurchase?: boolean; error?: string }>;
    purchasePackage: (packId: PackId) => Promise<void>;
    getToolCredits: (tool: ToolType) => number;
    setCredits: (credits: UserCredits) => void;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export function CreditsProvider({ children }: { children: ReactNode }) {
    const { user, session } = useAuth();
    const [credits, setCredits] = useState<UserCredits | null>(null);
    const [loading, setLoading] = useState(true);

    const authHeaders = useCallback((): Record<string, string> => ({
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    }), [session]);

    const refreshCredits = useCallback(async () => {
        if (!user || !session) {
            setCredits(null);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/credits', { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setCredits(data);
            }
        } catch (err) {
            console.error('Error fetching credits:', err);
        } finally {
            setLoading(false);
        }
    }, [user, session, authHeaders]);

    useEffect(() => {
        refreshCredits();
    }, [refreshCredits]);

    const useCredit = async (tool: ToolType) => {
        if (!user) return { success: false, error: 'No autenticado' };

        try {
            const res = await fetch('/api/credits/use', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ tool }),
            });

            const data = await res.json();

            if (res.status === 403) {
                return { success: false, needsPurchase: true, error: 'Sin créditos' };
            }

            if (!res.ok) {
                return { success: false, error: data.error };
            }

            // Update local credits
            if (data.credits) {
                setCredits(data.credits);
            }

            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error al usar crédito';
            return { success: false, error: message };
        }
    };

    const purchasePackage = async (packId: PackId) => {
        // Pago por link de Wompi: al terminar, Wompi redirige a
        // /compra/confirmacion?id=<tx> y allí se acreditan los créditos.
        const pack = PACKS[packId];
        if (pack) window.location.href = pack.wompiUrl;
    };

    const getToolCredits = (tool: ToolType): number => {
        if (!credits) return 0;
        const map: Record<ToolType, number> = {
            bank_recs: credits.bank_recs_credits,
            conciliator: credits.conciliator_credits,
            dashboards: credits.dashboards_credits,
            extractor: credits.extractor_credits,
        };
        return map[tool] ?? 0;
    };

    return (
        <CreditsContext.Provider value={{ credits, loading, refreshCredits, useCredit, purchasePackage, getToolCredits, setCredits }}>
            {children}
        </CreditsContext.Provider>
    );
}

export function useCredits() {
    const context = useContext(CreditsContext);
    if (context === undefined) {
        throw new Error('useCredits must be used within a CreditsProvider');
    }
    return context;
}
