const { createClient } = require('@supabase/supabase-js');
const url = 'http://187.77.4.10:9999';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.dDFgI69N7rgFbX7uNPEJ_m_l3CkXbIxTMkZiGV7rHMo';
const supabase = createClient(url, key);

async function test() {
  console.log("Intentando registro de prueba en puerto 9999...");
  try {
      const { data, error } = await supabase.auth.signUp({
        email: 'test_validation_' + Date.now() + '@mclabs.com',
        password: 'password1234',
        options: {
            data: {
                phone: '1234567890'
            }
        }
      });
      if (error) {
        console.error('ERROR OBTENIDO:', error.message, error.status);
      } else {
        console.log('EXITO! Respuesta del servidor:', data.user ? "Usuario creado" : "Ok");
      }
  } catch (err) {
      console.error('EXCEPCION OBTENIDA:', err.message);
  }
}
test();
