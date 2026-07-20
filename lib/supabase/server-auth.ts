import { NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './admin';

/**
 * Valida el JWT de Supabase enviado en el header Authorization
 * y devuelve el usuario autenticado, o null si el token es inválido.
 * Todas las API routes deben derivar la identidad de aquí — nunca
 * confiar en un userId enviado en el body o query string.
 */
export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) return null;

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;

    return data.user;
}
