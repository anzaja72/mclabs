'use client'

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import confetti from "canvas-confetti"
import { useAuth } from "@/lib/auth-context"
import { useCredits } from "@/lib/credits-context"

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}

// Iconos del diseño (paths de MC Labs Dashboard.dc.html)
function Svg({ paths, size = 26 }: { paths: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

const ICONS = {
  bank: ['M3 9.5 12 4l9 5.5', 'M4.5 11v7', 'M8.5 11v7', 'M12 11v7', 'M15.5 11v7', 'M19.5 11v7', 'M3 20.5h18'],
  sync: ['M20.5 9A8 8 0 0 0 6 5.5L3.5 8', 'M3.5 3.5v4.5H8', 'M3.5 15a8 8 0 0 0 14.5 3.5L20.5 16', 'M20.5 20.5V16H16'],
  chart: ['M4 4v16h16', 'M8.5 20v-6', 'M13 20V8.5', 'M17.5 20v-9.5'],
  doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  receipt: ['M5.5 3v18l2-1.4L9.5 21l2-1.4 2 1.4 2-1.4 2 1.4V3l-2 1.4-2-1.4-2 1.4-2-1.4L7.5 4.4z', 'M8.5 8.5h7', 'M8.5 12.5h7'],
  scale: ['M12 4v16', 'M7.5 20h9', 'M4 8h16', 'M8 6 4 14a4 4 0 0 0 8 0z', 'M16 6l4 8a4 4 0 0 1-8 0z', 'M9.5 5.5 12 4l2.5 1.5'],
}

const MODULES = [
  { n: '01', title: 'Conciliación Bancaria', href: '/bank-recs', external: false, cta: 'Ir a Bancos', icon: ICONS.bank,
    desc: 'Procese extractos bancarios y libros auxiliares con precisión algorítmica. El sistema concilia transacciones automáticamente y deja a su equipo solo las excepciones que requieren criterio.' },
  { n: '02', title: 'Conciliación DIAN', href: '/conciliator', external: false, cta: 'Ir a DIAN', icon: ICONS.sync,
    desc: 'Contraste su facturación electrónica DIAN contra los registros contables de forma sistemática, identificando inconsistencias antes de que representen un riesgo de auditoría.' },
  { n: '03', title: 'Tableros Financieros', href: '/dashboards', external: false, cta: 'Ir a Tableros', icon: ICONS.chart,
    desc: 'Transforme sus estados financieros en información ejecutiva: indicadores, tendencias e insights para respaldar la toma de decisiones ante gerencia y junta directiva.' },
  { n: '04', title: 'Extractor IA', href: '/extractor', external: false, cta: 'Ir a Extractor', icon: ICONS.doc,
    desc: 'Digitalice facturas en PDF o imagen mediante reconocimiento inteligente. El sistema extrae y estructura NIT, valores e impuestos, listos para su integración contable.' },
  { n: '05', title: 'Declaración de Renta', href: 'https://renta.mcconsultorias.com.co', external: true, cta: 'Ir a Renta', icon: ICONS.receipt,
    desc: 'Construya el borrador de la declaración de renta a partir de la información del contribuyente, con validación de cifras frente a soportes y alertas de inconsistencia.' },
  { n: '06', title: 'Tributar-IA', href: 'https://renta.mcconsultorias.com.co', external: true, cta: 'Ir a Tributar-IA', icon: ICONS.scale,
    desc: 'Evalúe la situación fiscal del contribuyente y obtenga alternativas de planeación tributaria fundamentadas en el Estatuto Tributario, con el sustento normativo.' },
]

function Home() {
  const { user, session, signOut, loading: authLoading } = useAuth()
  const { credits, refreshCredits } = useCredits()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [paymentNotice, setPaymentNotice] = useState<'success' | 'cancelled' | null>(null)
  const [dark, setDark] = useState(false)

  // Guard: si no hay sesión, al login
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  // Preferencia de tema
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mc-theme') : null
    if (saved) setDark(saved === 'dark')
  }, [])
  const toggleTheme = () => setDark(d => { const n = !d; localStorage.setItem('mc-theme', n ? 'dark' : 'light'); return n })

  useEffect(() => {
    const payment = searchParams.get('payment')
    if (!payment) return
    if (payment === 'success') {
      setPaymentNotice('success')
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
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

  const t = useMemo(() => dark
    ? { bg: '#0a0c0f', surface: '#0f1317', card: '#151a1f', border: '#242b33', fg: '#f2f5f7', sub: '#a7afb9', muted: '#767e88', accent: '#2bb8ef', accentInk: '#5ccbf5', soft: '#0f2733' }
    : { bg: '#ffffff', surface: '#f6f8f9', card: '#ffffff', border: '#e9ebee', fg: '#0b0d10', sub: '#565d66', muted: '#9298a1', accent: '#0f9fd6', accentInk: '#0a7dab', soft: '#e9f6fc' }
  , [dark])

  const saldo = credits?.saldo ?? 0

  // SSO hacia renta.mcconsultorias.com.co: la sesión viaja en el hash del
  // enlace (nunca llega al servidor) y la app de Renta la aplica al abrir,
  // así el usuario no tiene que autenticarse dos veces.
  const rentaBase = 'https://renta.mcconsultorias.com.co/'
  const rentaUrl = session?.access_token && session?.refresh_token
    ? `${rentaBase}#sso_at=${encodeURIComponent(session.access_token)}&sso_rt=${encodeURIComponent(session.refresh_token)}`
    : rentaBase

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.fg, fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {paymentNotice && (
        <div style={{ padding: '12px 20px', textAlign: 'center', fontSize: 14, fontWeight: 600,
          background: paymentNotice === 'success' ? '#e9f6fc' : '#fef2f2',
          color: paymentNotice === 'success' ? '#0a7dab' : '#b91c1c' }}>
          {paymentNotice === 'success'
            ? '¡Pago recibido! Tus créditos se están acreditando.'
            : 'Pago cancelado. No se realizó ningún cargo.'}
          <button onClick={() => setPaymentNotice(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 34px', borderBottom: `1px solid ${t.border}`, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17 }}>M</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: '-.01em' }}>MC Labs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 14, color: t.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, background: t.soft, color: t.accentInk, fontWeight: 700 }}>
            {saldo} crédito{saldo !== 1 ? 's' : ''}
          </span>
          <span style={{ display: 'none', alignItems: 'center', gap: 7 }} className="mc-email">{user?.email}</span>
          <button onClick={toggleTheme} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.sub, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
            {dark ? '☀︎ Claro' : '☾ Oscuro'}
          </button>
          <button onClick={() => signOut()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'none', color: t.sub, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 34px 80px' }}>
        {/* Hero */}
        <div style={{ padding: '64px 0 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: t.accentInk, background: t.soft, padding: '7px 14px', borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent }}></span>Inteligencia artificial contable
          </span>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 48, lineHeight: 1.05, letterSpacing: '-.025em', maxWidth: 820, margin: 0 }}>
            Automatización Contable con Inteligencia Artificial
          </h1>
          <p style={{ maxWidth: 640, fontSize: 17, lineHeight: 1.6, color: t.sub, margin: 0 }}>
            MC Labs integra IA especializada en el ejercicio contable y tributario colombiano para reducir tiempos de conciliación, minimizar errores de digitación y fortalecer el control sobre sus obligaciones fiscales.
          </p>
        </div>

        {/* Módulos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, paddingTop: 20 }}>
          {MODULES.map((m) => {
            const inner = (
              <>
                <span style={{ position: 'absolute', top: 22, right: 24, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: t.muted, letterSpacing: '.04em' }}>{m.n}</span>
                <span style={{ width: 46, height: 46, borderRadius: 12, background: t.soft, color: t.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Svg paths={m.icon} /></span>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 20, letterSpacing: '-.01em', margin: 0 }}>{m.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.58, color: t.sub, flex: 1, margin: 0 }}>{m.desc}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14.5, color: t.accentInk }}>
                  {m.cta}<Svg paths={['M5 12h13', 'M13 6l6 6-6 6']} size={17} />
                </span>
              </>
            )
            const cardStyle: React.CSSProperties = {
              display: 'flex', flexDirection: 'column', gap: 16, padding: '26px 24px 24px',
              border: `1px solid ${t.border}`, borderRadius: 18, background: t.card, position: 'relative',
              transition: 'transform .18s ease, border-color .18s ease, box-shadow .18s ease', color: t.fg,
            }
            return m.external ? (
              <a key={m.n} href={rentaUrl} target="_blank" rel="noopener noreferrer" style={cardStyle} className="mc-card">{inner}</a>
            ) : (
              <a key={m.n} href={m.href} style={cardStyle} className="mc-card">{inner}</a>
            )
          })}
        </div>
      </div>

      <style>{`
        .mc-card:hover { transform: translateY(-4px); border-color: ${t.accent} !important; box-shadow: 0 18px 40px -26px rgba(15,159,214,.7); }
        @media (min-width: 720px) { .mc-email { display: inline-flex !important; } }
      `}</style>
    </div>
  )
}
