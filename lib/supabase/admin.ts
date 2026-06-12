import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client with service_role key
// This bypasses RLS and should ONLY be used in API routes.
// Inicialización perezosa: evita que el build falle al recolectar page data
// cuando las variables de entorno aún no están disponibles.
let instance: SupabaseClient | null = null;

const getSupabaseAdmin = (): SupabaseClient => {
    if (!instance) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('Supabase admin no configurado: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
        }
        instance = createClient(url, key, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    return instance;
};

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getSupabaseAdmin() as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
});
