'use client'

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle, Loader2, Zap, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';

type Estado = 'verificando' | 'acreditado' | 'pendiente' | 'rechazado' | 'sin_sesion' | 'error';

function ConfirmacionContent() {
    const params = useSearchParams();
    const txId = params.get('id');
    const { user, session, loading: authLoading } = useAuth();
    const { refreshCredits } = useCredits();

    const [estado, setEstado] = useState<Estado>('verificando');
    const [mensaje, setMensaje] = useState('');
    const [creditos, setCreditos] = useState(0);
    const [saldo, setSaldo] = useState<number | null>(null);

    const confirmar = useCallback(async () => {
        if (!txId) {
            setEstado('error');
            setMensaje('Falta el identificador de la transacción.');
            return;
        }
        if (!session?.access_token) return;

        setEstado('verificando');
        try {
            const res = await fetch('/api/wompi/confirmar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ transactionId: txId }),
            });
            const data = await res.json();

            if (res.status === 202) {
                setEstado('pendiente');
                return;
            }
            if (res.status === 402) {
                setEstado('rechazado');
                setMensaje(data.error || 'El pago no fue aprobado.');
                return;
            }
            if (!res.ok) {
                setEstado('error');
                setMensaje(data.error || 'No se pudo confirmar el pago.');
                return;
            }

            setCreditos(data.creditos ?? 0);
            setSaldo(data.saldo ?? null);
            setEstado('acreditado');
            refreshCredits();
        } catch {
            setEstado('error');
            setMensaje('Error de conexión. Recarga la página para reintentar.');
        }
    }, [txId, session, refreshCredits]);

    useEffect(() => {
        if (authLoading) return;
        if (!user || !session) {
            setEstado('sin_sesion');
            return;
        }
        confirmar();
    }, [authLoading, user, session, confirmar]);

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
                {estado === 'verificando' && (
                    <>
                        <Loader2 className="w-14 h-14 text-blue-600 mx-auto mb-4 animate-spin" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">Verificando tu pago…</h1>
                        <p className="text-sm text-slate-500">Estamos confirmando la transacción con Wompi.</p>
                    </>
                )}

                {estado === 'acreditado' && (
                    <>
                        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">¡Pago confirmado!</h1>
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 my-4">
                            <div className="flex items-center justify-center gap-2 text-green-700 font-black text-2xl">
                                <Zap className="w-6 h-6" /> +{creditos} créditos
                            </div>
                            {saldo !== null && (
                                <p className="text-sm text-green-600 mt-1">Saldo actual: {saldo} créditos MC</p>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mb-6">
                            Tus créditos sirven para todas las herramientas y vencen en 12 meses.
                        </p>
                        <Link href="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Ir a las herramientas
                        </Link>
                    </>
                )}

                {estado === 'pendiente' && (
                    <>
                        <Clock className="w-14 h-14 text-amber-500 mx-auto mb-4" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">Pago en proceso</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            Tu pago está pendiente de aprobación (común con PSE).
                            Apenas se apruebe, los créditos se acreditan solos.
                        </p>
                        <button onClick={confirmar} className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Volver a verificar
                        </button>
                    </>
                )}

                {estado === 'rechazado' && (
                    <>
                        <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">Pago no aprobado</h1>
                        <p className="text-sm text-slate-500 mb-6">{mensaje}</p>
                        <Link href="/" className="inline-block bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Volver e intentar de nuevo
                        </Link>
                    </>
                )}

                {estado === 'sin_sesion' && (
                    <>
                        <LogIn className="w-14 h-14 text-blue-600 mx-auto mb-4" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">Inicia sesión para acreditar tu compra</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            Tu pago quedó registrado en Wompi. Inicia sesión con tu cuenta MC Labs
                            y vuelve a esta página (puedes recargarla) para acreditar los créditos.
                        </p>
                        <Link href="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Iniciar sesión
                        </Link>
                    </>
                )}

                {estado === 'error' && (
                    <>
                        <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
                        <h1 className="text-xl font-black text-slate-900 mb-2">No pudimos confirmar</h1>
                        <p className="text-sm text-slate-500 mb-6">{mensaje}</p>
                        <button onClick={confirmar} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors">
                            Reintentar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function ConfirmacionCompraPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        }>
            <ConfirmacionContent />
        </Suspense>
    );
}
