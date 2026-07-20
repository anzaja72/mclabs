import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Lazy-initialized Supabase client
let supabaseInstance: SupabaseClient | null = null

export const getSupabase = (): SupabaseClient => {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase credentials not configured. Please check your .env.local file.')
    }

    if (!supabaseInstance) {
        supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
    }
    return supabaseInstance
}

// Export for compatibility with existing code
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null as unknown as SupabaseClient

