import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ToolType, TOOL_CREDIT_COLUMN, UserCredits } from '@/types/credits';

/**
 * Billetera unificada MC Tools: un solo saldo de créditos por usuario.
 * La lógica vive en Postgres (RPCs creditos_* SECURITY DEFINER, ver
 * migración billetera_unificada_fase1); este módulo solo las invoca y
 * traduce el saldo al formato UserCredits que la UI ya conoce
 * (créditos por herramienta = usos disponibles = floor(saldo / costo)).
 *
 * La bienvenida (30 créditos) la acredita un trigger en auth.users.
 * Los saldos del esquema viejo (user_credits) se convierten con
 * scripts/migrar-saldos-billetera.sql en el cutover.
 */

export const VIGENCIA_MESES = 12;

type Tarifario = Record<string, number>;

let tarifarioCache: { data: Tarifario; at: number } | null = null;

export async function getTarifario(): Promise<Tarifario> {
    // El tarifario casi nunca cambia: cache de 5 minutos por instancia
    if (tarifarioCache && Date.now() - tarifarioCache.at < 300_000) {
        return tarifarioCache.data;
    }
    const { data, error } = await supabaseAdmin
        .from('tarifario')
        .select('herramienta, costo_creditos')
        .eq('activo', true);
    if (error) throw error;
    const tarifario: Tarifario = {};
    for (const row of data ?? []) tarifario[row.herramienta] = row.costo_creditos;
    tarifarioCache = { data: tarifario, at: Date.now() };
    return tarifario;
}

export async function getSaldo(userId: string): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc('creditos_saldo', { p_user: userId });
    if (error) throw error;
    return (data as number) ?? 0;
}

/** Saldo → formato UserCredits legado: usos disponibles por herramienta. */
function toUserCredits(userId: string, saldo: number, tarifario: Tarifario): UserCredits {
    const usos = (tool: ToolType) => {
        const costo = tarifario[tool];
        return costo && costo > 0 ? Math.floor(saldo / costo) : 0;
    };
    return {
        id: userId,
        user_id: userId,
        bank_recs_credits: usos('bank_recs'),
        conciliator_credits: usos('conciliator'),
        dashboards_credits: usos('dashboards'),
        extractor_credits: usos('extractor'),
        saldo,
        updated_at: new Date().toISOString(),
    };
}

export async function getOrCreateCredits(userId: string): Promise<UserCredits> {
    const [saldo, tarifario] = await Promise.all([getSaldo(userId), getTarifario()]);
    return toUserCredits(userId, saldo, tarifario);
}

export type ConsumeResult =
    | { ok: true; credits: UserCredits; referencia: string; saldo: number }
    | { ok: false; needsPurchase: boolean };

/**
 * Consume el costo de la herramienta desde la billetera (FIFO por
 * vencimiento, atómico e idempotente por referencia en Postgres).
 */
export async function consumeCredit(userId: string, tool: ToolType): Promise<ConsumeResult> {
    if (!TOOL_CREDIT_COLUMN[tool]) throw new Error(`Herramienta no válida: ${tool}`);

    const referencia = `uso:${tool}:${randomUUID()}`;
    const { data, error } = await supabaseAdmin.rpc('creditos_consumir', {
        p_user: userId,
        p_herramienta: tool,
        p_referencia: referencia,
    });

    if (error) {
        if ((error.message || '').includes('SIN_CREDITOS')) {
            return { ok: false, needsPurchase: true };
        }
        throw error;
    }

    const saldo = (data as { saldo?: number })?.saldo ?? (await getSaldo(userId));
    const tarifario = await getTarifario();
    return { ok: true, credits: toUserCredits(userId, saldo, tarifario), referencia, saldo };
}

/**
 * Devuelve el costo de la herramienta al usuario (la IA falló después
 * de cobrar). Acredita un lote de ajuste con vigencia estándar.
 */
export async function refundCredit(userId: string, tool: ToolType): Promise<void> {
    const tarifario = await getTarifario();
    const costo = tarifario[tool];
    if (!costo || costo <= 0) return;

    const vence = new Date();
    vence.setMonth(vence.getMonth() + VIGENCIA_MESES);

    const { error } = await supabaseAdmin.rpc('creditos_acreditar', {
        p_user: userId,
        p_cantidad: costo,
        p_motivo: 'ajuste',
        p_referencia: `reembolso:${tool}:${randomUUID()}`,
        p_vence: vence.toISOString(),
    });
    if (error) throw error;
}

/** Acredita los créditos de un paquete comprado (idempotente por referencia). */
export async function acreditarCompra(
    userId: string,
    creditos: number,
    referencia: string
): Promise<{ saldo: number; duplicado: boolean }> {
    const vence = new Date();
    vence.setMonth(vence.getMonth() + VIGENCIA_MESES);

    const { data, error } = await supabaseAdmin.rpc('creditos_acreditar', {
        p_user: userId,
        p_cantidad: creditos,
        p_motivo: 'compra',
        p_referencia: referencia,
        p_vence: vence.toISOString(),
    });
    if (error) throw error;
    const result = data as { saldo?: number; duplicado?: boolean };
    return { saldo: result?.saldo ?? 0, duplicado: result?.duplicado ?? false };
}
