import { supabaseAdmin } from '@/lib/supabase/admin';
import { ToolType, TOOL_CREDIT_COLUMN, UserCredits } from '@/types/credits';

/**
 * Créditos de bienvenida (freemium): primer uso gratis por herramienta.
 * El extractor recibe más porque su unidad de consumo es por factura.
 */
export const WELCOME_CREDITS = {
    bank_recs_credits: 1,
    conciliator_credits: 1,
    dashboards_credits: 1,
    extractor_credits: 3,
};

export async function getOrCreateCredits(userId: string): Promise<UserCredits> {
    const { data, error } = await supabaseAdmin
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (data) return data as UserCredits;

    if (error && error.code !== 'PGRST116') throw error;

    const { data: created, error: insertError } = await supabaseAdmin
        .from('user_credits')
        .insert({ user_id: userId, ...WELCOME_CREDITS })
        .select()
        .single();

    if (insertError) {
        // Carrera con el trigger on_auth_user_created: la fila ya existe
        if (insertError.code === '23505') {
            const { data: existing, error: refetchError } = await supabaseAdmin
                .from('user_credits')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (refetchError) throw refetchError;
            return existing as UserCredits;
        }
        throw insertError;
    }
    return created as UserCredits;
}

export type ConsumeResult =
    | { ok: true; credits: UserCredits }
    | { ok: false; needsPurchase: boolean };

/**
 * Descuenta 1 crédito de forma atómica (compare-and-swap sobre el valor
 * leído). Si otro request concurrente modificó la fila, reintenta.
 */
export async function consumeCredit(userId: string, tool: ToolType): Promise<ConsumeResult> {
    const column = TOOL_CREDIT_COLUMN[tool];
    if (!column) throw new Error(`Herramienta no válida: ${tool}`);

    for (let attempt = 0; attempt < 3; attempt++) {
        const credits = await getOrCreateCredits(userId);
        const current = credits[column] as number;

        if (current <= 0) return { ok: false, needsPurchase: true };

        const { data: updated, error } = await supabaseAdmin
            .from('user_credits')
            .update({ [column]: current - 1, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq(column, current)
            .select()
            .single();

        if (!error && updated) return { ok: true, credits: updated as UserCredits };
        // PGRST116 = 0 filas afectadas → otro request ganó la carrera; reintentar
        if (error && error.code !== 'PGRST116') throw error;
    }

    return { ok: false, needsPurchase: false };
}

/**
 * Devuelve 1 crédito (p. ej. si la llamada a la IA falló después de descontar).
 */
export async function refundCredit(userId: string, tool: ToolType): Promise<void> {
    const column = TOOL_CREDIT_COLUMN[tool];
    for (let attempt = 0; attempt < 3; attempt++) {
        const credits = await getOrCreateCredits(userId);
        const current = credits[column] as number;

        const { error } = await supabaseAdmin
            .from('user_credits')
            .update({ [column]: current + 1, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq(column, current);

        if (!error) return;
        if (error.code !== 'PGRST116') throw error;
    }
}
