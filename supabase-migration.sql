-- ============================================================
-- MC Labs: Esquema de producción (créditos + eventos Stripe)
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Es idempotente: se puede re-ejecutar sin riesgo.
-- ============================================================

-- 1. Tabla de créditos
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bank_recs_credits INT DEFAULT 0,
  conciliator_credits INT DEFAULT 0,
  dashboards_credits INT DEFAULT 0,
  extractor_credits INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Tabla de eventos de Stripe ya procesados (idempotencia del webhook)
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id UUID,
  package_type TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de seguridad
-- IMPORTANTE: los créditos solo se modifican desde el servidor con la
-- service_role key (que omite RLS). Los usuarios SOLO pueden leer los suyos.
-- Se eliminan políticas anteriores demasiado permisivas.
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON user_credits;
DROP POLICY IF EXISTS "Service role full access" ON user_credits;

CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- stripe_events: sin políticas → solo accesible con service_role.

-- 5. Trigger: crear fila de créditos con bono de bienvenida al registrarse
--    (1 uso gratis por herramienta; 3 extracciones de factura)
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, bank_recs_credits, conciliator_credits, dashboards_credits, extractor_credits)
  VALUES (NEW.id, 1, 1, 1, 3)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- 6. Crear filas para usuarios existentes que aún no tengan créditos
INSERT INTO user_credits (user_id, bank_recs_credits, conciliator_credits, dashboards_credits, extractor_credits)
SELECT id, 1, 1, 1, 3 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits)
ON CONFLICT (user_id) DO NOTHING;
