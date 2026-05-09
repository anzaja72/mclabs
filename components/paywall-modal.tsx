'use client'

import { X, ShoppingCart, Zap, Crown, Sparkles } from 'lucide-react';
import { useCredits } from '@/lib/credits-context';
import { PackageType, CREDIT_PACKAGES } from '@/types/credits';
import { Button } from '@/components/ui/button';

interface PaywallModalProps {
    toolName: string;
    onClose: () => void;
}

export function PaywallModal({ toolName, onClose }: PaywallModalProps) {
    const { purchasePackage } = useCredits();

    const handlePurchase = async (packageType: PackageType) => {
        await purchasePackage(packageType);
    };

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
                            Adquiere un paquete de créditos para continuar usando las herramientas MC Labs.
                        </p>
                    </div>
                    <div className="absolute -right-8 -bottom-8 opacity-10">
                        <ShoppingCart className="w-40 h-40" />
                    </div>
                </div>

                {/* Packages */}
                <div className="p-8 space-y-4">
                    {/* Full Package */}
                    <div
                        className="border-2 border-blue-200 bg-blue-50/50 rounded-2xl p-6 cursor-pointer hover:border-blue-400 hover:shadow-lg transition-all group relative"
                        onClick={() => handlePurchase('FULL')}
                    >
                        <div className="absolute -top-3 left-6">
                            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                                <Crown className="w-3 h-3" /> Recomendado
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 mb-1">Paquete Completo</h3>
                                <p className="text-sm text-slate-600">
                                    2 Bancarias + 2 DIAN + 2 Tableros + 30 Extracciones IA
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-black text-blue-600">$100.000</p>
                                <p className="text-xs text-slate-500">COP</p>
                            </div>
                        </div>
                    </div>

                    {/* Individual Packages */}
                    <p className="text-xs font-bold uppercase text-slate-400 tracking-wider pt-2">O elige un paquete individual</p>

                    <div className="grid grid-cols-2 gap-3">
                        {(['BANK_RECS', 'CONCILIATOR', 'DASHBOARDS', 'EXTRACTOR'] as PackageType[]).map((pkgType) => {
                            const pkg = CREDIT_PACKAGES[pkgType];
                            return (
                                <div
                                    key={pkgType}
                                    className="border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                                    onClick={() => handlePurchase(pkgType)}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="w-4 h-4 text-blue-500" />
                                        <h4 className="font-bold text-slate-900 text-sm">{pkg.label}</h4>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-3">{pkg.description}</p>
                                    <p className="font-black text-blue-600">$50.000 <span className="text-xs font-medium text-slate-400">COP</span></p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
