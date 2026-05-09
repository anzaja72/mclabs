'use client'

import React from 'react';
import { XCircle, FileSpreadsheet, Search } from 'lucide-react';
import { ResultItem } from '@/types/conciliator';
import { formatearMoneda } from '@/lib/conciliator-logic';

interface ModalDetalleProps {
    data: ResultItem;
    onClose: () => void;
}

export const ModalDetalle: React.FC<ModalDetalleProps> = ({ data, onClose }) => {
    const { nit, tipo, debugContable, detallesDian } = data;

    const movimientosC = debugContable ? debugContable.movimientos : [];

    // --- LÓGICA DE COINCIDENCIAS VISUALES ---
    const getContableVal = (m: any) => Math.round(m.credito > 0 ? m.credito : m.debito);
    const getDianVal = (d: any) => Math.round(Math.abs(d.valor));

    const dianValuesSet = new Set(detallesDian.map(getDianVal));
    const contableValuesSet = new Set(movimientosC.map(getContableVal));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold tracking-tight">{nit}</h2>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${tipo === 'VENTA' ? 'bg-blue-500' : 'bg-purple-500'}`}>{tipo}</span>
                        </div>
                        <p className="text-slate-400 text-sm">Conciliación detallada de movimientos</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <XCircle size={28} />
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 border-b shrink-0">
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Reportado DIAN</p>
                        <p className="text-xl font-bold text-slate-800">{formatearMoneda(data.dianTotal)}</p>
                        <p className="text-xs text-slate-400 mt-1">{data.dianDocs} documentos</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Contabilidad</p>
                        <p className="text-xl font-bold text-slate-800">{formatearMoneda(data.contableTotal)}</p>
                        <p className="text-xs text-slate-400 mt-1">D: {formatearMoneda(debugContable?.totalDebito || 0)} | C: {formatearMoneda(debugContable?.totalCredito || 0)}</p>
                    </div>
                    <div className={`p-4 rounded-lg border shadow-sm ${data.diferencia === 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                        <p className={`text-xs uppercase font-bold tracking-wider mb-1 ${data.diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>Diferencia</p>
                        <p className={`text-xl font-bold ${data.diferencia === 0 ? 'text-green-700' : 'text-red-700'}`}>{formatearMoneda(data.diferencia)}</p>
                        <p className="text-xs opacity-75 mt-1">{data.estado}</p>
                    </div>
                </div>

                {/* Lists Comparison */}
                <div className="flex-1 overflow-hidden flex divide-x divide-gray-200">
                    {/* Left: DIAN */}
                    <div className="flex-1 flex flex-col bg-white">
                        <div className="bg-blue-50 px-4 py-2 border-b flex justify-between items-center">
                            <span className="font-semibold text-blue-800 flex items-center gap-2"><FileSpreadsheet size={16} /> Registros DIAN</span>
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">{detallesDian.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {detallesDian.map((doc: any, i: number) => {
                                // Check match
                                const val = getDianVal(doc);
                                const isMatch = contableValuesSet.has(val);
                                const bgClass = isMatch
                                    ? 'bg-green-50 border-green-200 hover:bg-green-100'
                                    : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';

                                return (
                                    <div key={i} className={`p-3 border rounded-lg transition-colors text-sm relative group ${bgClass}`}>
                                        <div className="flex justify-between mb-1">
                                            <span className="font-medium text-slate-700 truncate w-32" title={doc.id}>{doc.id}</span>
                                            <span className={`font-mono font-bold ${doc.valor < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatearMoneda(doc.valor)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>{doc.fecha}</span>
                                            <span className="truncate max-w-[150px] italic">{doc.tipoDoc}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {detallesDian.length === 0 && <div className="text-center p-10 text-gray-400">No hay registros</div>}
                        </div>
                    </div>

                    {/* Right: Contabilidad */}
                    <div className="flex-1 flex flex-col bg-white">
                        <div className="bg-purple-50 px-4 py-2 border-b flex justify-between items-center">
                            <span className="font-semibold text-purple-800 flex items-center gap-2"><Search size={16} /> Movimientos Contables</span>
                            <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">{movimientosC.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {movimientosC.map((mov: any, i: number) => {
                                // Check match
                                const val = getContableVal(mov);
                                const isMatch = dianValuesSet.has(val);
                                const bgClass = isMatch
                                    ? 'bg-green-50 border-green-200 hover:bg-green-100'
                                    : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';

                                return (
                                    <div key={i} className={`p-3 border rounded-lg transition-colors text-sm ${bgClass}`}>
                                        <div className="flex justify-between mb-1">
                                            <span className="font-medium text-slate-700 truncate w-32" title={mov.id}>{mov.id}</span>
                                            <div className="text-right">
                                                <span className="font-mono font-bold text-slate-900 block">{formatearMoneda(mov.credito > 0 ? mov.credito : mov.debito)}</span>
                                                <span className="text-[10px] text-gray-400 block uppercase">{mov.credito > 0 ? 'Crédito' : 'Débito'}</span>
                                                {mov.cuenta && <span className="text-[9px] text-blue-600 block">{mov.cuenta}</span>}
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>{mov.fecha}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {movimientosC.length === 0 && <div className="text-center p-10 text-gray-400">No hay movimientos para este NIT</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
