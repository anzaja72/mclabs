'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
    Loader2, Play, BarChart3, Download, FileSpreadsheet, Upload, User,
    CheckCircle2, AlertCircle, X, Sparkles, Printer, TrendingUp, Scale
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { analizarEstadosFinancieros, NeedsPurchaseError } from '@/lib/ai-service'
import type { AnalisisEstados } from '@/lib/ai-service'
import { parsearCuentasDesdeHoja, construirEstados } from '@/lib/estados-financieros'
import type { EstadosFinancieros, LineaEstado } from '@/lib/estados-financieros'
import { useCredits } from '@/lib/credits-context'
import { CreditsBanner } from '@/components/credits-banner'
import { PaywallModal } from '@/components/paywall-modal'

const fmt = (v: number) => {
    const abs = Math.abs(v).toLocaleString('es-CO', { maximumFractionDigits: 0 })
    return v < 0 ? `(${abs})` : abs
}

export default function DashboardsPage() {
    const { user } = useAuth()
    const { getToolCredits, refreshCredits } = useCredits()
    const [showPaywall, setShowPaywall] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [empresa, setEmpresa] = useState('')
    const [fechaCorte, setFechaCorte] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [estados, setEstados] = useState<EstadosFinancieros | null>(null)
    const [analisis, setAnalisis] = useState<AnalisisEstados | null>(null)
    const [analizando, setAnalizando] = useState(false)
    const [analisisSegundos, setAnalisisSegundos] = useState(0)
    const [analisisError, setAnalisisError] = useState('')

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) setFile(f)
    }

    /** Resumen compacto de los estados para el análisis IA. */
    const resumenParaIA = (e: EstadosFinancieros): string => {
        const bg = e.balanceGeneral, er = e.estadoResultados
        const lineas = (arr: LineaEstado[]) =>
            arr.map(l => `  ${l.codigo} ${l.nombre}: ${l.valor}`).join('\n')
        return `EMPRESA: ${empresa || 'No indicada'} | CORTE: ${fechaCorte || 'No indicado'} | CIFRAS EN COP

BALANCE GENERAL
Activo corriente (total ${bg.totalActivoCorriente}):
${lineas(bg.activoCorriente)}
Activo no corriente (total ${bg.totalActivoNoCorriente}):
${lineas(bg.activoNoCorriente)}
TOTAL ACTIVO: ${bg.totalActivo}
Pasivo corriente (total ${bg.totalPasivoCorriente}):
${lineas(bg.pasivoCorriente)}
Pasivo no corriente (total ${bg.totalPasivoNoCorriente}):
${lineas(bg.pasivoNoCorriente)}
TOTAL PASIVO: ${bg.totalPasivo}
Patrimonio (total ${bg.totalPatrimonio}):
${lineas(bg.patrimonio)}
CUADRE: ${bg.validacion.cuadra ? 'CUADRA' : `NO CUADRA, diferencia ${bg.validacion.diferencia}`}

ESTADO DE RESULTADOS (por función)
Ingresos netos: ${er.ingresosNetos}
Costo de ventas: ${er.totalCostoVentas}
Utilidad bruta: ${er.utilidadBruta} (margen ${er.margenes.bruto}%)
Otros ingresos: ${er.totalOtrosIngresos}
Gastos de administración: ${er.totalGastosAdmin}
Gastos de ventas: ${er.totalGastosVentas}
Utilidad operacional: ${er.utilidadOperacional} (margen ${er.margenes.operacional}%)
EBITDA: ${er.ebitda} (margen ${er.margenes.ebitda}%)
Gastos no operacionales: ${er.totalGastosNoOperacionales}
Utilidad antes de impuestos: ${er.utilidadAntesImpuestos}
Impuestos: ${er.totalImpuestos}
UTILIDAD NETA: ${er.utilidadNeta} (margen ${er.margenes.neto}%)

RATIOS
ROA: ${e.ratios.roa}% | ROE: ${e.ratios.roe}% | Endeudamiento: ${e.ratios.endeudamiento}% | Razón corriente: ${e.ratios.razonCorriente}`
    }

    const lanzarAnalisis = async (e: EstadosFinancieros) => {
        setAnalizando(true)
        setAnalisisSegundos(0)
        setAnalisisError('')
        try {
            const a = await analizarEstadosFinancieros(resumenParaIA(e), s => setAnalisisSegundos(s))
            setAnalisis(a)
            refreshCredits()
        } catch (err: unknown) {
            if (err instanceof NeedsPurchaseError) setShowPaywall(true)
            setAnalisisError(err instanceof Error ? err.message : 'No se pudo generar el análisis')
        } finally {
            setAnalizando(false)
        }
    }

    const handleGenerar = async () => {
        if (!file) return
        setIsProcessing(true)
        setErrorMessage('')
        setEstados(null)
        setAnalisis(null)
        setAnalisisError('')

        try {
            if (getToolCredits('dashboards') <= 0) {
                setShowPaywall(true)
                return
            }
            const buf = await file.arrayBuffer()
            const wb = XLSX.read(buf, { type: 'array' })
            // Hoja completa (fila por fila): el parser localiza los encabezados
            // automáticamente aunque haya títulos arriba, y entiende los
            // formatos de exporte de los software contables.
            const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
            const cuentas = parsearCuentasDesdeHoja(aoa)
            if (cuentas.length === 0) {
                throw new Error('No se encontraron cuentas PUC en el archivo. El sistema busca una columna de cuenta (código PUC) y columnas de débito/crédito o saldo, incluso si hay títulos encima. Si tu software exporta distinto, envíanos el archivo a soporte.')
            }
            const e = construirEstados(cuentas)
            setEstados(e)
            // El análisis IA corre en paralelo: el usuario ya ve los estados
            void lanzarAnalisis(e)
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Error procesando el archivo')
        } finally {
            setIsProcessing(false)
        }
    }

    /* ============ Exportaciones ============ */

    const armarLibro = () => {
        if (!estados) return null
        const bg = estados.balanceGeneral, er = estados.estadoResultados
        const wb = XLSX.utils.book_new()
        const enc: (string | number)[][] = [
            [empresa || 'Estados Financieros'],
            [`Corte: ${fechaCorte || new Date().toISOString().slice(0, 10)} — Cifras en pesos colombianos`],
            [],
        ]

        const filasBG: (string | number)[][] = [
            ...enc, ['BALANCE GENERAL / ESTADO DE SITUACIÓN FINANCIERA'], [],
            ['', 'ACTIVO CORRIENTE'],
            ...bg.activoCorriente.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'Total activo corriente', bg.totalActivoCorriente], [],
            ['', 'ACTIVO NO CORRIENTE'],
            ...bg.activoNoCorriente.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'Total activo no corriente', bg.totalActivoNoCorriente], [],
            ['', 'TOTAL ACTIVO', bg.totalActivo], [],
            ['', 'PASIVO CORRIENTE'],
            ...bg.pasivoCorriente.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'Total pasivo corriente', bg.totalPasivoCorriente], [],
            ['', 'PASIVO NO CORRIENTE'],
            ...bg.pasivoNoCorriente.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'Total pasivo no corriente', bg.totalPasivoNoCorriente], [],
            ['', 'TOTAL PASIVO', bg.totalPasivo], [],
            ['', 'PATRIMONIO'],
            ...bg.patrimonio.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'TOTAL PATRIMONIO', bg.totalPatrimonio], [],
            ['', 'TOTAL PASIVO + PATRIMONIO', bg.totalPasivo + bg.totalPatrimonio],
            ['', bg.validacion.cuadra ? 'ECUACIÓN PATRIMONIAL CUADRADA' : `DESCUADRE: ${bg.validacion.diferencia}`],
        ]
        const filasER: (string | number)[][] = [
            ...enc, ['ESTADO DE RESULTADOS (por función — NIC 1)'], [],
            ['', 'Ingresos operacionales'],
            ...er.ingresosOperacionales.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]),
            ['', 'Ingresos netos', er.ingresosNetos], [],
            ['', 'Costo de ventas'],
            ...er.costoVentas.map(l => [l.codigo, l.nombre, -l.valor] as (string | number)[]),
            ['', 'UTILIDAD BRUTA', er.utilidadBruta],
            ['', `Margen bruto: ${er.margenes.bruto}%`], [],
            ['', 'Otros ingresos'],
            ...er.otrosIngresos.map(l => [l.codigo, l.nombre, l.valor] as (string | number)[]), [],
            ['', 'Gastos de administración'],
            ...er.gastosAdmin.map(l => [l.codigo, l.nombre, -l.valor] as (string | number)[]),
            ['', 'Gastos de ventas'],
            ...er.gastosVentas.map(l => [l.codigo, l.nombre, -l.valor] as (string | number)[]),
            ['', 'UTILIDAD OPERACIONAL', er.utilidadOperacional],
            ['', `Margen operacional: ${er.margenes.operacional}% — EBITDA: ${er.ebitda} (${er.margenes.ebitda}%)`], [],
            ['', 'Gastos no operacionales'],
            ...er.gastosNoOperacionales.map(l => [l.codigo, l.nombre, -l.valor] as (string | number)[]),
            ['', 'UTILIDAD ANTES DE IMPUESTOS', er.utilidadAntesImpuestos],
            ...er.impuestos.map(l => [l.codigo, l.nombre, -l.valor] as (string | number)[]),
            ['', 'UTILIDAD NETA DEL EJERCICIO', er.utilidadNeta],
            ['', `Margen neto: ${er.margenes.neto}%`],
        ]
        const filasRatios: (string | number)[][] = [
            ...enc, ['RATIOS FINANCIEROS'], [],
            ['', 'Margen bruto', `${er.margenes.bruto}%`],
            ['', 'Margen operacional', `${er.margenes.operacional}%`],
            ['', 'Margen EBITDA', `${er.margenes.ebitda}%`],
            ['', 'Margen neto', `${er.margenes.neto}%`],
            ['', 'ROA', `${estados.ratios.roa}%`],
            ['', 'ROE', `${estados.ratios.roe}%`],
            ['', 'Endeudamiento', `${estados.ratios.endeudamiento}%`],
            ['', 'Razón corriente', estados.ratios.razonCorriente],
        ]

        const agregar = (titulo: string, filas: (string | number)[][], anchos = [{ wch: 12 }, { wch: 48 }, { wch: 20 }]) => {
            const ws = XLSX.utils.aoa_to_sheet(filas)
            ws['!cols'] = anchos
            XLSX.utils.book_append_sheet(wb, ws, titulo)
        }
        agregar('Balance General', filasBG)
        agregar('Estado de Resultados', filasER)
        agregar('Ratios', filasRatios)

        if (analisis) {
            const filasIA: (string | number)[][] = [
                ['DIAGNÓSTICO IA'], [analisis.diagnostico], [],
                ['ALERTAS'], ...analisis.alertas.map(a => [a] as (string | number)[]), [],
                ['FORTALEZAS'], ...analisis.fortalezas.map(f => [f] as (string | number)[]), [],
                ['RECOMENDACIONES'], ...analisis.recomendaciones.map(r => [`${r.titulo}: ${r.detalle}`] as (string | number)[]), [],
                ['NOTAS SUGERIDAS (NIC 1)'], ...analisis.notas.map(n => [`${n.titulo}: ${n.contenido}`] as (string | number)[]),
            ]
            agregar('Diagnóstico IA', filasIA, [{ wch: 110 }])
        }
        return wb
    }

    const handleExportExcel = () => {
        const wb = armarLibro()
        if (wb) XLSX.writeFile(wb, `Estados_Financieros_${(empresa || 'Empresa').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    const handleExportPDF = () => window.print()

    /* ============ Render ============ */

    const Seccion = ({ titulo, lineas, total, totalLabel }: {
        titulo: string; lineas: LineaEstado[]; total: number; totalLabel: string
    }) => (
        <>
            <tr><td colSpan={3} className="pt-3 pb-1 font-semibold text-slate-700 text-xs uppercase tracking-wide">{titulo}</td></tr>
            {lineas.map((l, i) => (
                <tr key={`${l.codigo}-${i}`} className="border-b border-slate-50">
                    <td className="py-1 pr-3 text-slate-400 text-xs whitespace-nowrap">{l.codigo}</td>
                    <td className="py-1 pr-3 text-slate-700">{l.nombre}</td>
                    <td className={`py-1 text-right whitespace-nowrap ${l.valor < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(l.valor)}</td>
                </tr>
            ))}
            <tr className="border-t border-slate-200">
                <td></td>
                <td className="py-1.5 font-semibold text-slate-900">{totalLabel}</td>
                <td className="py-1.5 text-right font-bold text-slate-900 whitespace-nowrap">{fmt(total)}</td>
            </tr>
        </>
    )

    const LineaTotal = ({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) => (
        <tr className={destaque ? 'bg-blue-50' : ''}>
            <td></td>
            <td className={`py-2 font-bold ${destaque ? 'text-[#009FE3]' : 'text-slate-900'}`}>{label}</td>
            <td className={`py-2 text-right font-bold whitespace-nowrap ${destaque ? 'text-[#009FE3]' : 'text-slate-900'}`}>{fmt(valor)}</td>
        </tr>
    )

    const bg = estados?.balanceGeneral
    const er = estados?.estadoResultados

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-white">
            {/* Estilos de impresión: el PDF sale de #reporte-imprimible */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #reporte-imprimible, #reporte-imprimible * { visibility: visible; }
                    #reporte-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; display: block !important; }
                    #reporte-imprimible > div { page-break-inside: avoid; margin-bottom: 24px; }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Header (consistente con las demás herramientas) */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/50 no-print">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-2">
                            <Image src="/mc-labs-logo.png" alt="MC Labs" width={36} height={36} className="object-contain" />
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900">MC Labs</span>
                                <span className="text-[10px] text-[#009FE3] font-medium -mt-1">ACCOUNTING AI</span>
                            </div>
                        </Link>
                        <nav className="hidden md:flex items-center gap-1">
                            <Link href="/" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">Dashboard</Link>
                            <Link href="/conciliator" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">Fiscal</Link>
                            <Link href="/bank-recs" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">Bancario</Link>
                            <Link href="/dashboards" className="px-4 py-2 text-sm font-medium text-[#009FE3] bg-blue-50 rounded-lg">Tableros</Link>
                            <Link href="/extractor" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">Extractor</Link>
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

            <main className="container py-8">
                <div className="flex items-start justify-between mb-8 no-print">
                    <div>
                        <div className="flex items-center gap-2 text-[#009FE3] text-sm font-semibold mb-2">
                            <BarChart3 className="w-4 h-4" />
                            TABLEROS FINANCIEROS
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">Estados Financieros desde el Libro Auxiliar</h1>
                        <p className="text-slate-500 mt-2 max-w-2xl">
                            Sube el balance de prueba o libro auxiliar (Excel) y obtén el Balance General y el
                            Estado de Resultados bajo NIIF/PUC, con análisis profesional generado con IA.
                        </p>
                    </div>
                </div>

                <div className="no-print mb-6"><CreditsBanner tool="dashboards" toolLabel="Tableros Financieros" /></div>

                {/* Carga */}
                <div className="grid md:grid-cols-3 gap-6 mb-6 no-print">
                    <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileSpreadsheet className="w-6 h-6 text-[#009FE3]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Libro auxiliar o balance de prueba</h3>
                                <p className="text-sm text-slate-500">Excel con código de cuenta PUC y débito/crédito (o saldo)</p>
                            </div>
                        </div>
                        <label className={`mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${file ? 'border-green-300 bg-green-50/50' : 'border-slate-200 hover:border-[#009FE3] hover:bg-blue-50/30'}`}>
                            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
                            {file ? (
                                <>
                                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                                    <span className="text-sm font-medium text-slate-800">{file.name}</span>
                                    <button type="button" onClick={(e) => { e.preventDefault(); setFile(null) }} className="text-xs text-red-500 flex items-center gap-1"><X className="w-3 h-3" />Eliminar</button>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-slate-300" />
                                    <span className="text-sm text-slate-500">Haz clic para subir el archivo</span>
                                </>
                            )}
                        </label>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                        <h3 className="font-bold text-slate-900">Datos del reporte</h3>
                        <div>
                            <label className="text-sm font-medium text-slate-600">Nombre de la empresa</label>
                            <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Mi Empresa S.A.S."
                                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-600">Fecha de corte</label>
                            <input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
                                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-3 mb-10 no-print">
                    <Button size="lg" onClick={handleGenerar} disabled={!file || isProcessing}
                        className="bg-[#009FE3] hover:bg-[#0088c7] text-white rounded-full px-10 py-6 text-base font-semibold shadow-lg shadow-blue-500/25">
                        {isProcessing ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Procesando…</>) : (<><Play className="mr-2 h-5 w-5" />Generar Estados Financieros</>)}
                    </Button>
                    <p className="text-sm text-slate-400">Los estados aparecen al instante; el análisis IA se genera en paralelo.</p>
                </div>

                {errorMessage && (
                    <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 no-print">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div><p className="font-semibold text-red-700">Error</p><p className="text-sm text-red-600">{errorMessage}</p></div>
                    </div>
                )}

                {/* ============ RESULTADOS ============ */}
                {estados && bg && er && (
                    <div className="space-y-8">
                        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${bg.validacion.cuadra ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {bg.validacion.cuadra
                                    ? (<><CheckCircle2 className="w-4 h-4" />Ecuación patrimonial cuadrada (A = P + Pt)</>)
                                    : (<><AlertCircle className="w-4 h-4" />Descuadre: ${fmt(bg.validacion.diferencia)} — revisa el análisis IA</>)}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleExportExcel} className="flex items-center gap-2">
                                    <Download className="w-4 h-4" />Excel
                                </Button>
                                <Button variant="outline" onClick={handleExportPDF} className="flex items-center gap-2">
                                    <Printer className="w-4 h-4" />PDF
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
                            {[
                                { label: 'Total Activo', v: bg.totalActivo },
                                { label: 'Total Pasivo', v: bg.totalPasivo },
                                { label: 'Patrimonio', v: bg.totalPatrimonio },
                                { label: 'Utilidad Neta', v: er.utilidadNeta },
                            ].map(k => (
                                <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                                    <p className={`text-xl font-bold ${k.v < 0 ? 'text-red-600' : 'text-slate-900'}`}>${fmt(k.v)}</p>
                                    <p className="text-xs text-slate-500">{k.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Área imprimible: los dos estados */}
                        <div id="reporte-imprimible" className="grid lg:grid-cols-2 gap-6 items-start">
                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="mb-4">
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><Scale className="w-5 h-5 text-[#009FE3]" />Balance General</h3>
                                    <p className="text-xs text-slate-500">{empresa || 'Estado de Situación Financiera'} — {fechaCorte || 'a la fecha del archivo'} — Cifras en COP</p>
                                </div>
                                <table className="w-full text-sm">
                                    <tbody>
                                        <Seccion titulo="Activo corriente" lineas={bg.activoCorriente} total={bg.totalActivoCorriente} totalLabel="Total activo corriente" />
                                        <Seccion titulo="Activo no corriente" lineas={bg.activoNoCorriente} total={bg.totalActivoNoCorriente} totalLabel="Total activo no corriente" />
                                        <LineaTotal label="TOTAL ACTIVO" valor={bg.totalActivo} destaque />
                                        <Seccion titulo="Pasivo corriente" lineas={bg.pasivoCorriente} total={bg.totalPasivoCorriente} totalLabel="Total pasivo corriente" />
                                        <Seccion titulo="Pasivo no corriente" lineas={bg.pasivoNoCorriente} total={bg.totalPasivoNoCorriente} totalLabel="Total pasivo no corriente" />
                                        <LineaTotal label="TOTAL PASIVO" valor={bg.totalPasivo} />
                                        <Seccion titulo="Patrimonio" lineas={bg.patrimonio} total={bg.totalPatrimonio} totalLabel="Total patrimonio" />
                                        <LineaTotal label="TOTAL PASIVO + PATRIMONIO" valor={bg.totalPasivo + bg.totalPatrimonio} destaque />
                                    </tbody>
                                </table>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200 p-6">
                                <div className="mb-4">
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#009FE3]" />Estado de Resultados</h3>
                                    <p className="text-xs text-slate-500">{empresa ? `${empresa} — ` : ''}Por función (NIC 1) — Cifras en COP</p>
                                </div>
                                <table className="w-full text-sm">
                                    <tbody>
                                        <Seccion titulo="Ingresos operacionales" lineas={er.ingresosOperacionales} total={er.ingresosNetos} totalLabel="Ingresos netos" />
                                        <Seccion titulo="Costo de ventas" lineas={er.costoVentas.map(l => ({ ...l, valor: -l.valor }))} total={er.utilidadBruta} totalLabel={`UTILIDAD BRUTA (${er.margenes.bruto}%)`} />
                                        {er.otrosIngresos.length > 0 && (
                                            <Seccion titulo="Otros ingresos" lineas={er.otrosIngresos} total={er.totalOtrosIngresos} totalLabel="Total otros ingresos" />
                                        )}
                                        <Seccion titulo="Gastos de administración" lineas={er.gastosAdmin.map(l => ({ ...l, valor: -l.valor }))} total={-er.totalGastosAdmin} totalLabel="Total gastos de administración" />
                                        {er.gastosVentas.length > 0 && (
                                            <Seccion titulo="Gastos de ventas" lineas={er.gastosVentas.map(l => ({ ...l, valor: -l.valor }))} total={-er.totalGastosVentas} totalLabel="Total gastos de ventas" />
                                        )}
                                        <LineaTotal label={`UTILIDAD OPERACIONAL (${er.margenes.operacional}%)`} valor={er.utilidadOperacional} destaque />
                                        <tr><td></td><td className="py-1 text-slate-500 text-xs">EBITDA: ${fmt(er.ebitda)} ({er.margenes.ebitda}%)</td><td></td></tr>
                                        {er.gastosNoOperacionales.length > 0 && (
                                            <Seccion titulo="Gastos no operacionales" lineas={er.gastosNoOperacionales.map(l => ({ ...l, valor: -l.valor }))} total={er.utilidadAntesImpuestos} totalLabel="UTILIDAD ANTES DE IMPUESTOS" />
                                        )}
                                        {er.impuestos.length > 0 && (
                                            <Seccion titulo="Impuesto de renta" lineas={er.impuestos.map(l => ({ ...l, valor: -l.valor }))} total={-er.totalImpuestos} totalLabel="Total impuestos" />
                                        )}
                                        <LineaTotal label={`UTILIDAD NETA (${er.margenes.neto}%)`} valor={er.utilidadNeta} destaque />
                                    </tbody>
                                </table>

                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                    {[
                                        ['ROA', `${estados.ratios.roa}%`], ['ROE', `${estados.ratios.roe}%`],
                                        ['Endeudamiento', `${estados.ratios.endeudamiento}%`], ['Razón corriente', String(estados.ratios.razonCorriente)],
                                    ].map(([k, v]) => (
                                        <div key={k} className="flex justify-between px-3 py-2 bg-slate-50 rounded-lg">
                                            <span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ============ Análisis IA (en paralelo, sin botón) ============ */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 no-print">
                            {analizando && !analisis && (
                                <div className="flex items-start gap-3">
                                    <Loader2 className="w-5 h-5 text-slate-500 animate-spin flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Generando análisis financiero con IA… {analisisSegundos > 0 ? `${analisisSegundos}s` : ''}</p>
                                        <p className="text-xs text-slate-500 mt-1">Diagnóstico, alertas, interpretación de ratios y notas sugeridas. Puedes revisar los estados mientras tanto.</p>
                                    </div>
                                </div>
                            )}
                            {!analizando && !analisis && analisisError && (
                                <div className="flex flex-col items-start gap-2">
                                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg w-full">
                                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-700">{analisisError}</p>
                                    </div>
                                    <Button variant="outline" onClick={() => estados && lanzarAnalisis(estados)} className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" />Reintentar análisis
                                    </Button>
                                </div>
                            )}
                            {analisis && (
                                <div className="space-y-5">
                                    <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#009FE3]" />Análisis financiero</h3>
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                        <p className="text-sm text-slate-700 leading-relaxed">{analisis.diagnostico}</p>
                                    </div>
                                    {analisis.alertas.length > 0 && (
                                        <div className="space-y-2">
                                            {analisis.alertas.map((a, i) => (
                                                <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm text-amber-900">{a}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {analisis.fortalezas.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold text-slate-900 mb-2">Fortalezas</h4>
                                                <ul className="space-y-1.5">
                                                    {analisis.fortalezas.map((f, i) => (
                                                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />{f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {analisis.interpretacionRatios.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold text-slate-900 mb-2">Ratios interpretados</h4>
                                                <ul className="space-y-1.5">
                                                    {analisis.interpretacionRatios.map((r, i) => (
                                                        <li key={i} className="text-sm text-slate-700">
                                                            <span className="font-semibold">{r.ratio} ({r.valor}):</span> {r.interpretacion}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                    {analisis.recomendaciones.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Recomendaciones</h4>
                                            <div className="grid md:grid-cols-2 gap-3">
                                                {analisis.recomendaciones.map((r, i) => (
                                                    <div key={i} className="p-3 border border-slate-200 rounded-lg">
                                                        <p className="text-sm font-semibold text-slate-800">{r.titulo}</p>
                                                        <p className="text-sm text-slate-600 mt-1">{r.detalle}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {analisis.notas.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-2">Notas sugeridas a los EEFF (NIC 1)</h4>
                                            <div className="space-y-2">
                                                {analisis.notas.map((n, i) => (
                                                    <div key={i} className="p-3 bg-slate-50 rounded-lg">
                                                        <p className="text-sm font-semibold text-slate-800">{n.titulo}</p>
                                                        <p className="text-sm text-slate-600 mt-1">{n.contenido}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Features */}
                <div className="grid md:grid-cols-3 gap-6 mt-16 no-print">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Scale className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Clasificación PUC automática</h4>
                            <p className="text-sm text-slate-500">Cada cuenta se clasifica por su código PUC según NIIF/ColGAAP: instantáneo y verificable.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Validación de cuadre</h4>
                            <p className="text-sm text-slate-500">La ecuación patrimonial A = P + Pt se verifica automáticamente y el descuadre se diagnostica.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Download className="w-5 h-5 text-[#009FE3]" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-1">Exportación directa</h4>
                            <p className="text-sm text-slate-500">Descarga los estados en Excel (con el diagnóstico IA) o imprímelos a PDF listos para presentar.</p>
                        </div>
                    </div>
                </div>
            </main>

            {showPaywall && (
                <PaywallModal toolName="Tableros Financieros" onClose={() => setShowPaywall(false)} />
            )}

            {/* Footer (consistente) */}
            <footer className="border-t bg-white mt-16 no-print">
                <div className="container py-6 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Image src="/mc-labs-logo.png" alt="MC Labs" width={24} height={24} className="object-contain" />
                        <span className="text-sm font-medium text-slate-700">MC Labs</span>
                    </div>
                    <p className="text-sm text-slate-500">© 2024 MC LABS. TODOS LOS DERECHOS RESERVADOS.</p>
                    <div className="flex gap-6 text-sm text-slate-500">
                        <a href="#" className="hover:text-slate-900">SOPORTE</a>
                        <a href="/legal/tratamiento-de-datos" className="hover:text-slate-900">PRIVACIDAD</a>
                        <a href="#" className="hover:text-slate-900">MANUAL</a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
