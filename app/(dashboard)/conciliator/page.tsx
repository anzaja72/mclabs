'use client'

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import {
    FileText, RefreshCw, FileSpreadsheet, Eye, Download, Search, AlertTriangle, CheckCircle,
    Shield, Sparkles, User
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { FileState, DataState, ResultItem } from '@/types/conciliator';
import { procesarDatosDIAN, procesarDatosContables, generarConciliacion, formatearMoneda } from '@/lib/conciliator-logic';
import { FileCard } from '@/components/conciliator/file-card';
import { ModalDetalle } from '@/components/conciliator/modal-detalle';
import { ModalEstadosFinancieros } from '@/components/conciliator/modal-estados';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/lib/credits-context';
import { CreditsBanner } from '@/components/credits-banner';
import { PaywallModal } from '@/components/paywall-modal';

export default function ConciliatorPage() {
    const { user } = useAuth();
    const { useCredit, getToolCredits } = useCredits();
    const [showPaywall, setShowPaywall] = useState(false);
    const [creditUsed, setCreditUsed] = useState(false);
    const [files, setFiles] = useState<FileState>({ contable: null, dian: null });
    const [data, setData] = useState<DataState>({ contable: null, dian: null, contableCount: 0, dianCount: 0 });
    const [results, setResults] = useState<ResultItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null);
    const [showFinancialModal, setShowFinancialModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleFile = async (type: 'contable' | 'dian', e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFiles(prev => ({ ...prev, [type]: file }));
            setLoading(true);

            try {
                const buffer = await file.arrayBuffer();
                const wb = XLSX.read(buffer, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

                if (type === 'dian') {
                    const { mapa, totalRegistros } = procesarDatosDIAN(jsonData as any[]);
                    setData(prev => ({ ...prev, dian: mapa, dianCount: totalRegistros }));
                } else {
                    const { mapa, totalRegistros } = procesarDatosContables(jsonData as any[]);
                    setData(prev => ({ ...prev, contable: mapa, contableCount: totalRegistros }));
                }
            } catch (error) {
                console.error(error);
                alert('Error al leer el archivo. Asegúrate de que sea un Excel válido.');
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const runConciliation = async () => {
            if (data.dian && data.contable) {
                // Check credits before processing
                if (!creditUsed && getToolCredits('conciliator') <= 0) {
                    setShowPaywall(true);
                    return;
                }

                if (!creditUsed) {
                    const result = await useCredit('conciliator');
                    if (!result.success) {
                        if (result.needsPurchase) setShowPaywall(true);
                        return;
                    }
                    setCreditUsed(true);
                }

                const res = generarConciliacion(data.dian, data.contable);
                setResults(res);
            }
        };
        runConciliation();
    }, [data.dian, data.contable]);

    const filteredResults = useMemo(() => {
        return results.filter(r =>
            r.nit.includes(searchTerm) ||
            r.estado.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [results, searchTerm]);

    const exportarExcel = () => {
        if (results.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(results.map(r => ({
            NIT: r.nit,
            Tipo: r.tipo,
            'Valor DIAN': r.dianTotal,
            'Docs DIAN': r.dianDocs,
            'Valor Contable': r.contableTotal,
            'Diferencia': r.diferencia,
            'Estado': r.estado
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Conciliación");
        XLSX.writeFile(wb, "conciliacion.xlsx");
    };

    const handleNewConciliation = () => {
        setFiles({ contable: null, dian: null });
        setData({ contable: null, dian: null, contableCount: 0, dianCount: 0 });
        setResults([]);
        setSearchTerm('');
        setCreditUsed(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-white">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/50">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-2">
                            <Image
                                src="/mc-labs-logo.png"
                                alt="MC Labs"
                                width={36}
                                height={36}
                                className="object-contain"
                            />
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900">MC Labs</span>
                                <span className="text-[10px] text-[#009FE3] font-medium -mt-1">ACCOUNTING AI</span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center gap-1">
                            <Link href="/" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">
                                Dashboard
                            </Link>
                            <Link
                                href="/conciliator"
                                className="px-4 py-2 text-sm font-medium text-[#009FE3] bg-blue-50 rounded-lg"
                            >
                                Conciliador
                            </Link>
                            <Link
                                href="/bank-recs"
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Bancario
                            </Link>
                            <Link
                                href="/extractor"
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Extractor
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600">{user?.email?.split('@')[0] || 'Usuario'}</span>
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container py-8">
                {/* Page Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-[#009FE3] text-sm font-semibold mb-2">
                            <Shield className="w-4 h-4" />
                            HERRAMIENTA DE AUDITORÍA FISCAL
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-2">
                            Conciliador Fiscal vs Contable
                        </h1>
                        <p className="text-slate-600 max-w-2xl">
                            Optimice sus auditorías comparando automáticamente los reportes de facturación de la
                            DIAN contra su auxiliar contable utilizando inteligencia artificial.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleNewConciliation}
                        className="flex items-center gap-2 rounded-xl"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Nueva Conciliación
                    </Button>
                </div>

                {/* Credits Banner */}
                <div className="mb-6">
                    <CreditsBanner tool="conciliator" toolLabel="Conciliación DIAN" />
                </div>

                {/* Upload Cards */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {/* DIAN Report Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#009FE3]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Reporte Facturación DIAN</h3>
                                <p className="text-sm text-slate-500">Archivos .xlsx, .xls o .csv</p>
                            </div>
                        </div>

                        <label className="block cursor-pointer">
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${files.dian
                                    ? 'border-green-300 bg-green-50'
                                    : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/30'
                                }`}>
                                {files.dian ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle className="w-10 h-10 text-green-500" />
                                        <p className="font-medium text-slate-900">{files.dian.name}</p>
                                        <p className="text-sm text-slate-500">{data.dianCount} registros cargados</p>
                                    </div>
                                ) : (
                                    <>
                                        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                        <p className="font-semibold text-slate-700">Seleccionar archivo</p>
                                        <p className="text-sm text-slate-400">o arrastre y suelte el reporte DIAN aquí</p>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => handleFile('dian', e)}
                            />
                        </label>
                    </div>

                    {/* Contable Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileSpreadsheet className="w-6 h-6 text-[#009FE3]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Auxiliar Contable</h3>
                                <p className="text-sm text-slate-500">Excel generado por su software contable</p>
                            </div>
                        </div>

                        <label className="block cursor-pointer">
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${files.contable
                                    ? 'border-green-300 bg-green-50'
                                    : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/30'
                                }`}>
                                {files.contable ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle className="w-10 h-10 text-green-500" />
                                        <p className="font-medium text-slate-900">{files.contable.name}</p>
                                        <p className="text-sm text-slate-500">{data.contableCount} registros cargados</p>
                                    </div>
                                ) : (
                                    <>
                                        <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                        <p className="font-semibold text-slate-700">Seleccionar archivo</p>
                                        <p className="text-sm text-slate-400">o arrastre y suelte el auxiliar contable aquí</p>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => handleFile('contable', e)}
                            />
                        </label>
                    </div>
                </div>

                {/* Auto-process message */}
                {files.dian && files.contable && results.length === 0 && loading && (
                    <div className="flex justify-center mb-8">
                        <div className="bg-blue-50 text-blue-700 px-6 py-3 rounded-full flex items-center gap-3">
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            Procesando conciliación automáticamente...
                        </div>
                    </div>
                )}

                {/* Results Section */}
                {results.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
                        <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4">
                                <h3 className="font-bold text-slate-900">Resultados de Conciliación</h3>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por NIT o Estado..."
                                        className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <span className="text-sm text-slate-500 font-medium">
                                    {filteredResults.length} registros
                                </span>
                            </div>

                            <div className="flex gap-2">
                                {data.contable && (
                                    <button
                                        onClick={() => setShowFinancialModal(true)}
                                        className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                                    >
                                        <FileText size={16} /> Estados Financieros
                                    </button>
                                )}
                                <button
                                    onClick={exportarExcel}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Download size={18} /> Exportar Excel
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3">NIT / Tercero</th>
                                        <th className="px-6 py-3">Tipo</th>
                                        <th className="px-6 py-3 text-right">Valor DIAN</th>
                                        <th className="px-6 py-3 text-right">Valor Contable</th>
                                        <th className="px-6 py-3 text-right">Diferencia</th>
                                        <th className="px-6 py-3 text-center">Estado</th>
                                        <th className="px-6 py-3 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredResults.map((row) => (
                                        <tr key={`${row.nit}-${row.tipo}`} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-6 py-4 font-medium text-slate-900">{row.nit}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${row.tipo === 'VENTA' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                    {row.tipo}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-600">{formatearMoneda(row.dianTotal)}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-600">{formatearMoneda(row.contableTotal)}</td>
                                            <td className={`px-6 py-4 text-right font-mono font-bold ${row.diferencia === 0 ? 'text-slate-300' : 'text-slate-800'}`}>
                                                {formatearMoneda(row.diferencia)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.estado === 'OK' && <span className="inline-flex items-center gap-1 text-green-600 font-bold text-xs bg-green-100 px-2 py-1 rounded-full"><CheckCircle size={12} /> OK</span>}
                                                {row.estado === 'ADVERTENCIA' && <span className="inline-flex items-center gap-1 text-yellow-600 font-bold text-xs bg-yellow-100 px-2 py-1 rounded-full"><AlertTriangle size={12} /> REVISAR</span>}
                                                {row.estado === 'CRITICO' && <span className="inline-flex items-center gap-1 text-red-600 font-bold text-xs bg-red-100 px-2 py-1 rounded-full"><AlertTriangle size={12} /> CRÍTICO</span>}
                                                {row.estado === 'SOLO_DIAN' && <span className="inline-flex items-center gap-1 text-orange-600 font-bold text-xs bg-orange-100 px-2 py-1 rounded-full"><AlertTriangle size={12} /> NO EN CONTAB.</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => setSelectedItem(row)}
                                                    className="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors"
                                                    title="Ver detalle"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredResults.length === 0 && (
                            <div className="p-12 text-center text-slate-400">
                                <Search size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No se encontraron resultados para tu búsqueda.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Features */}
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Shield className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Seguridad de Datos</h4>
                            <p className="text-sm text-slate-600">
                                Sus archivos se procesan de forma privada y son eliminados automáticamente al finalizar la sesión.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Cruce Inteligente</h4>
                            <p className="text-sm text-slate-600">
                                Nuestra IA identifica discrepancias en NITs, valores base, impuestos y fechas entre ambos reportes.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Download className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Exportación Directa</h4>
                            <p className="text-sm text-slate-600">
                                Descargue el informe detallado de diferencias listo para ser conciliado en su software contable.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t bg-white mt-16">
                <div className="container py-6 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Image
                            src="/mc-labs-logo.png"
                            alt="MC Labs"
                            width={24}
                            height={24}
                            className="object-contain"
                        />
                        <span className="text-sm font-medium text-slate-700">MC Labs</span>
                    </div>
                    <p className="text-sm text-slate-500">
                        © 2024 MC LABS. TODOS LOS DERECHOS RESERVADOS.
                    </p>
                    <div className="flex gap-6 text-sm text-slate-500">
                        <a href="#" className="hover:text-slate-900">SOPORTE</a>
                        <a href="#" className="hover:text-slate-900">PRIVACIDAD</a>
                        <a href="#" className="hover:text-slate-900">MANUAL</a>
                    </div>
                </div>
            </footer>

            {/* Paywall Modal */}
            {showPaywall && (
                <PaywallModal
                    toolName="Conciliación DIAN"
                    onClose={() => setShowPaywall(false)}
                />
            )}

            {/* Modals */}
            {selectedItem && (
                <ModalDetalle
                    data={selectedItem}
                    onClose={() => setSelectedItem(null)}
                />
            )}

            {showFinancialModal && data.contable && (
                <ModalEstadosFinancieros
                    mapaContable={data.contable}
                    resultados={results}
                    onClose={() => setShowFinancialModal(false)}
                />
            )}
        </div>
    );
}
