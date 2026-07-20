'use client'

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Landmark, FileText, Scale, BarChart3, Check, Bot, RefreshCw, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
    const calendlyUrl = "https://calendly.com/angelzambranojaraba/auditoria-ia-gratis-descubre-tu-potencial-de-ahorro?month=2025-07&date=2025-07-31"

    return (
        <div className="flex min-h-screen flex-col bg-white">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
                <div className="container flex h-16 items-center justify-between">
                    <Link href="/landing" className="flex items-center space-x-2">
                        <Image
                            src="/mc-labs-logo.png"
                            alt="MC Labs"
                            width={40}
                            height={40}
                            className="object-contain"
                        />
                        <span className="font-bold text-xl text-slate-900">MC Labs</span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        <a href="#funcionalidades" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                            Funcionalidades
                        </a>
                        <a href="#soluciones" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                            Soluciones
                        </a>
                        <a href="#precios" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                            Precios
                        </a>
                        <a href="#recursos" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                            Recursos
                        </a>
                    </nav>

                    <div className="flex items-center gap-4">
                        <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                            Ingresar
                        </Link>
                        <Link href={calendlyUrl} target="_blank">
                            <Button className="bg-[#009FE3] hover:bg-[#0088c7] text-white rounded-full px-6">
                                Agendar Demo
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-white py-20 lg:py-28">
                <div className="container">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 bg-blue-100 text-[#009FE3] px-4 py-2 rounded-full text-sm font-medium">
                                <Bot className="w-4 h-4" />
                                AUTOMATIZACIÓN INTELIGENTE
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 leading-tight">
                                El Futuro de la Contabilidad,{" "}
                                <span className="text-[#009FE3]">Impulsado por IA.</span>
                            </h1>
                            <p className="text-lg text-slate-600 max-w-xl">
                                Automatiza conciliaciones, extrae datos con precisión y obtén información financiera en tiempo real. Creado por contadores, para contadores.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <Link href="/login">
                                    <Button size="lg" className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 py-6 text-base font-semibold">
                                        Probar Gratis <ArrowRight className="ml-2 w-5 h-5" />
                                    </Button>
                                </Link>
                                <Link href={calendlyUrl} target="_blank">
                                    <Button size="lg" variant="outline" className="rounded-full px-8 py-6 text-base font-semibold border-2">
                                        Agendar Demo
                                    </Button>
                                </Link>
                            </div>
                            <div className="flex items-center gap-4 pt-4">
                                <div className="flex -space-x-3">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
                                            {String.fromCharCode(64 + i)}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-slate-600">
                                    <span className="font-semibold text-slate-900">+100</span> firmas contables confían en nosotros
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border">
                                <div className="bg-slate-900 px-4 py-3 flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    </div>
                                    <span className="text-xs text-slate-400 ml-2">MC Labs Dashboard</span>
                                </div>
                                <div className="p-6 bg-slate-50">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-700">98.9% Precisión</span>
                                            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">+12%</span>
                                        </div>
                                        <div className="h-40 flex items-end gap-2">
                                            {[40, 55, 45, 65, 50, 70, 60, 80, 75, 90, 85, 100].map((h, i) => (
                                                <div
                                                    key={i}
                                                    className="flex-1 bg-gradient-to-t from-[#009FE3] to-blue-400 rounded-t"
                                                    style={{ height: `${h}%` }}
                                                ></div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 pt-4">
                                            <div className="text-center p-3 bg-white rounded-lg">
                                                <p className="text-2xl font-bold text-[#009FE3]">2.5K</p>
                                                <p className="text-xs text-slate-500">Facturas/día</p>
                                            </div>
                                            <div className="text-center p-3 bg-white rounded-lg">
                                                <p className="text-2xl font-bold text-[#009FE3]">99.9%</p>
                                                <p className="text-xs text-slate-500">Uptime</p>
                                            </div>
                                            <div className="text-center p-3 bg-white rounded-lg">
                                                <p className="text-2xl font-bold text-[#009FE3]">128h</p>
                                                <p className="text-xs text-slate-500">Ahorradas</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Logos */}
            <section className="py-12 border-y bg-slate-50/50">
                <div className="container">
                    <p className="text-center text-sm text-slate-500 mb-8 uppercase tracking-wider">
                        Con la confianza de líderes del sector
                    </p>
                    <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
                        {/* BRC Logo */}
                        <div className="flex items-center justify-center h-12">
                            <div className="flex items-center">
                                <span className="text-2xl font-black text-[#C4A962]" style={{ fontFamily: 'serif' }}>B</span>
                                <span className="text-2xl font-black text-[#B22234]" style={{ fontFamily: 'serif' }}>R</span>
                                <span className="text-2xl font-black text-[#C4A962]" style={{ fontFamily: 'serif' }}>C</span>
                            </div>
                        </div>

                        {/* Essity-style Logo (e) */}
                        <div className="flex items-center justify-center h-12">
                            <svg viewBox="0 0 60 60" className="w-10 h-10">
                                <path d="M30 5C16.2 5 5 16.2 5 30c0 8.5 4.3 16 10.8 20.5C12.5 45.2 10 38 10 30c0-11 9-20 20-20s20 9 20 20c0 3-0.7 5.8-1.9 8.3 1.2-2.5 1.9-5.3 1.9-8.3C50 16.2 43.8 5 30 5z" fill="url(#essityGradient)" />
                                <circle cx="48" cy="45" r="5" fill="#FF6B35" />
                                <defs>
                                    <linearGradient id="essityGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#00B4D8" />
                                        <stop offset="100%" stopColor="#0077B6" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>

                        {/* FOCA Logo */}
                        <div className="flex items-center justify-center h-12">
                            <span className="text-2xl font-bold text-[#1B4B82]" style={{ letterSpacing: '0.05em' }}>FOCA</span>
                        </div>

                        {/* Clínica Oftalmológica del Caribe */}
                        <div className="flex items-center gap-2 h-12">
                            <div className="relative">
                                <svg viewBox="0 0 40 30" className="w-8 h-6">
                                    <ellipse cx="20" cy="15" rx="18" ry="12" fill="none" stroke="#0077B6" strokeWidth="3" />
                                    <ellipse cx="20" cy="15" rx="8" ry="8" fill="#1B4B82" />
                                </svg>
                            </div>
                            <div className="flex flex-col leading-tight">
                                <span className="text-sm font-bold text-[#1B4B82]">Clínica</span>
                                <span className="text-sm font-bold text-[#1B4B82]">Oftalmológica</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section id="funcionalidades" className="py-24 bg-white">
                <div className="container">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <p className="text-[#009FE3] font-semibold mb-4 uppercase tracking-wider text-sm">
                            Beneficios de MC Labs
                        </p>
                        <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-6">
                            Automatiza tu flujo de trabajo con precisión
                        </h2>
                        <p className="text-lg text-slate-600">
                            Nuestro motor basado en Inteligencia Artificial optimiza el trabajo pesado, permitiéndote enfocarte en lo esencial de tu negocio.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            {
                                icon: Landmark,
                                title: "Conciliación Bancaria",
                                description: "Reconcilia tus cuentas bancarias automáticamente con 99% de precisión. Detecta discrepancias al instante."
                            },
                            {
                                icon: FileText,
                                title: "Extracción de Facturas con IA",
                                description: "Extrae datos de facturas PDF e imágenes con 99.9% de precisión utilizando tecnología OCR + IA avanzada."
                            },
                            {
                                icon: Scale,
                                title: "Fiscal vs. Contable",
                                description: "Valida y compara la información entre tus archivos DIAN contra los registros de tu sistema contable."
                            },
                            {
                                icon: BarChart3,
                                title: "Dashboards Interactivos",
                                description: "Visualiza el estado de tus empresas con gráficos dinámicos. Genera reportes y métricas poderosas."
                            }
                        ].map((benefit, i) => (
                            <div key={i} className="group p-6 rounded-2xl border bg-white hover:shadow-xl hover:border-[#009FE3]/20 transition-all duration-300">
                                <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-[#009FE3] transition-colors">
                                    <benefit.icon className="w-7 h-7 text-[#009FE3] group-hover:text-white transition-colors" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">{benefit.title}</h3>
                                <p className="text-slate-600">{benefit.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Detail Section */}
            <section id="soluciones" className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
                <div className="container">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-8">
                            <h2 className="text-3xl md:text-4xl font-black leading-tight">
                                Diseñado para la precisión.{" "}
                                <span className="text-[#009FE3]">Enfocado en la eficiencia.</span>
                            </h2>

                            <div className="space-y-6">
                                {[
                                    {
                                        icon: Bot,
                                        title: "Motor Inteligente de Excepciones",
                                        description: "Los ítems que no se crucen en conciliación se resuelven automáticamente, requiriendo solo revisión humana."
                                    },
                                    {
                                        icon: RefreshCw,
                                        title: "Sincronización Multidireccional",
                                        description: "Mantén tu contabilidad sincronizada con tu sistema automáticamente, sin levantar el dedo."
                                    },
                                    {
                                        icon: Shield,
                                        title: "Trazabilidad de Auditoría Completa",
                                        description: "Cada transacción queda registrada con historial completo. Satisface cualquier auditoría."
                                    }
                                ].map((feature, i) => (
                                    <div key={i} className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#009FE3]/20 flex items-center justify-center">
                                            <feature.icon className="w-5 h-5 text-[#009FE3]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg mb-1">{feature.title}</h3>
                                            <p className="text-slate-400">{feature.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/10">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-sm text-slate-400">Resumen Analítico</span>
                                    <span className="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full">En vivo</span>
                                </div>
                                <div className="grid grid-cols-3 gap-6 mb-8">
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-[#009FE3]">+42%</p>
                                        <p className="text-xs text-slate-400 mt-1">Eficiencia</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-white">99.9%</p>
                                        <p className="text-xs text-slate-400 mt-1">Precisión</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-[#009FE3]">128h</p>
                                        <p className="text-xs text-slate-400 mt-1">Ahorradas</p>
                                    </div>
                                </div>
                                <div className="h-32 flex items-end gap-1">
                                    {[20, 35, 25, 45, 40, 55, 50, 65, 60, 75, 70, 85, 80, 95, 90, 100].map((h, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 bg-gradient-to-t from-[#009FE3] to-blue-400 rounded-t opacity-80"
                                            style={{ height: `${h}%` }}
                                        ></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-gradient-to-r from-[#009FE3] to-blue-600">
                <div className="container">
                    <div className="max-w-3xl mx-auto text-center text-white">
                        <h2 className="text-3xl md:text-4xl font-black mb-6">
                            ¿Listo para transformar tu práctica contable?
                        </h2>
                        <p className="text-xl text-blue-100 mb-10">
                            Únete a cientos de firmas que ya están experimentando con la IA de MC Labs. Comienza tu prueba gratuita de 14 días.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Link href="/login">
                                <Button size="lg" className="bg-white text-[#009FE3] hover:bg-blue-50 rounded-full px-8 py-6 text-base font-semibold">
                                    Probar Gratis
                                </Button>
                            </Link>
                            <Link href={calendlyUrl} target="_blank">
                                <Button size="lg" className="bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 py-6 text-base font-semibold">
                                    Agendar Demo
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-900 text-white py-16">
                <div className="container">
                    <div className="grid md:grid-cols-4 gap-12 mb-12">
                        <div>
                            <Link href="/landing" className="flex items-center space-x-2 mb-6">
                                <Image
                                    src="/mc-labs-logo.png"
                                    alt="MC Labs"
                                    width={40}
                                    height={40}
                                    className="object-contain"
                                />
                                <span className="font-bold text-xl">MC Labs</span>
                            </Link>
                            <p className="text-slate-400 text-sm">
                                Automatización contable inteligente. Simplificando el flujo de trabajo financiero con precisión y velocidad.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-bold mb-4 text-sm uppercase tracking-wider">Producto</h4>
                            <ul className="space-y-3 text-slate-400">
                                <li><a href="#" className="hover:text-white transition-colors">Conciliaciones</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Extractor de Facturas</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Dashboards</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Integraciones</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-bold mb-4 text-sm uppercase tracking-wider">Empresa</h4>
                            <ul className="space-y-3 text-slate-400">
                                <li><a href="#" className="hover:text-white transition-colors">Sobre Nosotros</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Carreras</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Seguridad</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-bold mb-4 text-sm uppercase tracking-wider">Newsletter</h4>
                            <p className="text-slate-400 text-sm mb-4">
                                Suscríbete para recibir las últimas novedades.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    placeholder="tu@email.com"
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#009FE3]"
                                />
                                <Button size="sm" className="bg-[#009FE3] hover:bg-[#0088c7] rounded-full px-4">
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-slate-400 text-sm">
                            © 2024 MC Labs. Todos los derechos reservados.
                        </p>
                        <div className="flex gap-6 text-slate-400 text-sm">
                            <a href="#" className="hover:text-white transition-colors">Términos</a>
                            <a href="#" className="hover:text-white transition-colors">Privacidad</a>
                            <a href="#" className="hover:text-white transition-colors">Cookies</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
