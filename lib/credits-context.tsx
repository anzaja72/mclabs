'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { UserCredits, ToolType, PackageType } from '@/types/credits';

interface CreditsContextType {
    credits: UserCredits | null;
    loading: boolean;
    refreshCredits: () => Promise<void>;
    useCredit: (tool: ToolType) => Promise<{ success: boolean; needsPurchase?: boolean; error?: string }>;
    purchasePackage: (packageType: PackageType) => Promise<void>;
    getToolCredits: (tool: ToolType) => number;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export function CreditsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [credits, setCredits] = useState<UserCredits | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshCredits = useCallback(async () => {
        if (!user) {
            setCredits(null);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`/api/credits?userId=${user.id}`);
            if (res.ok) {
                const data = await res.json();
                setCredits(data);
            }
        } catch (err) {
            console.error('Error fetching credits:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        refreshCredits();
    }, [refreshCredits]);

    const useCredit = async (tool: ToolType) => {
        if (!user) return { success: false, error: 'No autenticado' };

        try {
            const res = await fetch('/api/credits/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, tool }),
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
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    };

    const purchasePackage = async (packageType: PackageType) => {
        if (!user) return;

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packageType,
                    userId: user.id,
                    userEmail: user.email,
                }),
            });

            const data = await res.json();

            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            console.error('Error creating checkout session:', err);
        }
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
        <CreditsContext.Provider value={{ credits, loading, refreshCredits, useCredit, purchasePackage, getToolCredits }}>
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
