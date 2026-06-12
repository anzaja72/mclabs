'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { FileUpload } from '@/components/file-upload'
import { DashboardCharts } from '@/components/dashboard-charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RotateCcw, Sparkles, Loader2, Printer, TrendingUp, TrendingDown, Minus, Lightbulb, ArrowRight } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useCredits } from '@/lib/credits-context'
import { CreditsBanner } from '@/components/credits-banner'
import { PaywallModal } from '@/components/paywall-modal'
import { analyzeFinancials, FinancialAnalysis, NeedsPurchaseError } from '@/lib/ai-service'

const MAX_FILE_MB = 4

export default function DashboardsPage() {
    const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [instructions, setInstructions] = useState('')
    const { getToolCredits, setCredits } = useCredits()
    const [showPaywall, setShowPaywall] = useState(false)

    const handleFileSelect = (selected: File | null) => {
        setFile(selected)
        setError(null)
    }

    const handleAnalyze = async () => {
        if (!file) return

        // Validación rápida; el servidor valida y descuenta de forma definitiva
        if (getToolCredits('dashboards') <= 0) {
            setShowPaywall(true)
            return
        }

        if (file.size > MAX_FILE_MB * 1024 * 1024) {
            setError(`El archivo supera ${MAX_FILE_MB} MB. Usa un archivo más liviano.`)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const isTabular = /\.(xlsx|xls|csv)$/i.test(file.name)
            let result

            if (isTabular) {
                const buffer = await file.arrayBuffer()
                const workbook = XLSX.read(buffer, { type: 'array' })
                const sheet = workbook.Sheets[workbook.SheetNames[0]]
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]
                if (rows.length === 0) throw new Error('El archivo no tiene datos legibles.')
                result = await analyzeFinancials({ rows, instructions })
            } else {
                // PDF o imagen: el servidor lo procesa con visión
                result = await analyzeFinancials({ file, instructions })
            }

            if (result.credits) setCredits(result.credits)
            setAnalysis(result.analysis)
        } catch (err: unknown) {
            if (err instanceof NeedsPurchaseError) {
                setShowPaywall(true)
            } else {
                setError(err instanceof Error ? err.message : 'Error al analizar el archivo')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleReset = () => {
        setAnalysis(null)
        setFile(null)
        setInstructions('')
        setError(null)
    }

    const trendIcon = (trend: string) => {
        if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />
        if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />
        return <Minus className="w-4 h-4 text-slate-400" />
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex flex-col gap-2 print:hidden">
                <h1 className="text-3xl font-bold tracking-tight">Tablero Financiero</h1>
                <p className="text-muted-foreground">
                    Sube tu estado financiero (PDF, Excel o CSV) y la IA construirá un tablero con
                    indicadores, gráficos y recomendaciones prácticas, exportable a PDF.
                </p>
            </div>

            {/* Credits Banner */}
            <div className="mb-4 print:hidden">
                <CreditsBanner tool="dashboards" toolLabel="Tableros" />
            </div>

            {/* Paywall Modal */}
            {showPaywall && (
                <PaywallModal
                    toolName="Tableros Financieros"
                    onClose={() => setShowPaywall(false)}
                />
            )}

            {!analysis ? (
                <Card className="max-w-2xl print:hidden">
                    <CardHeader>
                        <CardTitle>Cargar Estado Financiero</CardTitle>
                        <CardDescription>
                            Formatos soportados: .pdf, .xlsx, .xls, .csv (máx. {MAX_FILE_MB} MB)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FileUpload
                            label="Estado financiero (estado de resultados, balance, movimientos...)"
                            accept={{
                                'application/pdf': ['.pdf'],
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                                'application/vnd.ms-excel': ['.xls'],
                                'text/csv': ['.csv']
                            }}
                            onFileSelect={handleFileSelect}
                        />

                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-[#009FE3]" />
                                Instrucciones para el análisis (opcional)
                            </p>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                placeholder={'Ejemplos:\n• "Enfócate en la liquidez y la rotación de cartera."\n• "Compara los márgenes contra el año anterior incluido en el archivo."'}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900 text-sm resize-y"
                            />
                        </div>

                        <Button
                            onClick={handleAnalyze}
                            disabled={!file || loading}
                            className="w-full bg-[#009FE3] hover:bg-[#0088c7] text-white rounded-xl py-6 text-base font-semibold"
                        >
                            {loading ? (
                                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Analizando con IA (30-60 seg)...</>
                            ) : (
                                <><Sparkles className="w-5 h-5 mr-2" /> Generar Tablero con IA</>
                            )}
                        </Button>

                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6" id="financial-report">
                    <div className="flex justify-between items-center print:hidden">
                        <h2 className="text-xl font-semibold">{analysis.title}</h2>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => window.print()}
                                className="bg-[#009FE3] hover:bg-[#0088c7] text-white"
                            >
                                <Printer className="mr-2 h-4 w-4" />
                                Exportar PDF
                            </Button>
                            <Button variant="outline" onClick={handleReset}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Nuevo Análisis
                            </Button>
                        </div>
                    </div>

                    {/* Título visible solo al imprimir */}
                    <div className="hidden print:block">
                        <h1 className="text-2xl font-bold">{analysis.title}</h1>
                        <p className="text-sm text-slate-500">MC Labs — Análisis financiero generado con IA · {new Date().toLocaleDateString('es-CO')}</p>
                    </div>

                    {/* Diagnóstico general */}
                    <Card className="border-l-4 border-l-[#009FE3]">
                        <CardContent className="pt-6">
                            <p className="text-sm font-semibold text-[#009FE3] uppercase tracking-wide mb-2">Diagnóstico general</p>
                            <p className="text-slate-700">{analysis.summary}</p>
                        </CardContent>
                    </Card>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {analysis.kpis.map((kpi, i) => (
                            <Card key={i}>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</p>
                                        {trendIcon(kpi.trend)}
                                    </div>
                                    <p className="text-2xl font-bold text-slate-900 mb-1">{kpi.value}</p>
                                    <p className="text-xs text-slate-500">{kpi.comment}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Gráficos */}
                    {(analysis.categoryData?.length > 0 || analysis.barData?.length > 0) && (
                        <DashboardCharts data={{
                            categoryData: analysis.categoryData || [],
                            monthlyData: analysis.barData || []
                        }} />
                    )}

                    {/* Insights accionables */}
                    <div>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            Hallazgos y acciones recomendadas
                        </h3>
                        <div className="grid md:grid-cols-2 gap-4">
                            {analysis.insights.map((insight, i) => (
                                <Card key={i}>
                                    <CardContent className="pt-6">
                                        <p className="font-semibold text-slate-900 mb-2">{insight.title}</p>
                                        <p className="text-sm text-slate-600 mb-3">{insight.explanation}</p>
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
                                            <ArrowRight className="w-4 h-4 text-[#009FE3] flex-shrink-0 mt-0.5" />
                                            <p className="text-sm text-slate-700"><span className="font-semibold">Acción:</span> {insight.action}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-slate-400 print:block">
                        Generado por MC Labs con inteligencia artificial. Verifique las cifras contra sus registros oficiales.
                    </p>
                </div>
            )}
        </div>
    )
}
