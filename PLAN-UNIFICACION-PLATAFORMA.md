# Plan de Unificación — MC Tools (plataforma única)

**Objetivo:** una sola URL (`tools.mcconsultorias.com.co`) con las 5 herramientas, un solo login y una sola lógica de créditos.

**Proyectos a unificar:**

1. **MC Labs** — `/Users/angelzambrano/Downloads/viejas descargas/CARPETAS/CARPETAS/MC toolsbox` (Next.js 16 + Supabase `bsrspypsbxehyfjofqel` + Stripe, en producción en Netlify)
2. **Declaración Renta DIAN 2025** — `/Users/angelzambrano/Downloads/Programa-Ayuda-Renta-DIAN-2025/DeclaracionRentaApp` (React 18/Vite + FastAPI + Supabase `dgrtyhttdhzclrdxifpy` + Wompi, despliegue Docker en Render)

---

## 1. Diagnóstico: en qué difieren hoy

| Eje | MC Labs | Declaración Renta |
|---|---|---|
| Identidad | Supabase proyecto A | Supabase proyecto B (login separado) |
| Billetera | 4 columnas por herramienta en `user_credits` | Códigos prepagados `MC-XXXX-XXXX-XXXX` con saldo único |
| Unidad | 1 crédito = 1 uso de herramienta | 1 crédito = 1 declaración; re-análisis gratis (tope 3M tokens) |
| Expiración | Nunca | 12 meses por código |
| Compra | Stripe Checkout, acreditación automática por webhook | Wompi Payment Link → webhook → código por email (Resend) → usuario lo activa |
| Precio efectivo | $25.000/conciliación o tablero; ~$1.667/factura | $40.000 (plan 5) / $30.000 (plan 10) / $20.000 (plan 25) por declaración |
| Gratis inicial | 1+1+1+3 créditos de bienvenida | No hay (pero existe BYOK: el usuario puede usar su propia API key) |
| Reembolso | Sí, si la IA falla | No aplica (idempotencia por declaración) |

---

## 2. Decisión central: billetera única con tarifario por acción

**Abandonar** tanto las columnas por herramienta como el saldo por código, y pasar a:

> **1 crédito MC = $1.000 COP** (unidad de valor única)
> Cada acción tiene un **costo en créditos** definido en un tarifario central.

### Tarifario aprobado (precios a la mitad de los actuales)

| Acción | Costo en créditos | Equivalente COP | Antes costaba |
|---|---|---|---|
| Conciliación bancaria | 12 | $12.000 | $25.000 |
| Conciliación DIAN | 12 | $12.000 | $25.000 |
| Tablero financiero | 12 | $12.000 | $25.000 |
| Extracción de factura | 1 | $1.000 | ~$1.667 |
| Declaración de renta | 12 | $12.000 | $20.000–$40.000 |

### Paquetes (definidos por el usuario 2026-07-16 — a mayor paquete, menor precio por crédito)

| Pago | Créditos | Precio/crédito | Uso mayor (12 cr.) sale a | Factura (1 cr.) sale a |
|---|---:|---:|---:|---:|
| $100.000 | 100 | $1.000 | $12.000 | $1.000 |
| $200.000 | 250 | $800 | $9.600 | $800 |
| $500.000 | 715 | $699,3 | $8.388 | $699 |

- ✅ Ya aplicado en producción: tabla `paquetes` en el Supabase unificado (migración `billetera_paquetes`). El webhook de Wompi resolverá el paquete por el monto pagado y acreditará sus créditos.
- Con $500.000 → 715 créditos → 59 usos mayores (el plan Oficina actual da 25 declaraciones: mejora clara para el cliente grande).
- **Bienvenida:** 30 créditos al registrarse (≈ 2 usos mayores gratis) — confirmado.
- ⚠️ En el nivel $500.000, el peor caso de declaración de renta (tope de 3M tokens agotado) deja margen de ~27% ($8.388 de ingreso vs. ~$6.100 de costo IA). Sigue positivo, pero al desplegar el FastAPI en Hostinger conviene bajar `MC_TOKENS_TOPE` a 2.000.000 (margen mínimo pasa a ~52%).

### 2b. Proyección de costo por uso vs. precio de venta (2026-07-16)

**Supuestos:** precios OpenRouter de hoy — Kimi K2.6: US$0,66/M tokens entrada, US$3,41/M salida; GLM-4.6: US$0,43/M entrada, US$1,75/M salida; OCR de PDFs (mistral-ocr): ~US$2 por 1.000 páginas. TRM: $3.234 COP/USD. Volúmenes estimados desde los límites reales del código (600 tx, 500 filas, 4 MB, tope 3M tokens/declaración).

| Herramienta | Costo IA típico | Costo IA extremo | Precio venta | Margen bruto |
|---|---:|---:|---:|---:|
| Conciliación bancaria (150+150 tx) | ~$80 COP | ~$390 (600+600 tx + OCR) | $12.000 | 97–99% |
| Conciliación DIAN (150 filas) | ~$100 | ~$320 (500 filas) | $12.000 | 97–99% |
| Tablero financiero (PDF 8 págs) | ~$125 | ~$420 (25 págs + reintento) | $12.000 | 96–99% |
| Extracción de factura | ~$16 | ~$65 (PDF multipágina) | $1.000 | 93–98% |
| Declaración de renta (12 soportes) | ~$800 | ~$6.100 (tope 3M tokens agotado) | $12.000 | 93% típico / 49% peor caso |

**Costos no-IA:**
- Comisión Wompi: ~2,65% + $700 + IVA por transacción → 3,3% (paquete $500.000) a ~4,8% (paquete $50.000) del ingreso.
- Fijos mensuales: Supabase Pro US$25 + VPS Hostinger ~US$9 + dominio/correo ~US$5 ≈ **US$40 ≈ $130.000 COP/mes** (Netlify capa gratuita al inicio). Punto de equilibrio: ~11 usos mayores al mes.
- Bienvenida (30 créditos gratis): costo real IA de ~$200–800 COP por usuario registrado — costo de adquisición muy bajo.

**Conclusiones:**
1. El tarifario a mitad de precio es **viable con holgura**: margen bruto >93% en todo excepto el peor caso de renta.
2. El único flanco es la declaración de renta con re-análisis intensivo: el tope de 3M tokens ya lo contiene (peor caso 49% de margen, nunca pérdida). Si la TRM volviera a ~$4.300, ese peor caso bajaría a ~32% — seguiría positivo. Opcional: bajar el tope a 2M tokens.
3. El extractor a $1.000/factura es el de menor margen relativo pero irrelevante en plata; su rol es de gancho de volumen.

### Reglas que se conservan (lo mejor de cada app)

- **De Renta:** consumo idempotente por trabajo (re-analizar la misma declaración no vuelve a cobrar, con tope de tokens anti-abuso); códigos prepagados como **mecanismo de recarga** (canal B2B/venta offline: sigues vendiendo códigos por transferencia y el cliente los redime en la plataforma); expiración 12 meses **de los créditos comprados** (decisión abierta).
- **De MC Labs:** reembolso automático del crédito si la IA falla; acreditación instantánea por webhook (sin esperar email).
- **BYOK** (key propia del usuario en Renta): se mantiene como vía alterna que no consume créditos — decisión abierta.

---

## 3. Arquitectura técnica de la unificación

### 3.1 Una sola identidad
Consolidar en el Supabase de MC Labs (`bsrspypsbxehyfjofqel`, ya en producción con Stripe):
- Migrar el esquema de Renta (declaraciones, soportes, revisiones, RLS) a ese proyecto.
- Migrar usuarios con la Admin API de Supabase (los hashes de contraseña se pueden importar; si algo falla, flujo de "restablecer contraseña" para los afectados).
- Migrar los archivos de Storage (soportes subidos).

### 3.2 Una sola billetera (la clave: la lógica vive en Postgres, no en los backends)
Como hay **dos backends en lenguajes distintos** (Node y Python), la lógica de créditos NO puede vivir duplicada en ambos. Se implementa **una sola vez en Postgres** como RPCs `SECURITY DEFINER` (patrón que Renta ya usa con `mc_consumir`):

```
billetera_lotes        -- cada acreditación (compra, código, bono, bienvenida) con su vencimiento
billetera_movimientos  -- ledger inmutable: delta, motivo, herramienta, referencia única
```

RPCs únicas que ambos backends llaman:
- `creditos_saldo(user)` — saldo disponible (lotes vigentes, FIFO por vencimiento)
- `creditos_consumir(user, herramienta, costo, referencia)` — idempotente por referencia (misma declaración/misma conciliación no cobra dos veces)
- `creditos_acreditar(user, cantidad, motivo, referencia, vencimiento)` — idempotente por referencia (webhook reintentado no duplica)
- `creditos_reembolsar(referencia)` — devuelve el consumo si la IA falló

MC Labs reemplaza `lib/credits-server.ts` (CAS sobre columnas) por llamadas a estas RPCs; Renta reemplaza las RPCs `mc_*` actuales. El tarifario vive en una tabla `tarifario` (editable sin redeploy).

### 3.3 Una sola URL
- `tools.mcconsultorias.com.co` = hub Next.js con el portal (tarjetas de las 5 herramientas, saldo único visible arriba).
- Las 4 herramientas de MC Labs ya viven ahí (nada que mover).
- El **SPA de Renta se compila con base `/renta/`** y se sirve como estáticos desde el mismo Netlify → mismo origen → **misma sesión de Supabase automáticamente** (mismo localStorage, cero trabajo de SSO).
- El **backend FastAPI queda en `api-renta.mcconsultorias.com.co`**, desplegado con Docker en el **VPS de Hostinger** (Nginx o Caddy como reverse proxy con TLS). El SPA le habla directo con CORS + JWT Bearer. ⚠️ No proxear el API por Netlify: los análisis con IA pueden superar el timeout de ~26 s de los rewrites de Netlify.
- Redirects 301 desde las URLs viejas.

### 3.4 Pagos: Wompi como pasarela única (decidido 2026-07-16)
- Todos los pagos en línea van por **Wompi** (PSE, Nequi, tarjetas, botón Bancolombia). **Stripe se retira** del flujo de compra en el cutover; su webhook puede quedar activo un tiempo solo para capturar eventos rezagados de compras viejas.
- Flujo unificado: el usuario elige paquete → el backend genera una **referencia única de compra** con firma de integridad de Wompi → redirección al checkout de Wompi → webhook `transaction.updated` verificado con el secreto de eventos → `creditos_acreditar(user, créditos + bono, 'compra', referencia, vence a 12 meses)`. Acreditación **instantánea al aprobar el pago** — desaparece el email con código como paso obligatorio.
- Los **códigos MC-XXXX se conservan** para venta offline/B2B: al redimirlos llaman a `creditos_acreditar`.
- **Links de pago definitivos** (✅ registrados en la tabla `paquetes` de producción, 2026-07-16):
  | Pack | Link | payment_link_id |
  |---|---|---|
  | MC Pack 100 ($100.000 → 100 créditos) | checkout.wompi.co/l/Z103wm | `Z103wm` |
  | MC Pack 200 ($200.000 → 250 créditos) | checkout.wompi.co/l/mOxem4 | `mOxem4` |
  | MC Pack 500 ($500.000 → 715 créditos) | checkout.wompi.co/l/eLSGKl | `eLSGKl` |
- **URLs a configurar en Wompi**:
  - Página de redirección de los 3 payment links: `https://tools.mcconsultorias.com.co/compra/confirmacion` (Wompi le agrega `?id=<transaction_id>`; la página verifica la transacción y acredita al usuario logueado).
  - URL de eventos (webhook, en Desarrolladores → Eventos): `https://tools.mcconsultorias.com.co/api/wompi/webhook` (respaldo server-side del redirect; acredita por email del pagador si coincide con un usuario).
- **Credenciales necesarias** (dashboard de Wompi → Desarrolladores): llave pública (`pub_prod_…`) y secreto de eventos (`prod_events_…`). El secreto de integridad no hace falta con payment links estáticos. El secreto de eventos ya existe en el Render de Renta (`WOMPI_EVENTS_SECRET`).
- ✅ **Bienvenida implementada** (migración `wompi_links_y_bienvenida`): trigger en `auth.users` acredita 30 créditos (vencen a 12 meses) a todo usuario nuevo, idempotente, sin bloquear el registro si falla. Convive con el welcome viejo de `user_credits` hasta el cutover de la Fase 3 (ahí se elimina el trigger viejo).

### 3.5 IA
- ✅ **MC Labs migrado a MiniMax M3** (`minimax/minimax-m3`, desplegado a producción 2026-07-16): multimodal texto+imagen, US$0,30/M entrada y US$1,20/M salida (vs. $0,66/$3,41 de Kimi K2.6 — los costos de IA de la proyección §2b bajan a menos de la mitad). Probado contra la API con la key de producción antes de desplegar.
- Renta sigue en GLM-4.6 + mistral-ocr en Render (no se toca); al desplegar en Hostinger (Fase 5) se cambia a MiniMax M3 vía variables `MC_MODEL_OCR`/`MC_MODEL_ANALISIS`, sin tocar código.
- Patrón común: key maestra en servidor, nunca en cliente.

---

## 4. Migración de saldos existentes

| Saldo actual | Conversión |
|---|---|
| `user_credits` de MC Labs | `bank×12 + dian×12 + tableros×12 + extractor×1` créditos, sin vencimiento (derecho adquirido: conserva exactamente los mismos usos que tenía) |
| Códigos MC activos de Renta | `disponibles × 12` créditos, conservando su fecha de expiración original (misma cantidad de declaraciones) |
| Códigos MC vendidos y no activados | Siguen redimibles con la conversión anterior |

> Alternativa más generosa: convertir por **dinero pagado** en vez de por usos (ej. 1 conciliación comprada a $25.000 → 25 créditos → 2 usos al precio nuevo). Duplica el valor entregado a clientes existentes; la conversión por usos (tabla de arriba) preserva exactamente lo que tenían. Decidir cuál aplicar en el cutover.

---

## 5. Fases de ejecución

| Fase | Qué se hace | Riesgo |
|---|---|---|
| **0. Decisiones** | Validar tarifario, paquetes, expiración, bienvenida, BYOK (ver §6) | — |
| **1. Ledger** | Crear `billetera_*` + RPCs + `tarifario` en el Supabase de MC Labs | Bajo (no toca nada existente) |
| **2. Migrar Renta a Supabase único** | Esquema, usuarios, storage, RLS | Medio (contraseñas, archivos) |
| **3. Backends → RPCs** | MC Labs y FastAPI consumen el ledger | Bajo (lógica ya centralizada) |
| **4. Pagos** | Webhooks Stripe + Wompi → ledger; redención de códigos | Medio (probar idempotencia) |
| **5. URL única** | Hub + SPA renta con base `/renta/` en Netlify + API renta en VPS Hostinger con CORS | Medio (configurar Docker + TLS en el VPS) |
| **6. Cutover** | Migrar saldos, redirects 301, congelar venta de códigos 24–48 h durante la ventana | Alto (comunicar a usuarios) |
| **7. Pruebas E2E** | Extender `PLAN-DE-PRUEBAS.md` con renta + billetera unificada | — |

\* Decidido: el FastAPI sale de Render y se despliega en el VPS de Hostinger (siempre encendido, sin cold start).

### Estrategia de convivencia: nada se apaga durante la migración

- La app de Renta en **Render y su Supabase actual NO se tocan** en las Fases 1–5: siguen en línea, usables y sirviendo de ambiente de pruebas mientras se construye la versión unificada.
- La Fase 2 **copia** los datos al Supabase unificado (no los mueve). Si algo sale mal, la app original sigue intacta.
- MC Labs en producción tampoco cambia de comportamiento hasta que se despliegue la Fase 3 (y eso se prueba primero en un deploy de preview de Netlify).
- El corte real es solo la Fase 6: se congela la venta 24–48 h, se re-sincronizan los datos creados durante la transición, se activan los redirects y ahí sí se apaga Render.

---

## 6. Decisiones que necesito de ti antes de ejecutar

Todas resueltas el 2026-07-16:

1. ✅ **Tarifario y paquetes**: aprobado con precios a la mitad.
2. ✅ **Expiración**: 12 meses para todo crédito nuevo (compra, código, bono, bienvenida). Los saldos migrados de MC Labs quedan sin vencimiento (derecho adquirido); los códigos de Renta conservan su vencimiento original.
3. ✅ **Bienvenida**: 30 créditos.
3b. ✅ **Conversión de saldos existentes**: por usos (cada quien conserva exactamente los usos que tenía).
4. ✅ **BYOK en Renta**: se mantiene (usuario con su propia API key no consume créditos).
5. ✅ **Hosting del FastAPI**: VPS de Hostinger (Docker + Nginx/Caddy con TLS, dominio `api-renta.mcconsultorias.com.co`).
6. ✅ **Contraseñas**: la base de datos se unifica (un solo usuario, un solo saldo, todas las herramientas). Si el import del hash de contraseña de algún usuario de Renta falla, ese usuario restablece la suya con "olvidé mi contraseña" — caso raro, sin pérdida de datos.
