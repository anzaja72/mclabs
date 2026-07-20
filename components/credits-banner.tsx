'use client'

import { Zap, ShoppingCart } from 'lucide-react';
import { useCredits } from '@/lib/credits-context';
import { ToolType } from '@/types/credits';

interface CreditsBannerProps {
    tool: ToolType;
    toolLabel: string;
}

export function CreditsBanner({ tool, toolLabel }: CreditsBannerProps) {
    const { credits, getToolCredits, loading, purchasePackage } = useCredits();

    if (loading) return null;

    const remaining = getToolCredits(tool); // usos disponibles con el saldo actual
    const saldo = credits?.saldo ?? 0;
    const isLow = remaining <= 1;
    const isEmpty = remaining === 0;

    return (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all ${
            isEmpty
                ? 'bg-red-50 border-red-200 text-red-700'
                : isLow
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
            <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${isEmpty ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-blue-500'}`} />
                <span className="font-medium">
                    {isEmpty
                        ? `Sin créditos para ${toolLabel}`
                        : `Saldo: ${saldo} créditos · alcanza para ${remaining} uso${remaining !== 1 ? 's' : ''} de ${toolLabel}`
                    }
                </span>
            </div>
            {(isEmpty || isLow) && (
                <button
                    onClick={() => purchasePackage('p200')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        isEmpty
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                >
                    <ShoppingCart className="w-3 h-3" />
                    Comprar Créditos
                </button>
            )}
        </div>
    );
}
