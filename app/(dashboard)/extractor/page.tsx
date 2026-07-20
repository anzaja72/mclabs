'use client'

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import {
    FileUp, Settings, Trash2, Download, Plus, X, Pencil, CheckCircle,
    AlertCircle, Loader2, TrendingUp, Layers, Search, LayoutGrid, List, FileText, User
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { InvoiceData, ProcessingStatus, LineItem } from '@/types/extractor';
import { extractInvoiceData, NeedsPurchaseError } from '@/lib/ai-service';
import { useCredits } from '@/lib/credits-context';
import { CreditsBanner } from '@/components/credits-banner';
import { PaywallModal } from '@/components/paywall-modal';

// Utility for formatting currency
const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

export default function ExtractorPage() {
    const { user } = useAuth();
    const { getToolCredits, setCredits } = useCredits();
    const [showPaywall, setShowPaywall] = useState(false);
    const [invoices, setInvoices] = useState<InvoiceData[]>([]);
    const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
    const [processingMessage, setProcessingMessage] = useState<string>('');
    const [editingInvoice, setEditingInvoice] = useState<InvoiceData | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

    // Load from local storage
    useEffect(() => {
        const saved = localStorage.getItem('invoice_extractor_pro_data');
        if (saved) {
            try {
                setInvoices(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load invoices", e);
            }
        }
    }, []);

    // Save to local storage
    useEffect(() => {
        localStorage.setItem('invoice_extractor_pro_data', JSON.stringify(invoices));
    }, [invoices]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setProcessingStatus(ProcessingStatus.LOADING);
        const filesArray = Array.from(files);
        let successCount = 0;
        let failCount = 0;

        // Check if there are enough credits
        const availableCredits = getToolCredits('extractor');
        if (availableCredits <= 0) {
            setShowPaywall(true);
            setProcessingStatus(ProcessingStatus.IDLE);
            return;
        }

        for (let i = 0; i < filesArray.length; i++) {
            const file = filesArray[i];
            setProcessingMessage(`Procesando (${i + 1}/${filesArray.length}): ${file.name}`);

            try {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                });

                // El servidor descuenta 1 crédito por extracción exitosa
                const { invoice, credits } = await extractInvoiceData(base64, file.type, file.name);
                setInvoices(prev => [invoice, ...prev]);
                if (credits) setCredits(credits);
                successCount++;
            } catch (error) {
                if (error instanceof NeedsPurchaseError) {
                    setShowPaywall(true);
                    break;
                }
                console.error(`Error processing ${file.name}`, error);
                failCount++;
            }
        }

        setProcessingStatus(successCount > 0 ? ProcessingStatus.SUCCESS : ProcessingStatus.ERROR);
        setProcessingMessage(`Completado: ${successCount} éxitos, ${failCount} fallos.`);

        setTimeout(() => {
            setProcessingStatus(ProcessingStatus.IDLE);
            setProcessingMessage('');
        }, 4000);

        // Clear input
        e.target.value = '';
    };

    const deleteInvoice = (id: string) => {
        if (confirm('¿Seguro que deseas eliminar esta factura?')) {
            setInvoices(prev => prev.filter(inv => inv.id !== id));
        }
    };

    const clearAll = () => {
        if (confirm('¿Seguro que deseas borrar todas las facturas procesadas?')) {
            setInvoices([]);
        }
    };

    const downloadExcel = () => {
        if (invoices.length === 0) return;

        const flatData = invoices.flatMap(inv => {
            const base = {
                "Archivo": inv.fileName,
                "Emisor": inv.issuerInfo?.companyName,
                "NIT Emisor": inv.issuerInfo?.nit,
                "Cliente": inv.customerInfo?.name,
                "Nº Factura": inv.generalInfo?.invoiceNumber,
                "Fecha": inv.generalInfo?.issueDate,
                "Total Factura": inv.totals?.grandTotal,
                "Procesado": new Date(inv.processedAt).toLocaleString()
            };

            if (inv.lineItems && inv.lineItems.length > 0) {
                return inv.lineItems.map(item => ({
                    ...base,
                    "Item": item.description,
                    "Cant": item.quantity,
                    "Precio Uni": item.unitPrice,
                    "Total Item": item.totalValue
                }));
            }
            return [base];
        });

        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Facturas");
        XLSX.writeFile(wb, `Reporte_Facturas_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv =>
            inv.issuerInfo?.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.generalInfo?.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.customerInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [invoices, searchTerm]);

    const totalAmount = useMemo(() =>
        invoices.reduce((acc, inv) => acc + (inv.totals?.grandTotal || 0), 0),
        [invoices]);

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
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Fiscal
                            </Link>
                            <Link
                                href="/bank-recs"
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Bancario
                            </Link>
                            <Link
                                href="/dashboards"
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Tableros
                            </Link>
                            <Link
                                href="/extractor"
                                className="px-4 py-2 text-sm font-medium text-[#009FE3] bg-blue-50 rounded-lg"
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

            <div className="max-w-7xl mx-auto p-6 space-y-8">

                {/* Credits Banner */}
                <CreditsBanner tool="extractor" toolLabel="Extractor IA" />

                {/* Paywall Modal */}
                {showPaywall && (
                    <PaywallModal
                        toolName="Extractor IA"
                        onClose={() => setShowPaywall(false)}
                    />
                )}

                {/* Header Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <Layers className="text-blue-600 w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Total Facturas</p>
                            <h3 className="text-2xl font-bold text-slate-900">{invoices.length}</h3>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <TrendingUp className="text-emerald-600 w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Monto Total</p>
                            <h3 className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</h3>
                        </div>
                    </div>
                    <div className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-lg shadow-blue-200 text-white flex justify-between items-center overflow-hidden relative">
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold mb-1">Carga Inteligente</h3>
                            <p className="text-blue-100 text-sm opacity-90">Sube múltiples documentos simultáneamente.</p>
                        </div>
                        <label className="relative z-10 bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center gap-2 border border-white/20">
                            <Plus className="w-4 h-4" />
                            Subir Archivos
                            <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <div className="absolute -right-4 -bottom-4 opacity-10">
                            <FileUp className="w-32 h-32" />
                        </div>
                    </div>
                </div>

                {/* Processing Indicator */}
                {processingStatus !== ProcessingStatus.IDLE && (
                    <div className={`p-4 rounded-xl border flex items-center justify-between transition-all animate-fade-in ${processingStatus === ProcessingStatus.LOADING ? 'bg-blue-50 border-blue-100 text-blue-700' :
                        processingStatus === ProcessingStatus.SUCCESS ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                            'bg-rose-50 border-rose-100 text-rose-700'
                        }`}>
                        <div className="flex items-center gap-3">
                            {processingStatus === ProcessingStatus.LOADING ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : processingStatus === ProcessingStatus.SUCCESS ? (
                                <CheckCircle className="w-5 h-5" />
                            ) : (
                                <AlertCircle className="w-5 h-5" />
                            )}
                            <span className="text-sm font-semibold">{processingMessage}</span>
                        </div>
                    </div>
                )}

                {/* List Section */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <h2 className="font-bold text-slate-800">Historial de Procesamiento</h2>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                                >
                                    <List className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative group hidden sm:block">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="block w-40 pl-10 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={clearAll}
                                    className="px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" /> Borrar
                                </button>
                                <button
                                    onClick={downloadExcel}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> Exportar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1">
                        {filteredInvoices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-40">
                                <FileUp className="w-16 h-16 mb-4" />
                                <p className="font-medium text-lg">No hay facturas procesadas aún</p>
                                <p className="text-sm">Sube tus documentos para comenzar la extracción</p>
                            </div>
                        ) : viewMode === 'table' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                                            <th className="px-6 py-3 border-b border-slate-100">Emisor</th>
                                            <th className="px-6 py-3 border-b border-slate-100">Número</th>
                                            <th className="px-6 py-3 border-b border-slate-100">Fecha</th>
                                            <th className="px-6 py-3 border-b border-slate-100 text-right">Total</th>
                                            <th className="px-6 py-3 border-b border-slate-100 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredInvoices.map((inv) => (
                                            <tr key={inv.id} className="group hover:bg-slate-50/80 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-slate-900 truncate max-w-[200px]">{inv.issuerInfo?.companyName || 'N/A'}</p>
                                                    <p className="text-xs text-slate-400">{inv.fileName}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 bg-slate-100 rounded text-slate-600 text-xs font-bold">
                                                        #{inv.generalInfo?.invoiceNumber || 'S/N'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600">{inv.generalInfo?.issueDate || '-'}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-bold text-slate-900">{formatCurrency(inv.totals?.grandTotal || 0)}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => setEditingInvoice(inv)}
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteInvoice(inv.id)}
                                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                                {filteredInvoices.map((inv) => (
                                    <div key={inv.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 transition-all shadow-sm hover:shadow-md relative group flex flex-col">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="bg-slate-100 p-2 rounded-xl">
                                                <FileText className="text-slate-500 w-5 h-5" />
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingInvoice(inv)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => deleteInvoice(inv.id)} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <h4 className="font-bold text-slate-900 truncate mb-1">{inv.issuerInfo?.companyName}</h4>
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">Inv No.</span>
                                            <span className="text-xs font-bold text-slate-600">{inv.generalInfo?.invoiceNumber || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                                            <div className="text-xs text-slate-500">
                                                {inv.generalInfo?.issueDate}
                                            </div>
                                            <div className="text-lg font-black text-blue-600">
                                                {formatCurrency(inv.totals?.grandTotal || 0)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Editor Modal */}
            {editingInvoice && (
                <InvoiceEditor
                    invoice={editingInvoice}
                    onClose={() => setEditingInvoice(null)}
                    onSave={(updated) => {
                        setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
                        setEditingInvoice(null);
                    }}
                />
            )}

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
        </div>
    );
};

// Sub-component for editing
const InvoiceEditor: React.FC<{
    invoice: InvoiceData;
    onClose: () => void;
    onSave: (data: InvoiceData) => void;
}> = ({ invoice, onClose, onSave }) => {
    const [data, setData] = useState<InvoiceData>({ ...invoice });

    const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
        const newItems = [...data.lineItems];
        // @ts-ignore
        newItems[index] = { ...newItems[index], [field]: value };

        // Auto-calculate totalValue if possible
        if (field === 'quantity' || field === 'unitPrice') {
            const q = field === 'quantity' ? Number(value) : newItems[index].quantity;
            const p = field === 'unitPrice' ? Number(value) : newItems[index].unitPrice;
            newItems[index].totalValue = q * p;
        }

        // Auto-calculate grand total
        const grandTotal = newItems.reduce((acc, item) => acc + (item.totalValue || 0), 0);

        setData({
            ...data,
            lineItems: newItems,
            totals: { grandTotal }
        });
    };

    const addLineItem = () => {
        setData({
            ...data,
            lineItems: [...data.lineItems, { description: '', quantity: 0, unitPrice: 0, totalValue: 0 }]
        });
    };

    const removeLineItem = (index: number) => {
        const newItems = data.lineItems.filter((_, i) => i !== index);
        const grandTotal = newItems.reduce((acc, item) => acc + (item.totalValue || 0), 0);
        setData({ ...data, lineItems: newItems, totals: { grandTotal } });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-fade-in">

                {/* Modal Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-900">Editar Factura</h3>
                        <p className="text-sm text-slate-500 font-medium">{data.fileName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Issuer Info */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase text-blue-600 tracking-wider">Información del Emisor</h4>
                            <div className="space-y-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400">Razón Social</label>
                                    <input
                                        type="text"
                                        value={data.issuerInfo?.companyName || ''}
                                        onChange={e => setData({ ...data, issuerInfo: { ...data.issuerInfo, companyName: e.target.value } })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400">NIT / RUT</label>
                                    <input
                                        type="text"
                                        value={data.issuerInfo?.nit || ''}
                                        onChange={e => setData({ ...data, issuerInfo: { ...data.issuerInfo, nit: e.target.value } })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* General Info */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Detalles del Documento</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400">Número Factura</label>
                                    <input
                                        type="text"
                                        value={data.generalInfo?.invoiceNumber || ''}
                                        onChange={e => setData({ ...data, generalInfo: { ...data.generalInfo, invoiceNumber: e.target.value } })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400">Fecha Emisión</label>
                                    <input
                                        type="text"
                                        value={data.generalInfo?.issueDate || ''}
                                        onChange={e => setData({ ...data, generalInfo: { ...data.generalInfo, issueDate: e.target.value } })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="col-span-2 flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400">Nombre del Cliente</label>
                                    <input
                                        type="text"
                                        value={data.customerInfo?.name || ''}
                                        onChange={e => setData({ ...data, customerInfo: { ...data.customerInfo, name: e.target.value } })}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Desglose de Productos / Servicios</h4>
                            <button
                                onClick={addLineItem}
                                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                            >
                                <Plus className="w-3.5 h-3.5" /> Agregar Ítem
                            </button>
                        </div>

                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Descripción</th>
                                        <th className="px-4 py-3 text-center w-20">Cant.</th>
                                        <th className="px-4 py-3 text-right w-28">Precio U.</th>
                                        <th className="px-4 py-3 text-right w-28">Total</th>
                                        <th className="px-4 py-3 text-center w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.lineItems.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={e => handleLineItemChange(idx, 'description', e.target.value)}
                                                    className="w-full px-3 py-1.5 bg-transparent focus:bg-white border-none focus:ring-1 focus:ring-blue-500 rounded-lg outline-none transition-all text-black"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => handleLineItemChange(idx, 'quantity', e.target.value)}
                                                    className="w-full px-3 py-1.5 bg-transparent focus:bg-white border-none focus:ring-1 focus:ring-blue-500 rounded-lg outline-none transition-all text-center text-black"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.unitPrice}
                                                    onChange={e => handleLineItemChange(idx, 'unitPrice', e.target.value)}
                                                    className="w-full px-3 py-1.5 bg-transparent focus:bg-white border-none focus:ring-1 focus:ring-blue-500 rounded-lg outline-none transition-all text-right font-mono text-black"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={item.totalValue}
                                                    onChange={e => handleLineItemChange(idx, 'totalValue', e.target.value)}
                                                    className="w-full px-3 py-1.5 bg-transparent focus:bg-white border-none focus:ring-1 focus:ring-blue-500 rounded-lg outline-none transition-all text-right font-mono font-bold text-slate-900"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <button onClick={() => removeLineItem(idx)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-slate-400">Total Factura</span>
                        <span className="text-2xl font-black text-slate-900">{formatCurrency(data.totals?.grandTotal || 0)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={() => onSave(data)}
                            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
