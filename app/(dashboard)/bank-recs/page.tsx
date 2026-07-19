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
import { extractBankDataFromPDF, reconcileBankWithAI, NeedsPurchaseError } from '@/lib/ai-service'
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

// Cada grupo de cruce puede ser 1:1, 1:N o N:1 (p. ej. nómina consolidada
// en el banco contra registros desagregados en contabilidad)
interface MatchGroup {
    bank: BankTransaction[]
    ledger: LedgerTransaction[]
    note?: string
}

interface ReconciliationResult {
    matched: MatchGroup[]
    unmatchedBank: BankTransaction[]
    unmatchedLedger: LedgerTransaction[]
    aiNotes?: string
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
    const [instructions, setInstructions] = useState('')
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



    /** Normaliza un encabezado: sin tildes, minúsculas, sin espacios extra. */
    const normalizeHeader = (h: string) =>
        h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

    /** Convierte fechas de Excel (texto DD-MM-YYYY, DD/MM/YYYY o serial) a YYYY-MM-DD. */
    const normalizeDate = (value: unknown): string => {
        if (value == null || value === '') return ''
        // Serial de Excel (número de días desde 1899-12-30)
        if (typeof value === 'number') {
            const d = new Date(Math.round((value - 25569) * 86400 * 1000))
            return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
        }
        const s = String(value).trim()
        // DD-MM-YYYY o DD/MM/YYYY
        const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
        // YYYY-MM-DD (ya correcto)
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
        return s
    }

    const parseLedgerExcel = async (file: File): Promise<LedgerTransaction[]> => {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet)
        if (data.length === 0) return []

        // Mapea los encabezados reales del archivo a los campos que necesitamos.
        // Soporta variantes: "Fecha Elaboración", "Débito"/"Debe", "Crédito"/"Haber", etc.
        const headers = Object.keys(data[0])
        // Busca por prioridad de candidato (no por orden de columnas): así el
        // resultado es determinista aunque el archivo cambie el orden.
        const findCol = (candidates: string[], exclude: string[] = []) => {
            for (const c of candidates) {
                const hit = headers.find(h => {
                    const n = normalizeHeader(h)
                    if (exclude.some(e => n.includes(e))) return false
                    return n.includes(c)
                })
                if (hit) return hit
            }
            return undefined
        }

        // "saldo" se excluye para no confundir "Saldo inicial"/"Saldo total" con montos
        const colDate = findCol(['fecha', 'date'])
        const colDesc = findCol(['descripcion', 'concepto', 'detalle', 'description'])
        // El nombre del tercero es clave para cruzar contra el extracto
        const colTercero = findCol(['nombre tercero', 'tercero', 'beneficiario', 'razon social'])
        const colDebit = findCol(['debito', 'debe', 'debit'], ['saldo'])
        const colCredit = findCol(['credito', 'haber', 'credit'], ['saldo'])
        const colRef = findCol(['comprobante', 'referencia', 'reference', 'documento', 'numero'])

        const num = (v: unknown) => {
            if (typeof v === 'number') return v
            if (v == null || v === '') return 0
            // Quita separadores de miles y símbolos, respeta la coma decimal
            const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
            return parseFloat(s) || 0
        }

        return data
            .map(row => {
                const desc = String((colDesc ? row[colDesc] : '') ?? '').trim()
                const tercero = String((colTercero ? row[colTercero] : '') ?? '').trim()
                return {
                    date: normalizeDate(colDate ? row[colDate] : ''),
                    // Descripción + tercero: máximo contexto para el cruce
                    description: [desc, tercero].filter(Boolean).join(' — '),
                    debit: num(colDebit ? row[colDebit] : 0),
                    credit: num(colCredit ? row[colCredit] : 0),
                    reference: String((colRef ? row[colRef] : '') ?? '').trim(),
                }
            })
            // Descarta filas sin movimiento (totales, separadores)
            .filter(r => r.debit !== 0 || r.credit !== 0)
    }

    const performReconciliation = (
        bankTransactions: BankTransaction[],
        ledgerTransactions: LedgerTransaction[]
    ): ReconciliationResult => {
        const matched: MatchGroup[] = []
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
                    matched.push({ bank: [bankTx], ledger: [ledgerTx] })
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

    // Cruce con IA cuando el usuario da instrucciones personalizadas
    // (consolidaciones 1:N, criterios propios, etc.)
    const performAIReconciliation = async (
        bankTransactions: BankTransaction[],
        ledgerTransactions: LedgerTransaction[],
        userInstructions: string
    ): Promise<ReconciliationResult> => {
        const ai = await reconcileBankWithAI(bankTransactions, ledgerTransactions, userInstructions)

        const matched: MatchGroup[] = ai.matched.map(g => ({
            bank: g.bank.map(i => bankTransactions[i]),
            ledger: g.ledger.map(i => ledgerTransactions[i]),
            note: g.note
        }))
        const unmatchedBank = ai.unmatchedBank.map(i => bankTransactions[i])
        const unmatchedLedger = ai.unmatchedLedger.map(i => ledgerTransactions[i])

        return {
            matched,
            unmatchedBank,
            unmatchedLedger,
            aiNotes: ai.notes,
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

            // 3. Perform reconciliation: con IA si hay instrucciones personalizadas,
            //    de lo contrario cruce local exacto por montos
            const reconciliationResult = instructions.trim()
                ? await performAIReconciliation(bankTransactions, ledgerTransactions, instructions.trim())
                : performReconciliation(bankTransactions, ledgerTransactions)

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

        const coincidencias = XLSX.utils.json_to_sheet(result.matched.map((m, idx) => ({
            'Grupo': idx + 1,
            'Fecha Banco': m.bank.map(t => t.date).join(' | '),
            'Descripción Banco': m.bank.map(t => t.description).join(' | '),
            'Monto Banco': m.bank.reduce((s, t) => s + t.amount, 0),
            'Referencia Banco': m.bank.map(t => t.reference || '').filter(Boolean).join(' | '),
            'Fecha Contable': m.ledger.map(t => t.date).join(' | '),
            'Descripción Contable': m.ledger.map(t => t.description).join(' | '),
            'Débito': m.ledger.reduce((s, t) => s + t.debit, 0),
            'Crédito': m.ledger.reduce((s, t) => s + t.credit, 0),
            'Nota IA': m.note || '',
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
        setInstructions('')
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

                {/* Custom Instructions */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-8">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-6 h-6 text-[#009FE3]" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Instrucciones personalizadas para la IA (opcional)</h3>
                            <p className="text-sm text-slate-500">
                                Advierte al modelo sobre particularidades de tu contabilidad para que las tenga en cuenta al cruzar.
                            </p>
                        </div>
                    </div>
                    <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        placeholder={'Ejemplos:\n• "El pago de nómina aparece consolidado en el extracto, pero en contabilidad está desagregado por empleado: consolida los registros de nómina al cruzar."\n• "Ignora diferencias menores a $1.000 por redondeo del banco."'}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900 text-sm resize-y"
                    />
                    {instructions.trim() && (
                        <p className="text-xs text-[#009FE3] mt-2 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            El cruce se hará con IA aplicando tus instrucciones (puede tardar un poco más).
                        </p>
                    )}
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

                        {result.aiNotes && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-[#009FE3] flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-slate-900 text-sm mb-1">Notas del cruce con IA</p>
                                    <p className="text-sm text-slate-600">{result.aiNotes}</p>
                                </div>
                            </div>
                        )}

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

                        {/* Detalle de grupos consolidados (1:N o N:1) */}
                        {result.matched.some(g => g.bank.length > 1 || g.ledger.length > 1 || g.note) && (
                            <div className="mb-6">
                                <h4 className="font-semibold text-slate-900 text-sm mb-3">Cruces consolidados por la IA</h4>
                                <div className="space-y-2">
                                    {result.matched
                                        .filter(g => g.bank.length > 1 || g.ledger.length > 1 || g.note)
                                        .map((g, idx) => (
                                            <div key={idx} className="border border-slate-200 rounded-xl p-4 text-sm">
                                                <div className="grid md:grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Banco ({g.bank.length})</p>
                                                        {g.bank.map((t, i) => (
                                                            <p key={i} className="text-slate-700">{t.date} — {t.description} — <span className="font-mono">{t.amount.toLocaleString('es-CO')}</span></p>
                                                        ))}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Contable ({g.ledger.length})</p>
                                                        {g.ledger.map((t, i) => (
                                                            <p key={i} className="text-slate-700">{t.date} — {t.description} — <span className="font-mono">D:{t.debit.toLocaleString('es-CO')} C:{t.credit.toLocaleString('es-CO')}</span></p>
                                                        ))}
                                                    </div>
                                                </div>
                                                {g.note && (
                                                    <p className="text-xs text-[#009FE3] mt-2 flex items-center gap-1">
                                                        <Sparkles className="w-3 h-3 flex-shrink-0" /> {g.note}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

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
