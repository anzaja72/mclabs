'use client'

import { AuthProvider } from '@/lib/auth-context'
import { CreditsProvider } from '@/lib/credits-context'
import { ProtectedRoute } from '@/components/protected-route'
import { usePathname } from 'next/navigation'

interface ClientLayoutProps {
    children: React.ReactNode
}

// Routes that don't require authentication
const publicRoutes = ['/login', '/landing']

export function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname()
    const isPublicRoute = publicRoutes.includes(pathname)

    return (
        <AuthProvider>
            {isPublicRoute ? (
                children
            ) : (
                <ProtectedRoute>
                    <CreditsProvider>
                        {children}
                    </CreditsProvider>
                </ProtectedRoute>
            )}
        </AuthProvider>
    )
}

