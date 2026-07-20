'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [nombre, setNombre] = useState('')
    const [telefono, setTelefono] = useState('')
    const [ciudad, setCiudad] = useState('')
    const [empresa, setEmpresa] = useState('')
    const [cargo, setCargo] = useState('')
    const [aceptaDatos, setAceptaDatos] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const { signIn, signUp, resetPassword } = useAuth()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setMessage(null)

        if (isSignUp && !aceptaDatos) {
            setError('Debes autorizar el tratamiento de tus datos personales para crear la cuenta.')
            return
        }

        setLoading(true)
        try {
            if (isSignUp) {
                const profile = { nombre, telefono, ciudad, empresa, cargo }
                const { error } = await signUp(email, password, profile)
                if (error) {
                    setError(error.message)
                } else {
                    fetch('/api/registro', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nombre, email, telefono, ciudad, empresa, cargo }),
                    }).catch(() => {})
                    setMessage('¡Cuenta creada! Te enviamos un correo para confirmarla. Revisa tu bandeja (y spam).')
                }
            } else {
                const { error } = await signIn(email, password)
                if (error) {
                    setError(error.message)
                } else {
                    router.push('/')
                }
            }
        } catch {
            setError('Ocurrió un error inesperado')
        } finally {
            setLoading(false)
        }
    }

    const handleReset = async () => {
        setError(null)
        setMessage(null)
        if (!email) {
            setError('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".')
            return
        }
        setLoading(true)
        const { error } = await resetPassword(email)
        setLoading(false)
        if (error) setError(error.message)
        else setMessage('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.')
    }

    const inputCls = "w-full px-4 py-3 bg-white border border-slate-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900 placeholder:text-slate-400"

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-50 p-4">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 px-8 py-10 md:px-14">
                {/* Logo grande */}
                <div className="mx-auto mb-4 w-56 h-32 relative">
                    <Image src="/mc-labs-logo.png" alt="MC Consultorías y Capacitación" fill sizes="224px" className="object-contain" priority />
                </div>
                <hr className="border-slate-200 mb-8" />

                <h1 className="text-3xl font-bold text-slate-900 text-center">
                    {isSignUp ? 'Crea tu cuenta' : 'Inicia sesión'}
                </h1>
                <p className="mt-3 text-center text-slate-500 leading-relaxed max-w-md mx-auto">
                    MC Labs · Suite contable con IA. Conciliaciones, tableros financieros,
                    extracción de facturas y declaración de renta en un solo lugar.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    {isSignUp && (
                        <div>
                            <label className="block font-semibold text-slate-800 mb-2">Nombre completo</label>
                            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                                placeholder="Nombre y apellido" required className={inputCls} />
                        </div>
                    )}

                    <div>
                        <label className="block font-semibold text-slate-800 mb-2">Correo electrónico</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            placeholder="tucorreo@ejemplo.com" required className={inputCls} />
                    </div>

                    <div>
                        <label className="block font-semibold text-slate-800 mb-2">Contraseña</label>
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} value={password}
                                onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                                required minLength={6} className={inputCls + ' pr-12'} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {isSignUp && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold text-slate-800 mb-2">Teléfono</label>
                                    <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
                                        placeholder="+57 300…" required className={inputCls} />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-800 mb-2">Ciudad</label>
                                    <input type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)}
                                        placeholder="Ciudad" required className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block font-semibold text-slate-800 mb-2">Empresa</label>
                                    <input type="text" value={empresa} onChange={(e) => setEmpresa(e.target.value)}
                                        placeholder="Empresa" required className={inputCls} />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-800 mb-2">Cargo</label>
                                    <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)}
                                        placeholder="Cargo" required className={inputCls} />
                                </div>
                            </div>

                            <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                <span>
                                    Autorizo el tratamiento de mis datos personales conforme a la{' '}
                                    <Link href="/legal/tratamiento-de-datos" target="_blank" className="text-blue-600 font-medium hover:underline">
                                        Política de Tratamiento de Datos
                                    </Link>{' '}
                                    (Ley 1581 de 2012).
                                </span>
                            </label>
                        </>
                    )}

                    {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}
                    {message && <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-green-600 text-sm">{message}</div>}

                    <button type="submit" disabled={loading}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-lg font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3">
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                            <><LogIn className="w-6 h-6" />{isSignUp ? 'Crear cuenta' : 'Entrar'}</>
                        )}
                    </button>
                </form>

                {!isSignUp && (
                    <div className="mt-5 text-center">
                        <button type="button" onClick={handleReset}
                            className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                            ¿Olvidaste tu contraseña?
                        </button>
                    </div>
                )}

                <p className="mt-5 text-center text-slate-600">
                    {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
                    <button type="button"
                        onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }}
                        className="text-blue-600 font-semibold underline underline-offset-2 hover:text-blue-700">
                        {isSignUp ? 'Inicia sesión' : 'Regístrate'}
                    </button>
                </p>

                {!isSignUp && (
                    <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
                        Al continuar aceptas el tratamiento de tus datos conforme a la{' '}
                        <Link href="/legal/tratamiento-de-datos" target="_blank" className="text-slate-500 hover:underline">
                            Política de Tratamiento de Datos
                        </Link>.
                    </p>
                )}
            </div>

            <p className="mt-6 text-sm text-slate-400">© 2026 MC Consultorías y Capacitación</p>
        </div>
    )
}
