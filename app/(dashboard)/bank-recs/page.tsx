'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
    Loader2,
    Play,
    RefreshCw,
    Shield,
    Sparkles,
    Download,
    FileSpreadsheet,
    FileText,
    Upload,
    User,
    CheckCircle2,
    AlertCircle,
    X
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { extractBankDataFromPDF, NeedsPurchaseError } from '@/lib/ai-service'
import { useCredits } from '@/lib/credits-context'
import { CreditsBanner } from '@/components/credits-banner'
import { PaywallModal } from '@/components/paywall-modal'

interface BankTransaction {
    date: string
    description: string
    amount: number
    reference?: string
}

interface LedgerTransaction {
    date: string
    description: string
    debit: number
    credit: number
    reference?: string
}

interface ReconciliationResult {
    matched: Array<{ bank: BankTransaction; ledger: LedgerTransaction }>
    unmatchedBank: BankTransaction[]
    unmatchedLedger: LedgerTransaction[]
    summary: {
        totalBankTransactions: number
        totalLedgerTransactions: number
        matchedCount: number
        unmatchedBankCount: number
        unmatchedLedgerCount: number
    }
}

export default function BankRecsPage() {
    const { user } = useAuth()
    const { getToolCredits, setCredits } = useCredits()
    const [showPaywall, setShowPaywall] = useState(false)
    const [bankFile, setBankFile] = useState<File | null>(null)
    const [ledgerFile, setLedgerFile] = useState<File | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [result, setResult] = useState<ReconciliationResult | null>(null)

    const handleBankFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) setBankFile(file)
    }

    const handleLedgerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) setLedgerFile(file)
    }



    const parseLedgerExcel = async (file: File): Promise<LedgerTransaction[]> => {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(firstSheet)

        return data.map((row: any) => ({
            date: row.Fecha || row.fecha || row.Date || row.date || '',
            description: row.Descripcion || row.descripcion || row.Description || row.description || row.Concepto || '',
            debit: parseFloat(row.Debito || row.debito || row.Debit || row.debit || 0) || 0,
            credit: parseFloat(row.Credito || row.credito || row.Credit || row.credit || 0) || 0,
            reference: row.Referencia || row.referencia || row.Reference || row.reference || ''
        }))
    }

    const performReconciliation = (
        bankTransactions: BankTransaction[],
        ledgerTransactions: LedgerTransaction[]
    ): ReconciliationResult => {
        const matched: Array<{ bank: BankTransaction; ledger: LedgerTransaction }> = []
        const unmatchedBank = [...bankTransactions]
        const unmatchedLedger = [...ledgerTransactions]

        // Simple matching by amount (within tolerance)
        for (let i = unmatchedBank.length - 1; i >= 0; i--) {
            const bankTx = unmatchedBank[i]
            const bankAmount = Math.abs(bankTx.amount)

            for (let j = unmatchedLedger.length - 1; j >= 0; j--) {
                const ledgerTx = unmatchedLedger[j]
                const ledgerAmount = ledgerTx.debit > 0 ? ledgerTx.debit : ledgerTx.credit

                // Match if amounts are within 0.01 tolerance
                if (Math.abs(bankAmount - ledgerAmount) < 0.01) {
                    matched.push({ bank: bankTx, ledger: ledgerTx })
                    unmatchedBank.splice(i, 1)
                    unmatchedLedger.splice(j, 1)
                    break
                }
            }
        }

        return {
            matched,
            unmatchedBank,
            unmatchedLedger,
            summary: {
                totalBankTransactions: bankTransactions.length,
                totalLedgerTransactions: ledgerTransactions.length,
                matchedCount: matched.length,
                unmatchedBankCount: unmatchedBank.length,
                unmatchedLedgerCount: unmatchedLedger.length
            }
        }
    }

    const handleReconciliation = async () => {
        if (!bankFile || !ledgerFile) return

        setIsProcessing(true)
        setStatus('processing')
        setErrorMessage('')
        setResult(null)

        try {
            // 0. Check credits (validación rápida; el servidor valida y descuenta de forma definitiva)
            if (getToolCredits('bank_recs') <= 0) {
                setShowPaywall(true)
                setIsProcessing(false)
                setStatus('idle')
                return
            }

            // 1. Extract bank data (el servidor descuenta 1 crédito en esta llamada)
            const { transactions: bankTransactions, credits } = await extractBankDataFromPDF(bankFile)
            if (credits) setCredits(credits)

            // 2. Parse ledger Excel file
            const ledgerTransactions = await parseLedgerExcel(ledgerFile)

            // 3. Perform reconciliation
            const reconciliationResult = performReconciliation(bankTransactions, ledgerTransactions)

            setResult(reconciliationResult)
            setStatus('success')
        } catch (error: any) {
            if (error instanceof NeedsPurchaseError) {
                setShowPaywall(true)
                setStatus('idle')
                return
            }
            console.error('Reconciliation error:', error)
            setStatus('error')
            setErrorMessage(error.message || 'Error durante el proceso de conciliación')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleExportReport = () => {
        if (!result) return

        const wb = XLSX.utils.book_new()

        const resumen = XLSX.utils.json_to_sheet([{
            'Tx Bancarias': result.summary.totalBankTransactions,
            'Tx Contables': result.summary.totalLedgerTransactions,
            'Coincidencias': result.summary.matchedCount,
            'Sin cruzar (Banco)': result.summary.unmatchedBankCount,
            'Sin cruzar (Contable)': result.summary.unmatchedLedgerCount,
        }])
        XLSX.utils.book_append_sheet(wb, resumen, 'Resumen')

        const coincidencias = XLSX.utils.json_to_sheet(result.matched.map(m => ({
            'Fecha Banco': m.bank.date,
            'Descripción Banco': m.bank.description,
            'Monto Banco': m.bank.amount,
            'Referencia Banco': m.bank.reference || '',
            'Fecha Contable': m.ledger.date,
            'Descripción Contable': m.ledger.description,
            'Débito': m.ledger.debit,
            'Crédito': m.ledger.credit,
        })))
        XLSX.utils.book_append_sheet(wb, coincidencias, 'Coincidencias')

        const sinCruzarBanco = XLSX.utils.json_to_sheet(result.unmatchedBank.map(tx => ({
            'Fecha': tx.date,
            'Descripción': tx.description,
            'Monto': tx.amount,
            'Referencia': tx.reference || '',
        })))
        XLSX.utils.book_append_sheet(wb, sinCruzarBanco, 'Sin cruzar (Banco)')

        const sinCruzarContable = XLSX.utils.json_to_sheet(result.unmatchedLedger.map(tx => ({
            'Fecha': tx.date,
            'Descripción': tx.description,
            'Débito': tx.debit,
            'Crédito': tx.credit,
            'Referencia': tx.reference || '',
        })))
        XLSX.utils.book_append_sheet(wb, sinCruzarContable, 'Sin cruzar (Contable)')

        XLSX.writeFile(wb, `Conciliacion_Bancaria_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    const handleNewReconciliation = () => {
        setBankFile(null)
        setLedgerFile(null)
        setStatus('idle')
        setResult(null)
        setErrorMessage('')
    }

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
                                className="px-4 py-2 text-sm font-medium text-[#009FE3] bg-blue-50 rounded-lg"
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
                            Conciliador Bancario vs Contable
                        </h1>
                        <p className="text-slate-600 max-w-2xl">
                            Optimice sus auditorías comparando automáticamente los extractos bancarios
                            contra su auxiliar contable utilizando inteligencia artificial.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleNewReconciliation}
                        className="flex items-center gap-2 rounded-xl"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Nueva Conciliación
                    </Button>
                </div>

                {/* Credits Banner */}
                <div className="mb-6">
                    <CreditsBanner tool="bank_recs" toolLabel="Conciliación Bancaria" />
                </div>

                {/* Upload Cards */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {/* Bank Statement Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#009FE3]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Extracto Bancario</h3>
                                <p className="text-sm text-slate-500">Archivos .pdf (extracción con IA)</p>
                            </div>
                        </div>

                        <label className="block cursor-pointer">
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${bankFile
                                ? 'border-green-300 bg-green-50'
                                : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/30'
                                }`}>
                                {bankFile ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                                        <p className="font-medium text-slate-900">{bankFile.name}</p>
                                        <button
                                            onClick={(e) => { e.preventDefault(); setBankFile(null) }}
                                            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                                        >
                                            <X className="w-4 h-4" /> Eliminar
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                        <p className="font-semibold text-slate-700">Seleccionar archivo</p>
                                        <p className="text-sm text-slate-400">o arrastre y suelte el extracto bancario aquí</p>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf"
                                onChange={handleBankFileSelect}
                            />
                        </label>
                    </div>

                    {/* Ledger Card */}
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
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${ledgerFile
                                ? 'border-green-300 bg-green-50'
                                : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/30'
                                }`}>
                                {ledgerFile ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                                        <p className="font-medium text-slate-900">{ledgerFile.name}</p>
                                        <button
                                            onClick={(e) => { e.preventDefault(); setLedgerFile(null) }}
                                            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                                        >
                                            <X className="w-4 h-4" /> Eliminar
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                        <p className="font-semibold text-slate-700">Seleccionar archivo</p>
                                        <p className="text-sm text-slate-400">o arrastre y suelte el auxiliar contable aquí</p>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".xlsx,.xls"
                                onChange={handleLedgerFileSelect}
                            />
                        </label>
                    </div>
                </div>

                {/* Action Button */}
                <div className="flex flex-col items-center gap-4 mb-12">
                    <Button
                        size="lg"
                        onClick={handleReconciliation}
                        disabled={!bankFile || !ledgerFile || isProcessing}
                        className="bg-[#009FE3] hover:bg-[#0088c7] text-white rounded-full px-10 py-6 text-base font-semibold shadow-lg shadow-blue-500/25"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Play className="mr-2 h-5 w-5" />
                                Iniciar Conciliación
                            </>
                        )}
                    </Button>
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                        <Loader2 className="w-4 h-4" />
                        El proceso de análisis toma aproximadamente 15-30 segundos.
                    </p>
                </div>

                {/* Error Message */}
                {status === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-red-800">Error en la conciliación</p>
                            <p className="text-sm text-red-600">{errorMessage}</p>
                        </div>
                    </div>
                )}

                {/* Results */}
                {result && status === 'success' && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
                        <h3 className="text-xl font-bold text-slate-900 mb-6">Resultados de Conciliación</h3>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                            <div className="bg-slate-50 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-slate-900">{result.summary.totalBankTransactions}</p>
                                <p className="text-xs text-slate-500">Tx Bancarias</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-slate-900">{result.summary.totalLedgerTransactions}</p>
                                <p className="text-xs text-slate-500">Tx Contables</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-green-600">{result.summary.matchedCount}</p>
                                <p className="text-xs text-green-600">Coincidencias</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-orange-600">{result.summary.unmatchedBankCount}</p>
                                <p className="text-xs text-orange-600">Sin cruzar (Banco)</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 text-center">
                                <p className="text-2xl font-bold text-orange-600">{result.summary.unmatchedLedgerCount}</p>
                                <p className="text-xs text-orange-600">Sin cruzar (Contable)</p>
                            </div>
                        </div>

                        <Button variant="outline" onClick={handleExportReport} className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Exportar Reporte
                        </Button>
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
                                Nuestra IA identifica discrepancias en montos, fechas y referencias entre ambos reportes.
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

            {/* Paywall Modal */}
            {showPaywall && (
                <PaywallModal
                    toolName="Conciliación Bancaria"
                    onClose={() => setShowPaywall(false)}
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
    )
}
