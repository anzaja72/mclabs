'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { FileUpload } from '@/components/file-upload'
import { DashboardCharts, ChartData } from '@/components/dashboard-charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RotateCcw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useCredits } from '@/lib/credits-context'
import { CreditsBanner } from '@/components/credits-banner'
import { PaywallModal } from '@/components/paywall-modal'

export default function DashboardsPage() {
    const [chartData, setChartData] = useState<ChartData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const { useCredit, getToolCredits } = useCredits()
    const [showPaywall, setShowPaywall] = useState(false)

    const processData = (data: any[]): boolean => {
        try {
            // Normalize keys to lowercase for easier matching
            const normalizedData = data.map(row => {
                const newRow: any = {}
                Object.keys(row).forEach(key => {
                    newRow[key.toLowerCase()] = row[key]
                })
                return newRow
            })

            // Validation
            const hasRequiredColumns = normalizedData.length > 0 &&
                ('date' in normalizedData[0] || 'amount' in normalizedData[0] || 'category' in normalizedData[0])

            if (!hasRequiredColumns) {
                throw new Error('Formato de archivo inválido. Columnas requeridas: Date, Category, Amount')
            }

            // 1. Category Data
            const categoryMap = new Map<string, number>()
            normalizedData.forEach(row => {
                const category = row.category || 'Sin Categoría'
                const amount = Number(row.amount) || 0
                categoryMap.set(category, (categoryMap.get(category) || 0) + amount)
            })

            const categoryData = Array.from(categoryMap.entries()).map(([name, value]) => ({
                name,
                value: Math.abs(value) // Pie charts usually show magnitude
            }))

            // 2. Monthly Data
            const monthMap = new Map<string, number>()
            normalizedData.forEach(row => {
                if (!row.date) return

                // Handle Excel serial date or string date
                let dateObj
                if (typeof row.date === 'number') {
                    dateObj = new Date(Math.round((row.date - 25569) * 86400 * 1000))
                } else {
                    dateObj = new Date(row.date)
                }

                if (isNaN(dateObj.getTime())) return

                const monthYear = dateObj.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
                const amount = Number(row.amount) || 0
                monthMap.set(monthYear, (monthMap.get(monthYear) || 0) + amount)
            })

            const monthlyData = Array.from(monthMap.entries()).map(([name, amount]) => ({
                name,
                amount
            }))

            setChartData({ categoryData, monthlyData })
            setError(null)
            return true
        } catch (err: any) {
            console.error(err)
            setError(err.message || 'Error al procesar datos')
            setChartData(null)
            return false
        }
    }

    const handleFileSelect = async (file: File | null) => {
        if (!file) return

        // Check credits
        if (getToolCredits('dashboards') <= 0) {
            setShowPaywall(true)
            return
        }

        const reader = new FileReader()
        reader.onload = async (e) => {
            const data = e.target?.result
            if (data) {
                const workbook = XLSX.read(data, { type: 'binary' })
                const sheetName = workbook.SheetNames[0]
                const sheet = workbook.Sheets[sheetName]
                const jsonData = XLSX.utils.sheet_to_json(sheet)
                const ok = processData(jsonData)

                // Deduct credit only after successful processing
                if (ok) {
                    const result = await useCredit('dashboards')
                    if (!result.success && result.needsPurchase) {
                        setChartData(null)
                        setShowPaywall(true)
                    }
                }
            }
        }
        reader.readAsBinaryString(file)
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Tablero Financiero</h1>
                <p className="text-muted-foreground">
                    Visualiza tus datos financieros. Sube un archivo Excel con columnas: Date, Category, Amount.
                </p>
            </div>

            {/* Credits Banner */}
            <div className="mb-4">
                <CreditsBanner tool="dashboards" toolLabel="Tableros" />
            </div>

            {/* Paywall Modal */}
            {showPaywall && (
                <PaywallModal
                    toolName="Tableros Financieros"
                    onClose={() => setShowPaywall(false)}
                />
            )}

            {!chartData ? (
                <Card className="max-w-xl">
                    <CardHeader>
                        <CardTitle>Cargar Informe</CardTitle>
                        <CardDescription>
                            Formatos soportados: .xlsx, .xls, .csv
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FileUpload
                            label="Archivo de Datos Financieros"
                            accept={{
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                                'application/vnd.ms-excel': ['.xls'],
                                'text/csv': ['.csv']
                            }}
                            onFileSelect={handleFileSelect}
                        />
                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">Resultados del Análisis</h2>
                        <Button variant="outline" onClick={() => setChartData(null)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Cargar Nuevo Archivo
                        </Button>
                    </div>
                    <DashboardCharts data={chartData} />
                </div>
            )}
        </div>
    )
}
