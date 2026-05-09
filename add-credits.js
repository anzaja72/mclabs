const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');

const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addCredits() {
  console.log("Conectando a Supabase para recargar créditos...");
  const { data, error } = await supabase
    .from('user_credits')
    .update({
        bank_recs_credits: 100,
        conciliator_credits: 100,
        dashboards_credits: 100,
        extractor_credits: 100
    })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all users

  if (error) {
    console.error("Error al actualizar créditos:", error);
  } else {
    console.log("¡Éxito! Se han recargado 100 créditos a todos los usuarios registrados.");
  }
}

addCredits();
