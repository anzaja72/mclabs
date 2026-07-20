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
import { extractBankDataFromPDF, reconcileBankWithAI, analizarConciliacion, NeedsPurchaseError } from '@/lib/ai-service'
import type { AnalisisContable } from '@/lib/ai-service'
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
    const { getToolCredits, refreshCredits } = useCredits()
    const [showPaywall, setShowPaywall] = useState(false)
    const [bankFile, setBankFile] = useState<File | null>(null)
    const [ledgerFile, setLedgerFile] = useState<File | null>(null)
    const [instructions, setInstructions] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [progressSeconds, setProgressSeconds] = useState(0)
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [result, setResult] = useState<ReconciliationResult | null>(null)
    const [analisis, setAnalisis] = useState<AnalisisContable | null>(null)
    const [analizando, setAnalizando] = useState(false)
    const [analisisSegundos, setAnalisisSegundos] = useState(0)
    const [analisisError, setAnalisisError] = useState('')
    type DetalleKey = 'banco' | 'contable' | 'coincidencias' | 'sinBanco' | 'sinContable'
    const [detalle, setDetalle] = useState<DetalleKey | null>(null)

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
        setAnalisis(null)
        setAnalisisError('')

        try {
            // 0. Check credits (validación rápida; el servidor valida y descuenta de forma definitiva)
            if (getToolCredits('bank_recs') <= 0) {
                setShowPaywall(true)
                setIsProcessing(false)
                setStatus('idle')
                return
            }

            // 1. Extraer el extracto (corre en segundo plano; ~40-90s según el tamaño)
            const { transactions: bankTransactions } = await extractBankDataFromPDF(
                bankFile,
                (segundos) => setProgressSeconds(segundos)
            )
            setProgressSeconds(0)
            // El crédito se descuenta en el servidor: refrescar el saldo
            refreshCredits()

            // 2. Parse ledger Excel file
            const ledgerTransactions = await parseLedgerExcel(ledgerFile)

            // 3. Perform reconciliation: con IA si hay instrucciones personalizadas,
            //    de lo contrario cruce local exacto por montos
            const reconciliationResult = instructions.trim()
                ? await performAIReconciliation(bankTransactions, ledgerTransactions, instructions.trim())
                : performReconciliation(bankTransactions, ledgerTransactions)

            setResult(reconciliationResult)
            setStatus('success')
            // El informe contable se genera en paralelo: no bloquea los resultados
            void lanzarAnalisisContable(reconciliationResult)
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

    /**
     * Genera el informe contable EN PARALELO: se dispara apenas hay resultados
     * del cruce, sin bloquearlos. El usuario ve las coincidencias de una vez y
     * el informe va apareciendo cuando termina.
     */
    const lanzarAnalisisContable = async (res: ReconciliationResult) => {
        if (res.unmatchedBank.length === 0 && res.unmatchedLedger.length === 0) return
        setAnalizando(true)
        setAnalisisSegundos(0)
        setAnalisisError('')
        try {
            const a = await analizarConciliacion(
                res.unmatchedBank,
                res.unmatchedLedger,
                (s) => setAnalisisSegundos(s)
            )
            setAnalisis(a)
        } catch (e: any) {
            setAnalisisError(e?.message || 'No se pudo generar el informe contable')
        } finally {
            setAnalizando(false)
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

        // Listas COMPLETAS con el estado de cada partida
        const todasBanco = [
            ...result.matched.flatMap((m, i) => m.bank.map(t => ({ ...t, estado: `Conciliada (grupo ${i + 1})` }))),
            ...result.unmatchedBank.map(t => ({ ...t, estado: 'Sin cruzar' })),
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todasBanco.map(t => ({
            'Fecha': t.date, 'Descripción': t.description, 'Monto': t.amount,
            'Referencia': t.reference || '', 'Estado': t.estado,
        }))), 'Extracto (todas)')

        const todasContable = [
            ...result.matched.flatMap((m, i) => m.ledger.map(t => ({ ...t, estado: `Conciliada (grupo ${i + 1})` }))),
            ...result.unmatchedLedger.map(t => ({ ...t, estado: 'Sin cruzar' })),
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todasContable.map(t => ({
            'Fecha': t.date, 'Descripción': t.description, 'Débito': t.debit, 'Crédito': t.credit,
            'Referencia': t.reference || '', 'Estado': t.estado,
        }))), 'Contable (todas)')

        agregarHojasInforme(wb)

        XLSX.writeFile(wb, `Conciliacion_Bancaria_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    /** Hojas del informe contable generado con IA (si existe). */
    const agregarHojasInforme = (wb: XLSX.WorkBook) => {
        if (!analisis) return

        if (analisis.clasificacion?.length) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analisis.clasificacion.map(c => ({
                'Origen': c.origen === 'banco' ? 'Extracto' : 'Libros',
                'Concepto': c.concepto,
                'Movimientos': c.cantidad,
                'Valor': c.valor,
                'Tipo': c.tipo,
                'Naturaleza': c.naturaleza,
                '¿Requiere ajuste?': c.requiereAjuste ? 'Sí' : 'No',
                'Explicación': c.explicacion,
            }))), 'Clasificación')
        }

        if (analisis.asientos?.length) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analisis.asientos.map(a => ({
                'Concepto': a.concepto || '',
                'Cuenta débito': a.debito?.cuenta || '',
                'Nombre débito': a.debito?.nombre || '',
                'Cuenta crédito': a.credito?.cuenta || '',
                'Nombre crédito': a.credito?.nombre || '',
                'Valor': a.valor,
            }))), 'Asientos sugeridos')
        }

        if (analisis.costosBancarios?.conceptos?.length) {
            const filas = analisis.costosBancarios.conceptos.map(c => ({
                'Concepto': c.concepto, 'Movimientos': c.cantidad, 'Valor': c.valor,
            }))
            filas.push({ 'Concepto': 'TOTAL COSTOS Y GASTOS BANCARIOS', 'Movimientos': '' as never, 'Valor': analisis.costosBancarios.total })
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Costos bancarios')
        }

        const diag: Record<string, string>[] = [{ 'Sección': 'Resumen', 'Contenido': analisis.resumen || '' }]
        ;(analisis.alertas || []).forEach((a, i) => diag.push({ 'Sección': `Alerta ${i + 1}`, 'Contenido': a }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diag), 'Diagnóstico IA')
    }

    /** Descarga solo el informe contable generado con IA. */
    const handleDescargarInforme = () => {
        if (!analisis) return
        const wb = XLSX.utils.book_new()
        agregarHojasInforme(wb)
        XLSX.writeFile(wb, `Informe_Contable_${new Date().toISOString().split('T')[0]}.xlsx`)
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
                                href="/dashboards"
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Tableros
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
                                {progressSeconds > 0
                                    ? `Leyendo el extracto… ${progressSeconds}s`
                                    : 'Procesando…'}
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
                        El extracto se procesa en segundo plano: suele tomar entre 40 y 90 segundos.
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

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                            {([
                                { k: 'banco', n: result.summary.totalBankTransactions, label: 'Tx Bancarias', bg: 'bg-slate-50', color: 'text-slate-900', sub: 'text-slate-500', ring: 'ring-slate-300' },
                                { k: 'contable', n: result.summary.totalLedgerTransactions, label: 'Tx Contables', bg: 'bg-slate-50', color: 'text-slate-900', sub: 'text-slate-500', ring: 'ring-slate-300' },
                                { k: 'coincidencias', n: result.summary.matchedCount, label: 'Coincidencias', bg: 'bg-green-50', color: 'text-green-600', sub: 'text-green-600', ring: 'ring-green-400' },
                                { k: 'sinBanco', n: result.summary.unmatchedBankCount, label: 'Sin cruzar (Banco)', bg: 'bg-orange-50', color: 'text-orange-600', sub: 'text-orange-600', ring: 'ring-orange-400' },
                                { k: 'sinContable', n: result.summary.unmatchedLedgerCount, label: 'Sin cruzar (Contable)', bg: 'bg-orange-50', color: 'text-orange-600', sub: 'text-orange-600', ring: 'ring-orange-400' },
                            ] as const).map(c => (
                                <button
                                    key={c.k}
                                    type="button"
                                    onClick={() => setDetalle(detalle === c.k ? null : c.k)}
                                    className={`${c.bg} rounded-xl p-4 text-center transition-all hover:shadow-md ${
                                        detalle === c.k ? `ring-2 ${c.ring}` : ''
                                    }`}
                                >
                                    <p className={`text-2xl font-bold ${c.color}`}>{c.n}</p>
                                    <p className={`text-xs ${c.sub}`}>{c.label}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        {detalle === c.k ? 'ocultar detalle' : 'ver detalle'}
                                    </p>
                                </button>
                            ))}
                        </div>

                        {/* Detalle desplegable de la tarjeta seleccionada */}
                        {detalle && (
                            <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-700">
                                        {detalle === 'banco' && 'Todas las transacciones del extracto'}
                                        {detalle === 'contable' && 'Todos los movimientos contables'}
                                        {detalle === 'coincidencias' && 'Partidas conciliadas (banco ↔ contable)'}
                                        {detalle === 'sinBanco' && 'Partidas del extracto sin cruzar'}
                                        {detalle === 'sinContable' && 'Movimientos contables sin cruzar'}
                                    </span>
                                    <button onClick={() => setDetalle(null)} className="text-slate-400 hover:text-slate-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white shadow-sm">
                                            <tr className="text-left text-slate-500 border-b border-slate-200">
                                                {detalle === 'coincidencias' ? (
                                                    <>
                                                        <th className="py-2 px-4 font-medium">#</th>
                                                        <th className="py-2 px-4 font-medium">Banco</th>
                                                        <th className="py-2 px-4 font-medium">Contable</th>
                                                        <th className="py-2 px-4 font-medium text-right">Valor</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="py-2 px-4 font-medium">Fecha</th>
                                                        <th className="py-2 px-4 font-medium">Descripción</th>
                                                        <th className="py-2 px-4 font-medium">Referencia</th>
                                                        <th className="py-2 px-4 font-medium text-right">Valor</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalle === 'coincidencias' && result.matched.map((m, i) => (
                                                <tr key={i} className="border-b border-slate-100 align-top">
                                                    <td className="py-2 px-4 text-slate-400">{i + 1}</td>
                                                    <td className="py-2 px-4">
                                                        {m.bank.map((t, j) => (
                                                            <div key={j} className="text-slate-800">
                                                                <span className="text-slate-400 mr-2">{t.date}</span>{t.description}
                                                            </div>
                                                        ))}
                                                    </td>
                                                    <td className="py-2 px-4">
                                                        {m.ledger.map((t, j) => (
                                                            <div key={j} className="text-slate-800">
                                                                <span className="text-slate-400 mr-2">{t.date}</span>{t.description}
                                                            </div>
                                                        ))}
                                                        {m.note && <p className="text-xs text-blue-600 mt-1">{m.note}</p>}
                                                    </td>
                                                    <td className="py-2 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                                                        ${Math.abs(m.bank.reduce((s, t) => s + t.amount, 0)).toLocaleString('es-CO')}
                                                    </td>
                                                </tr>
                                            ))}
                                            {(detalle === 'banco' || detalle === 'sinBanco') &&
                                                (detalle === 'banco'
                                                    ? [...result.matched.flatMap(m => m.bank), ...result.unmatchedBank]
                                                    : result.unmatchedBank
                                                ).map((t, i) => (
                                                    <tr key={i} className="border-b border-slate-100">
                                                        <td className="py-2 px-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                                        <td className="py-2 px-4 text-slate-800">{t.description}</td>
                                                        <td className="py-2 px-4 text-slate-400">{t.reference || '—'}</td>
                                                        <td className={`py-2 px-4 text-right font-semibold whitespace-nowrap ${
                                                            t.amount < 0 ? 'text-red-600' : 'text-green-700'
                                                        }`}>
                                                            ${Math.abs(t.amount).toLocaleString('es-CO')}
                                                        </td>
                                                    </tr>
                                                ))}
                                            {(detalle === 'contable' || detalle === 'sinContable') &&
                                                (detalle === 'contable'
                                                    ? [...result.matched.flatMap(m => m.ledger), ...result.unmatchedLedger]
                                                    : result.unmatchedLedger
                                                ).map((t, i) => (
                                                    <tr key={i} className="border-b border-slate-100">
                                                        <td className="py-2 px-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                                        <td className="py-2 px-4 text-slate-800">{t.description}</td>
                                                        <td className="py-2 px-4 text-slate-400">{t.reference || '—'}</td>
                                                        <td className="py-2 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                                                            ${(t.debit || t.credit).toLocaleString('es-CO')}
                                                            <span className="text-xs text-slate-400 ml-1">{t.debit ? 'D' : 'C'}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

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

                        {/* Informe contable (metodología colombiana) */}
                        <div className="border-t border-slate-200 pt-6">
                            {/* El informe se genera solo, en paralelo con los resultados */}
                            {!analisis && analizando && (
                                <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <Loader2 className="w-5 h-5 text-slate-500 animate-spin flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">
                                            Generando informe contable… {analisisSegundos > 0 ? `${analisisSegundos}s` : ''}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Clasifica las partidas sin cruzar (temporales vs. permanentes), consolida los
                                            costos bancarios y propone los asientos con cuentas PUC. Puedes revisar el
                                            detalle del cruce mientras tanto.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {!analisis && !analizando && analisisError && (
                                <div className="flex flex-col items-start gap-2">
                                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg w-full">
                                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-700">{analisisError}</p>
                                    </div>
                                    <Button
                                        onClick={() => result && lanzarAnalisisContable(result)}
                                        variant="outline"
                                        className="flex items-center gap-2"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Reintentar informe contable
                                    </Button>
                                </div>
                            )}

                            {analisis && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <h3 className="font-bold text-slate-900 text-lg">Informe contable</h3>
                                        <Button
                                            variant="outline"
                                            onClick={handleDescargarInforme}
                                            className="flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Descargar informe IA
                                        </Button>
                                    </div>

                                    {/* Costos y gastos bancarios consolidados */}
                                    {analisis.costosBancarios && analisis.costosBancarios.total > 0 && (
                                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                            <div className="flex items-baseline justify-between gap-4 mb-3">
                                                <h4 className="font-semibold text-slate-900">
                                                    Costos y gastos bancarios del período
                                                </h4>
                                                <span className="text-xl font-bold text-blue-700 whitespace-nowrap">
                                                    ${Math.abs(analisis.costosBancarios.total).toLocaleString('es-CO')}
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {analisis.costosBancarios.conceptos?.map((c, i) => (
                                                    <div key={i} className="flex justify-between text-sm text-slate-700">
                                                        <span>
                                                            {c.concepto}
                                                            {c.cantidad > 1 && <span className="text-slate-400"> ×{c.cantidad}</span>}
                                                        </span>
                                                        <span className="whitespace-nowrap">
                                                            ${Math.abs(Number(c.valor)).toLocaleString('es-CO')}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-blue-800 mt-3">
                                                El banco los cobra desagregados; este es el total a reconocer como gasto
                                                financiero{analisis.costosBancarios.cuentaSugerida
                                                    ? ` (cuenta ${analisis.costosBancarios.cuentaSugerida})`
                                                    : ''}.
                                            </p>
                                        </div>
                                    )}

                                    {analisis.resumen && (
                                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-sm text-slate-700 leading-relaxed">{analisis.resumen}</p>
                                        </div>
                                    )}

                                    {analisis.alertas?.length > 0 && (
                                        <div className="space-y-2">
                                            {analisis.alertas.map((a, i) => (
                                                <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm text-amber-900">{a}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {analisis.asientos?.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Asientos contables sugeridos</h4>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-left text-slate-500 border-b border-slate-200">
                                                            <th className="py-2 pr-4 font-medium">Concepto</th>
                                                            <th className="py-2 pr-4 font-medium">Débito</th>
                                                            <th className="py-2 pr-4 font-medium">Crédito</th>
                                                            <th className="py-2 font-medium text-right">Valor</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analisis.asientos.filter(a => a?.valor).map((a, i) => (
                                                            <tr key={i} className="border-b border-slate-100">
                                                                <td className="py-2 pr-4 text-slate-800">{a.concepto || '—'}</td>
                                                                <td className="py-2 pr-4 text-slate-600">{a.debito?.cuenta} {a.debito?.nombre}</td>
                                                                <td className="py-2 pr-4 text-slate-600">{a.credito?.cuenta} {a.credito?.nombre}</td>
                                                                <td className="py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                                                                    ${Math.abs(Number(a.valor)).toLocaleString('es-CO')}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {analisis.clasificacion?.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">
                                                Clasificación de partidas sin cruzar
                                            </h4>
                                            <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="sticky top-0 bg-white">
                                                        <tr className="text-left text-slate-500 border-b border-slate-200">
                                                            <th className="py-2 pr-4 font-medium">Concepto</th>
                                                            <th className="py-2 pr-4 font-medium">Origen</th>
                                                            <th className="py-2 pr-4 font-medium">Naturaleza</th>
                                                            <th className="py-2 font-medium text-right">Valor</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analisis.clasificacion.map((c, i) => (
                                                            <tr key={i} className="border-b border-slate-100">
                                                                <td className="py-2 pr-4">
                                                                    <span className="text-slate-800">{c.concepto}</span>
                                                                    {c.cantidad > 1 && (
                                                                        <span className="text-slate-400"> ×{c.cantidad}</span>
                                                                    )}
                                                                    <p className="text-xs text-slate-500">{c.explicacion}</p>
                                                                </td>
                                                                <td className="py-2 pr-4 text-slate-600">
                                                                    {c.origen === 'banco' ? 'Extracto' : 'Libros'}
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                                                        c.naturaleza === 'permanente'
                                                                            ? 'bg-red-100 text-red-700'
                                                                            : 'bg-blue-100 text-blue-700'
                                                                    }`}>
                                                                        {c.naturaleza === 'permanente' ? 'Requiere ajuste' : 'Temporal'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2 text-right text-slate-900 whitespace-nowrap">
                                                                    ${Math.abs(Number(c.valor || 0)).toLocaleString('es-CO')}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
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
