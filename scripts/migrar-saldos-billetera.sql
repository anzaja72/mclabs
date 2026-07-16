-- ============================================================
-- CUTOVER Fase 3 — Ejecutar UNA VEZ, justo antes del deploy a
-- producción del código que consume la billetera unificada.
--
-- 1) Convierte los saldos de user_credits a créditos MC "por usos":
--    cada uso que el usuario tenía comprado/regalado conserva su
--    equivalente exacto en créditos (bank/dian/tableros × 12,
--    extractor × 1). Lotes motivo 'migracion' SIN vencimiento
--    (derecho adquirido). Idempotente por referencia.
-- 2) Apaga el trigger viejo de bienvenida (user_credits); la
--    bienvenida nueva (30 créditos) ya la da trg_billetera_bienvenida.
-- ============================================================

-- 1) Migrar saldos por usos
select
  uc.user_id,
  (uc.bank_recs_credits * 12
   + uc.conciliator_credits * 12
   + uc.dashboards_credits * 12
   + uc.extractor_credits * 1) as creditos_convertidos,
  public.creditos_acreditar(
    uc.user_id,
    (uc.bank_recs_credits * 12
     + uc.conciliator_credits * 12
     + uc.dashboards_credits * 12
     + uc.extractor_credits * 1),
    'migracion',
    'migracion:user_credits:' || uc.user_id::text,
    null  -- sin vencimiento: derecho adquirido
  ) as resultado
from public.user_credits uc
where (uc.bank_recs_credits * 12
       + uc.conciliator_credits * 12
       + uc.dashboards_credits * 12
       + uc.extractor_credits * 1) > 0;

-- 2) Apagar el welcome viejo (la tabla user_credits queda solo como auditoría)
drop trigger if exists on_auth_user_created on auth.users;

-- Verificación: saldo resultante por usuario
select u.email, public.creditos_saldo(u.id) as saldo_creditos
from auth.users u
order by u.created_at;
