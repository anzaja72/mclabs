# Plan de Pruebas — MC Labs

**Entorno de pruebas:** https://tools.mcconsultorias.com.co
**Usuario QA:** `qa-test@mclabs.co`
**Usuario dueño:** `anzaja72@gmail.com`

> Antes de empezar: confirma que `qa-test@mclabs.co` tiene contraseña conocida (o resetéala desde el login con "Olvidé mi contraseña"). No uses la cuenta del dueño para pruebas destructivas de créditos — usa la cuenta QA.

---

## 1. Documentos/archivos de prueba que necesitas preparar

Reúne estos archivos ANTES de empezar (pueden ser ficticios, pero con estructura real):

| # | Archivo | Formato | Para qué prueba |
|---|---|---|---|
| 1 | Extracto bancario | Excel/CSV | Conciliación bancaria |
| 2 | Libro auxiliar contable | Excel/CSV | Conciliación bancaria (contraparte del extracto) |
| 3 | Extracto con nómina consolidada + libro con nómina desagregada | Excel/CSV | Probar instrucciones personalizadas de IA (agrupación N:1) |
| 4 | Reporte de facturas propio | Excel/CSV | Conciliación DIAN |
| 5 | Reporte RIPS/DIAN (o exógena) | Excel/CSV | Conciliación DIAN (contraparte) |
| 6 | Estado financiero (balance o P&G) | PDF | Tableros — extracción desde documento |
| 7 | Estado financiero mismo contenido | Excel | Tableros — extracción desde tabla |
| 8 | Archivo > 4 MB (cualquiera) | PDF | Validar límite `MAX_FILE_MB` en tableros |
| 9 | Factura de compra/venta | PDF o imagen (JPG/PNG) | Extractor de facturas IA |
| 10 | Factura borrosa o mal escaneada | Imagen | Extractor — caso límite de calidad OCR |
| 11 | Archivo con formato incorrecto (ej. .docx) | Cualquiera | Validar rechazo de formato no soportado |
| 12 | Archivo vacío o corrupto | Cualquiera | Validar manejo de error |

---

## 2. Pruebas por módulo

### 2.1 Autenticación y cuenta
- [ ] Registro de usuario nuevo → verificar créditos de bienvenida (1 bancaria, 1 DIAN, 1 tableros, 3 extractor)
- [ ] Login con credenciales correctas
- [ ] Login con credenciales incorrectas → mensaje de error claro
- [ ] Cerrar sesión y volver a entrar → créditos persisten
- [ ] Confirmación de email al registrarse (si está habilitada) — *pendiente: Site URL en Supabase Auth*
- [ ] Recuperar contraseña ("olvidé mi contraseña")

### 2.2 Conciliación bancaria (`/bank-recs`)
- [ ] Subir extracto (#1) + libro auxiliar (#2) → conciliación local automática
- [ ] Revisar matches exactos (misma fecha/monto)
- [ ] Casos con diferencias menores (fecha ±1 día, monto con centavos distintos)
- [ ] Escribir instrucción personalizada (ej. "la nómina aparece consolidada en el banco pero desagregada en contabilidad, agrúpalas") usando archivos #3
- [ ] Ejecutar "Aplicar con IA" → verificar que agrupa correctamente 1:N o N:1
- [ ] Revisar que las notas de la IA expliquen el criterio de match
- [ ] Exportar reporte Excel (4 hojas) → abrir y verificar contenido
- [ ] Repetir sin crédito disponible → debe bloquear y ofrecer comprar
- [ ] Verificar que si la IA falla a mitad de proceso, el crédito se reembolsa (no se descuenta si no hubo resultado)

### 2.3 Conciliación DIAN (`/conciliator`)
- [ ] Subir reporte propio (#4) + reporte DIAN (#5)
- [ ] Conciliación local: verificar que NO inventa filas ni cambia montos
- [ ] Aplicar ajustes IA (instrucciones personalizadas opcionales)
- [ ] Verificar los 4 estados posibles por fila: OK / ADVERTENCIA / CRÍTICO / SOLO_DIAN
- [ ] Revisar campo `notaIA` por fila con la explicación
- [ ] Probar con > 500 filas (límite `MAX_ROWS`) → debe truncar o avisar
- [ ] Repetir sin crédito disponible

### 2.4 Tableros financieros (`/dashboards`)
- [ ] Subir estado financiero en PDF (#6) → verificar extracción correcta de cifras
- [ ] Subir el mismo estado en Excel (#7) → comparar que los KPIs coincidan con la versión PDF
- [ ] Verificar KPIs con iconos de tendencia (↑/↓) coherentes con los datos
- [ ] Revisar gráficos (dona, barras) — que los valores sumen correctamente
- [ ] Revisar sección de insights con "Acción:" — que las recomendaciones sean coherentes con las cifras
- [ ] Exportar a PDF (`window.print()`) → verificar que se ve bien impreso (sin elementos de UI cortados)
- [ ] Subir archivo > 4 MB (#8) → debe rechazar con mensaje claro
- [ ] Subir formato no soportado (#11) → debe rechazar
- [ ] Repetir sin crédito disponible

### 2.5 Extractor de facturas (`/extractor` o equivalente)
- [ ] Subir factura PDF nítida (#9) → verificar JSON estructurado completo (NIT, fecha, ítems, total, IVA)
- [ ] Subir factura como imagen (JPG/PNG)
- [ ] Subir factura borrosa (#10) → evaluar calidad de extracción, debe indicar baja confianza si aplica
- [ ] Extraer varias facturas seguidas → verificar descuento de crédito por unidad (30 créditos de bienvenida deben durar 30 facturas)
- [ ] Repetir sin crédito disponible

### 2.6 Créditos y paywall
- [ ] Agotar créditos de una herramienta → aparece `paywall-modal`
- [ ] Verificar que cada herramienta muestra su saldo actual correctamente en la UI
- [ ] Intentar usar una herramienta sin créditos vía llamada directa a la API (no solo UI) → debe responder 403 `needsPurchase: true`

### 2.7 Pagos con Stripe (usar tarjetas de prueba si Stripe está en modo test, o montos reales pequeños si es live)
- [ ] Comprar **Paquete Completo** ($100.000) → verificar que suma 2/2/2/30 a los créditos existentes (no reemplaza)
- [ ] Comprar un paquete individual (ej. **Bancario** $50.000) → verifica que solo suma `bank_recs_credits`
- [ ] Cancelar el checkout antes de pagar → vuelve a la app con `?payment=cancelled`, sin cambios en créditos
- [ ] Completar el pago → vuelve con `?payment=success` → confetti + banner de éxito + créditos actualizados
- [ ] Verificar en Stripe Dashboard que el webhook `checkout.session.completed` respondió 200
- [ ] Reenviar manualmente el mismo evento de webhook desde Stripe (botón "Resend") → NO debe duplicar créditos (protección `stripe_events` con `event_id` único)
- [ ] Revisar tabla `user_credits` en Supabase directamente para confirmar que los números cuadran con lo comprado

### 2.8 Seguridad / casos límite
- [ ] Intentar llamar cualquier `/api/ai/*` sin header `Authorization` → debe responder 401
- [ ] Intentar llamar con un JWT expirado o de otro usuario → debe rechazar
- [ ] Confirmar que las claves de OpenRouter/Stripe no aparecen en el bundle del cliente (inspeccionar Network/Sources en DevTools, buscar `sk-` o `sk_live_`)
- [ ] Confirmar que un usuario no puede ver ni modificar créditos de otro usuario (probar con dos cuentas)

### 2.9 Responsive / UI
- [ ] Probar flujo completo en móvil (viewport angosto)
- [ ] Probar en modo oscuro/claro si aplica
- [ ] Verificar que el banner de pago exitoso no se rompe si se refresca la página con el query param todavía en la URL

---

## 3. Registro de resultados

Para cada prueba marcada, registrar:
- ✅ Pasó / ❌ Falló / ⚠️ Parcial
- Captura de pantalla si falló
- Fecha y quién ejecutó la prueba

Recomiendo una copia de este archivo como checklist real (Google Sheets o Notion) para ir marcando durante la sesión de pruebas, ya que es más rápido de actualizar en vivo que este Markdown.

---

## 4. Pendientes conocidos (no bloquean pruebas, pero afectan resultado esperado)

- Site URL de Supabase Auth sin configurar → los emails de confirmación pueden apuntar a la URL incorrecta
- API key de OpenRouter usada durante desarrollo quedó expuesta en el historial de esta sesión — pendiente rotarla y revocar las anteriores
- Contraseña temporal de `anzaja72@gmail.com` en Supabase Cloud — cambiarla tras el primer login
