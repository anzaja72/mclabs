'use client'

import { X, ShoppingCart, Zap, Crown } from 'lucide-react';
import { useCredits } from '@/lib/credits-context';
import { PackId, PACKS } from '@/types/credits';

interface PaywallModalProps {
    toolName: string;
    onClose: () => void;
}

const fmtCOP = (n: number) => `$${n.toLocaleString('es-CO')}`;

export function PaywallModal({ toolName, onClose }: PaywallModalProps) {
    const { purchasePackage } = useCredits();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in">

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-8 text-white relative overflow-hidden">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X className="w-5 h-5 text-white" />
                    </button>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-5 h-5 text-yellow-300" />
                            <span className="text-sm font-bold uppercase tracking-wider text-blue-200">Créditos agotados</span>
                        </div>
                        <h2 className="text-2xl font-black mb-2">
                            Necesitas créditos para {toolName}
                        </h2>
                        <p className="text-blue-100 text-sm">
                            Un solo saldo de créditos MC sirve para todas las herramientas.
                            Pago seguro con Wompi (PSE, Nequi, tarjetas).
                        </p>
                    </div>
                    <div className="absolute -right-8 -bottom-8 opacity-10">
                        <ShoppingCart className="w-40 h-40" />
                    </div>
                </div>

                {/* Packs */}
                <div className="p-8 space-y-3">
                    {(Object.keys(PACKS) as PackId[]).map((packId) => {
                        const pack = PACKS[packId];
                        return (
                            <div
                                key={packId}
                                className={`rounded-2xl p-5 cursor-pointer transition-all group relative ${
                                    pack.destacado
                                        ? 'border-2 border-blue-300 bg-blue-50/50 hover:border-blue-500 hover:shadow-lg'
                                        : 'border border-slate-200 hover:border-blue-300 hover:shadow-md'
                                }`}
                                onClick={() => purchasePackage(packId)}
                            >
                                {pack.destacado && (
                                    <div className="absolute -top-3 left-6">
                                        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                                            <Crown className="w-3 h-3" /> Recomendado
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center gap-4">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900">
                                            {pack.label}
                                            <span className="ml-2 text-sm font-bold text-blue-600">
                                                {pack.creditos} créditos
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">{pack.descripcion}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-2xl font-black text-blue-600">{fmtCOP(pack.precio_cop)}</p>
                                        <p className="text-xs text-slate-500">{pack.precioPorCredito}/crédito</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <p className="text-[11px] text-slate-400 text-center pt-2">
                        Los créditos vencen a los 12 meses. Al terminar el pago volverás
                        automáticamente y tu saldo quedará acreditado.
                    </p>
                </div>
            </div>
        </div>
    );
}
