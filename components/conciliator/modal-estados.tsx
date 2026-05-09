'use client'

import React, { useMemo } from 'react';
import { XCircle, TrendingUp, FileText, DollarSign } from 'lucide-react';
import { ResultItem } from '@/types/conciliator';
import { formatearMoneda } from '@/lib/conciliator-logic';

interface ModalEstadosProps {
    mapaContable: Map<string, any>;
    resultados: ResultItem[];
    onClose: () => void;
}

export const ModalEstadosFinancieros: React.FC<ModalEstadosProps> = ({ mapaContable, resultados, onClose }) => {
    // 1. Detectar si hay cuentas contables (PUC) en la data
    const hasAccounts = Array.from(mapaContable.values()).some((entry: any) =>
        entry.movimientos.some((m: any) => m.cuenta && m.cuenta.length >= 1)
    );

    const report = useMemo(() => {
        const r = {
            activo: 0, pasivo: 0, patrimonio: 0,
            ingresos: 0, gastos: 0, costos: 0,
            mode: hasAccounts ? 'PUC' : 'ESTIMADO'
        };

        if (hasAccounts) {
            // Lógica Real Contable (PUC 1-6)
            mapaContable.forEach((entry: any) => {
                entry.movimientos.forEach((m: any) => {
                    if (!m.cuenta) return;
                    const classDigit = m.cuenta.toString().charAt(0);
                    const deb = m.debito || 0;
                    const cred = m.credito || 0;

                    // Ecuaciones: Activo/Gastos/Costos aumentan Débito. Pasivo/Patrimonio/Ingresos aumentan Crédito.
                    switch (classDigit) {
                        case '1': r.activo += (deb - cred); break;
                        case '2': r.pasivo += (cred - deb); break;
                        case '3': r.patrimonio += (cred - deb); break;
                        case '4': r.ingresos += (cred - deb); break;
                        case '5': r.gastos += (deb - cred); break;
                        case '6': r.costos += (deb - cred); break;
                        case '7': r.costos += (deb - cred); break;
                    }
                });
            });
        } else {
            // Lógica Estimada (Basada en etiquetas DIAN)
            // Ingresos = Ventas Contables
            // Gastos/Costos = Compras Contables + Nomina
            resultados.forEach(res => {
                if (res.tipo === 'VENTA') {
                    r.ingresos += res.contableTotal;
                } else if (res.tipo === 'COMPRA' || res.tipo === 'NOMINA') {
                    r.gastos += res.contableTotal;
                }
            });
            // En modo estimado no podemos calcular Activo/Pasivo real sin cuentas
            r.activo = 0; r.pasivo = 0; r.patrimonio = 0;
        }
        return r;
    }, [mapaContable, resultados, hasAccounts]);

    const utilidad = report.ingresos - report.gastos - report.costos;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2"><TrendingUp size={24} /> Estados Financieros Iniciales</h2>
                        <p className="text-slate-400 text-xs mt-1">
                            {report.mode === 'PUC'
                                ? 'Generado a partir de códigos PUC detectados en el auxiliar.'
                                : 'MODO ESTIMACIÓN: Generado a partir de la clasificación tributaria (Ventas/Compras) por falta de columna "Cuenta".'}
                        </p>
                    </div>
                    <button onClick={onClose}><XCircle size={28} className="hover:text-red-400 transition-colors" /></button>
                </div>

                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    <div className="grid md:grid-cols-2 gap-6">

                        {/* Estado de Resultados */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                                <FileText size={20} className="text-blue-600" /> Estado de Resultados
                            </h3>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-2 rounded hover:bg-slate-50">
                                    <span className="text-slate-600">Ingresos Operacionales</span>
                                    <span className="font-bold text-green-600 text-lg">{formatearMoneda(report.ingresos)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2 rounded hover:bg-slate-50">
                                    <span className="text-slate-600">Gastos Generales</span>
                                    <span className="font-bold text-red-500 text-lg">- {formatearMoneda(report.gastos)}</span>
                                </div>
                                <div className="flex justify-between items-center p-2 rounded hover:bg-slate-50 border-b border-dashed">
                                    <span className="text-slate-600">Costos de Venta</span>
                                    <span className="font-bold text-red-500 text-lg">- {formatearMoneda(report.costos)}</span>
                                </div>

                                <div className="flex justify-between items-center pt-2 mt-2">
                                    <span className="font-bold text-slate-800 uppercase">Utilidad / Pérdida</span>
                                    <span className={`font-bold text-2xl ${utilidad >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                        {formatearMoneda(utilidad)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Balance General (Solo visible si hay PUC) */}
                        <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${report.mode === 'ESTIMADO' ? 'opacity-50 grayscale' : ''}`}>
                            <h3 className="text-lg font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                                <DollarSign size={20} className="text-purple-600" /> Estado de Situación Financiera
                            </h3>

                            {report.mode === 'ESTIMADO' && (
                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded mb-4 text-xs">
                                    <p><b>Información Limitada:</b> No se detectaron códigos de cuenta contable (Clase 1, 2, 3) en el archivo. El Balance General no se puede construir sin esta información.</p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600">Total Activos</span>
                                    <span className="font-bold text-slate-800">{formatearMoneda(report.activo)}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-px my-2"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600">Total Pasivos</span>
                                    <span className="font-bold text-slate-800">{formatearMoneda(report.pasivo)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600">Patrimonio</span>
                                    <span className="font-bold text-slate-800">{formatearMoneda(report.patrimonio)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600 italic text-sm">Utilidad del Ejercicio</span>
                                    <span className="font-bold text-slate-600 text-sm">{formatearMoneda(utilidad)}</span>
                                </div>

                                <div className="bg-slate-50 p-3 rounded mt-4 border border-slate-200">
                                    <div className="flex justify-between text-xs text-slate-500 uppercase font-bold">
                                        <span>Ecuación Patrimonial</span>
                                        <span>{report.activo === (report.pasivo + report.patrimonio + utilidad) ? 'CUADRADO' : 'DESCUADRE'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span>Activo</span>
                                        <span>=</span>
                                        <span>Pasivo + Pat + Util</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
