'use client'

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams, useRouter } from "next/navigation"
import confetti from "canvas-confetti"
import { ArrowRight, BarChart3, FileText, Landmark, RefreshCw, LogOut, User, FileSpreadsheet, Info, CheckCircle2, XCircle, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCredits } from "@/lib/credits-context"
import { ToolType } from "@/types/credits"

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}

function Home() {
  const { user, signOut } = useAuth()
  const { getToolCredits, loading: creditsLoading, refreshCredits } = useCredits()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [paymentNotice, setPaymentNotice] = useState<'success' | 'cancelled' | null>(null)

  useEffect(() => {
    const payment = searchParams.get('payment')
    if (!payment) return

    if (payment === 'success') {
      setPaymentNotice('success')
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      // Los créditos se acreditan vía webhook de Stripe; refrescar con reintentos
      refreshCredits()
      const retry = setTimeout(() => refreshCredits(), 4000)
      router.replace('/', { scroll: false })
      return () => clearTimeout(retry)
    }

    if (payment === 'cancelled') {
      setPaymentNotice('cancelled')
      router.replace('/', { scroll: false })
    }
  }, [searchParams, refreshCredits, router])

  const handleSignOut = async () => {
    await signOut()
  }

  const tools = [
    {
      title: "Bancaria",
      description: "Sube extractos bancarios y libros para conciliar automáticamente.",
      href: "/bank-recs",
      linkText: "Ir a Bancos",
      icon: Landmark,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      tool: 'bank_recs' as ToolType
    },
    {
      title: "DIAN",
      description: "Cruza facturación electrónica contra contabilidad sin errores.",
      href: "/conciliator",
      linkText: "Ir a DIAN",
      icon: RefreshCw,
      iconBg: "bg-cyan-50",
      iconColor: "text-cyan-600",
      tool: 'conciliator' as ToolType
    },
    {
      title: "Tableros",
      description: "Visualiza informes financieros dinámicos e insights detallados.",
      href: "/dashboards",
      linkText: "Ir a Tableros",
      icon: BarChart3,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      tool: 'dashboards' as ToolType
    },
    {
      title: "Extractor IA",
      description: "Digitaliza facturas PDF e imágenes con extracción automática.",
      href: "/extractor",
      linkText: "Ir a Extractor",
      icon: FileText,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      tool: 'extractor' as ToolType
    }
  ]

  const usageGuides = [
    {
      title: "Conciliación Bancaria",
      icon: Landmark,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      description: "Compara extractos bancarios con tu libro auxiliar contable.",
      files: [
        { name: "Extracto Bancario", format: "Excel (.xlsx, .xls) o CSV", columns: "Fecha, Descripción, Valor/Monto, Referencia" },
        { name: "Libro Auxiliar", format: "Excel (.xlsx, .xls) o CSV", columns: "Fecha, Concepto, Débito, Crédito, Cuenta" }
      ],
      tips: [
        "Asegúrate de que las fechas estén en formato consistente (DD/MM/YYYY o YYYY-MM-DD)",
        "Los montos deben ser numéricos sin símbolos de moneda",
        "Incluye referencias o números de documento para mejor cruce"
      ]
    },
    {
      title: "Conciliación DIAN",
      icon: RefreshCw,
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600",
      description: "Cruza tu facturación electrónica DIAN contra tu contabilidad.",
      files: [
        { name: "Reporte DIAN", format: "Excel (.xlsx) descargado del portal DIAN", columns: "CUFE, Número Factura, NIT Emisor, Fecha, Base Gravable, IVA, Total" },
        { name: "Libro Contable", format: "Excel (.xlsx, .xls) o CSV", columns: "Número Documento, NIT, Fecha, Base, IVA, Total, Cuenta Contable" }
      ],
      tips: [
        "Descarga el reporte actualizado desde el portal DIAN",
        "Verifica que los NITs estén sin puntos ni guiones",
        "El CUFE debe estar completo para identificación única"
      ]
    },
    {
      title: "Tableros Financieros",
      icon: BarChart3,
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-600",
      description: "Visualiza datos financieros con gráficos interactivos.",
      files: [
        { name: "Datos Financieros", format: "Excel (.xlsx, .xls) o CSV", columns: "Date (Fecha), Category (Categoría), Amount (Monto)" }
      ],
      tips: [
        "Usa nombres de columnas en inglés: Date, Category, Amount",
        "Las fechas pueden ser en cualquier formato reconocible",
        "Los montos negativos se mostrarán como egresos"
      ]
    },
    {
      title: "Extractor IA",
      icon: FileText,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      description: "Extrae datos de facturas automáticamente con inteligencia artificial.",
      files: [
        { name: "Facturas", format: "PDF o Imágenes (JPG, PNG)", columns: "N/A - El sistema detecta automáticamente campos" }
      ],
      tips: [
        "Sube archivos PDF legibles o imágenes claras",
        "Funciona mejor con facturas electrónicas estándar",
        "Puedes subir múltiples archivos a la vez"
      ]
    }
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container flex h-16 items-center justify-between max-w-7xl mx-auto px-4">
          <div className="flex items-center">
            <Link className="flex items-center space-x-2" href="/">
              <Image
                src="/mc-labs-logo.png"
                alt="MC Labs"
                width={28}
                height={28}
                className="object-contain"
              />
              <span className="font-semibold text-lg">MC Labs</span>
            </Link>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.email}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-slate-500 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Salir</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Payment Notice */}
        {paymentNotice && (
          <div className="container max-w-7xl mx-auto px-4 pt-6">
            <div className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
              paymentNotice === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <div className="flex items-start gap-3">
                {paymentNotice === 'success'
                  ? <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  : <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className="font-semibold">
                    {paymentNotice === 'success' ? '¡Pago exitoso!' : 'Pago cancelado'}
                  </p>
                  <p className="text-sm">
                    {paymentNotice === 'success'
                      ? 'Tus créditos se están acreditando. Pueden tardar unos segundos en reflejarse.'
                      : 'No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setPaymentNotice(null)} className="p-1 hover:opacity-70">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="py-16 md:py-24">
          <div className="container max-w-7xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-4">
              Automatización contable MC
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Optimiza tus flujos financieros con MC Labs. Concilia extractos bancarios y visualiza datos financieros en segundos.
            </p>
          </div>
        </section>

        {/* Tools Cards */}
        <section className="pb-16">
          <div className="container max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <Card
                    key={tool.title}
                    className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                  >
                    <Link href={tool.href} className="block p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg ${tool.iconBg}`}>
                          <Icon className={`h-5 w-5 ${tool.iconColor}`} />
                        </div>
                        <h3 className="font-semibold text-slate-900">{tool.title}</h3>
                      </div>
                      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                        {tool.description}
                      </p>
                      <div className="flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
                        {tool.linkText}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                      {!creditsLoading && (
                        <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                          getToolCredits(tool.tool) > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {getToolCredits(tool.tool)} crédito{getToolCredits(tool.tool) !== 1 ? 's' : ''}
                        </div>
                      )}
                    </Link>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* Usage Guide Section */}
        <section className="py-16 bg-slate-50 border-t border-slate-200">
          <div className="container max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
                <Info className="h-4 w-4" />
                Guía de Uso
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                ¿Cómo usar las herramientas?
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto">
                Cada herramienta requiere archivos específicos con formatos determinados. A continuación encontrarás los requisitos para cada funcionalidad.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {usageGuides.map((guide) => {
                const Icon = guide.icon
                return (
                  <Card key={guide.title} className="bg-white border border-slate-200 overflow-hidden">
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${guide.iconBg}`}>
                          <Icon className={`h-6 w-6 ${guide.iconColor}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{guide.title}</CardTitle>
                          <CardDescription className="text-sm">{guide.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Files Required */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                          Archivos Requeridos
                        </h4>
                        <div className="space-y-3">
                          {guide.files.map((file, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                              <div className="font-medium text-sm text-slate-900 mb-1">{file.name}</div>
                              <div className="text-xs text-slate-500 mb-1">
                                <span className="font-medium">Formato:</span> {file.format}
                              </div>
                              <div className="text-xs text-slate-500">
                                <span className="font-medium">Columnas:</span> {file.columns}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tips */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Consejos
                        </h4>
                        <ul className="space-y-1">
                          {guide.tips.map((tip, idx) => (
                            <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                              <span className="text-green-500 mt-0.5">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* Footer Note */}
        <section className="py-8 border-t border-slate-200 bg-white">
          <div className="container max-w-7xl mx-auto px-4 text-center">
            <p className="text-sm text-slate-500">
              ¿Necesitas ayuda adicional? Contáctanos en <span className="font-medium text-blue-600">soporte@mclabs.co</span>
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
