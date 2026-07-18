'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, Lock, ArrowRight, Phone, User, MapPin, Building2, Briefcase, Eye, EyeOff } from 'lucide-react'

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
                    // Registrar en la hoja de usuarios (no bloquea el alta si falla)
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

    const inputCls = "w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900"

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"></div>
            </div>

            <Card className="w-full max-w-md relative z-10 bg-white/95 backdrop-blur-xl shadow-2xl border-0 my-8">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 w-24 h-24 relative">
                        <Image src="/mc-labs-logo.png" alt="MC Labs Logo" fill sizes="96px" className="object-contain" priority />
                    </div>
                    <CardTitle className="text-2xl font-black text-slate-900">MC Labs</CardTitle>
                    <CardDescription className="text-slate-500">
                        {isSignUp ? 'Crea tu cuenta para comenzar' : 'Bienvenido de vuelta'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isSignUp && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Nombre completo</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                                        placeholder="Nombre y apellido" required className={inputCls} />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Correo electrónico</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@email.com" required className={inputCls} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                                    className={inputCls + ' pr-11'} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {isSignUp && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Teléfono</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
                                                placeholder="+57 300…" required className={inputCls} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Ciudad</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)}
                                                placeholder="Ciudad" required className={inputCls} />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Empresa</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input type="text" value={empresa} onChange={(e) => setEmpresa(e.target.value)}
                                                placeholder="Empresa" required className={inputCls} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Cargo</label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)}
                                                placeholder="Cargo" required className={inputCls} />
                                        </div>
                                    </div>
                                </div>

                                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
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

                        <Button type="submit" disabled={loading}
                            className="w-full py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>{isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}<ArrowRight className="w-5 h-5 ml-2" /></>
                            )}
                        </Button>
                    </form>

                    {!isSignUp && (
                        <div className="mt-4 text-center">
                            <button type="button" onClick={handleReset}
                                className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                                ¿Olvidaste tu contraseña?
                            </button>
                        </div>
                    )}

                    <div className="mt-4 text-center">
                        <button type="button"
                            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }}
                            className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                            {isSignUp ? (
                                <>¿Ya tienes cuenta? <span className="font-semibold">Inicia sesión</span></>
                            ) : (
                                <>¿No tienes cuenta? <span className="font-semibold">Regístrate</span></>
                            )}
                        </button>
                    </div>

                    {!isSignUp && (
                        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
                            Al continuar aceptas el tratamiento de tus datos conforme a la{' '}
                            <Link href="/legal/tratamiento-de-datos" target="_blank" className="text-slate-500 hover:underline">
                                Política de Tratamiento de Datos
                            </Link>.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
