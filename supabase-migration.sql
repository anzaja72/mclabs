-- ============================================================
-- MC Labs: Tabla de Créditos de Usuario
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Crear tabla de créditos
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

-- 2. Habilitar RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de seguridad
-- Los usuarios pueden ver sus propios créditos
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Los usuarios pueden actualizar sus propios créditos (para descontar)
CREATE POLICY "Users can update own credits"
  ON user_credits FOR UPDATE
  USING (auth.uid() = user_id);

-- El service_role puede hacer todo (para webhooks del servidor)
CREATE POLICY "Service role full access"
  ON user_credits FOR ALL
  USING (true);

-- 4. Trigger: Crear fila de créditos automáticamente al registrarse
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si ya existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- 5. Crear filas para usuarios existentes que aún no tengan créditos
INSERT INTO user_credits (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits)
ON CONFLICT (user_id) DO NOTHING;
