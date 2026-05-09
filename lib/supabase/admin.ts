import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service_role key
// This bypasses RLS and should ONLY be used in API routes
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
