'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

/**
 * Página destino del correo de recuperación de contraseña.
 *
 * El enlace del correo llega con la sesión de recuperación en el hash; el
 * cliente de Supabase la detecta automáticamente y aquí el usuario define su
 * contraseña nueva. Sin esta página, el correo llevaba al login y el usuario
 * quedaba en un bucle sin poder cambiarla.
 */
export default function RestablecerPage() {
    const router = useRouter()
    const [ready, setReady] = useState<'verificando' | 'listo' | 'invalido'>('verificando')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [show, setShow] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    useEffect(() => {
        let activo = true
        // El cliente procesa el hash del enlace y emite la sesión de recuperación
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (activo && session) setReady('listo')
        })
        supabase.auth.getSession().then(({ data }) => {
            if (activo && data.session) setReady('listo')
        })
        // Si en unos segundos no hay sesión, el enlace expiró o ya se usó
        const t = setTimeout(() => {
            if (activo) setReady(r => (r === 'verificando' ? 'invalido' : r))
        }, 4000)
        return () => { activo = false; clearTimeout(t); sub.subscription.unsubscribe() }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
        if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSaving(false)
        if (error) {
            setError(error.message.includes('different') ? 'La contraseña nueva debe ser distinta a la anterior.' : error.message)
            return
        }
        setDone(true)
        setTimeout(() => router.replace('/'), 1800)
    }

    const inputCls = "w-full px-4 py-3 bg-white border border-slate-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900 placeholder:text-slate-400"

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-50 p-4">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 px-8 py-10 md:px-14">
                <div className="mx-auto mb-4 w-56 h-32 relative">
                    <Image src="/mc-labs-logo.png" alt="MC Consultorías y Capacitación" fill sizes="224px" className="object-contain" priority />
                </div>
                <hr className="border-slate-200 mb-8" />

                {ready === 'verificando' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <p className="text-slate-500">Verificando el enlace de recuperación…</p>
                    </div>
                )}

                {ready === 'invalido' && (
                    <div className="text-center py-4">
                        <h1 className="text-2xl font-bold text-slate-900">El enlace expiró o ya fue usado</h1>
                        <p className="mt-3 text-slate-500">
                            Solicita uno nuevo desde la pantalla de inicio de sesión con
                            &ldquo;¿Olvidaste tu contraseña?&rdquo;.
                        </p>
                        <Link href="/login" className="mt-6 inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-colors">
                            Ir al inicio de sesión
                        </Link>
                    </div>
                )}

                {ready === 'listo' && !done && (
                    <>
                        <h1 className="text-3xl font-bold text-slate-900 text-center">Crea tu nueva contraseña</h1>
                        <p className="mt-3 text-center text-slate-500">Escríbela dos veces para confirmarla.</p>

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <div>
                                <label className="block font-semibold text-slate-800 mb-2">Nueva contraseña</label>
                                <div className="relative">
                                    <input type={show ? 'text' : 'password'} value={password}
                                        onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                                        required minLength={6} className={inputCls + ' pr-12'} autoFocus />
                                    <button type="button" onClick={() => setShow(!show)}
                                        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-800 mb-2">Confirma la contraseña</label>
                                <input type={show ? 'text' : 'password'} value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)} placeholder="Repítela"
                                    required minLength={6} className={inputCls} />
                            </div>

                            {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}

                            <button type="submit" disabled={saving}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-lg font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3">
                                {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : (<><KeyRound className="w-6 h-6" />Guardar contraseña</>)}
                            </button>
                        </form>
                    </>
                )}

                {done && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                        <h1 className="text-2xl font-bold text-slate-900">¡Contraseña actualizada!</h1>
                        <p className="text-slate-500">Entrando a la plataforma…</p>
                    </div>
                )}
            </div>

            <p className="mt-6 text-sm text-slate-400">© 2026 MC Consultorías y Capacitación</p>
        </div>
    )
}
