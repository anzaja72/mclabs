'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export interface SignUpProfile {
    nombre: string
    telefono: string
    ciudad: string
    empresa: string
    cargo: string
}

interface AuthContextType {
    user: User | null
    session: Session | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
    signUp: (email: string, password: string, profile: SignUpProfile) => Promise<{ error: AuthError | null }>
    resetPassword: (email: string) => Promise<{ error: AuthError | null }>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Check active sessions
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        }

        getSession()

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setSession(session)
                setUser(session?.user ?? null)
                setLoading(false)
            }
        )

        return () => subscription.unsubscribe()
    }, [])

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        return { error }
    }

    const signUp = async (email: string, password: string, profile: SignUpProfile) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nombre: profile.nombre || '',
                    telefono: profile.telefono || '',
                    phone: profile.telefono || '',
                    ciudad: profile.ciudad || '',
                    empresa: profile.empresa || '',
                    cargo: profile.cargo || '',
                },
                emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
            }
        })
        return { error }
    }

    const resetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        })
        return { error }
    }

    const signOut = async () => {
        // 'local' limpia la sesión del navegador aunque el servidor ya la haya
        // revocado (p. ej. tras un cambio de contraseña); sin esto, signOut
        // lanza error y el usuario queda atrapado sin poder salir.
        try {
            await supabase.auth.signOut({ scope: 'local' })
        } catch {
            // la sesión ya no existía en el servidor: continuar igual
        }
        if (typeof window !== 'undefined') window.location.href = '/login'
    }

    return (
        <AuthContext.Provider value={{ user, session, loading, signIn, signUp, resetPassword, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
