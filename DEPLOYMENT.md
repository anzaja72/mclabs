# MC Labs — Guía de despliegue a producción

Plataforma SaaS de herramientas contables con IA (conciliación bancaria, conciliación DIAN, tableros financieros y extractor de facturas), con login (Supabase Auth), créditos por herramienta y pagos con Stripe.

## Arquitectura de producción

```
Usuario (navegador)
   │
   ▼
Vercel (Next.js 16 — frontend + API routes)
   ├── /api/credits, /api/credits/use        → Supabase (service_role)
   ├── /api/ai/extract-invoice, extract-bank → OpenRouter (clave solo servidor)
   ├── /api/stripe/checkout                  → Stripe Checkout
   └── /api/stripe/webhook  ◄─────────────── Stripe (eventos de pago)
   │
   ▼
Supabase (Auth + Postgres: user_credits, stripe_events)
```

## Infraestructura necesaria

| Componente | Recomendación | Costo aprox. |
|---|---|---|
| Hosting frontend + API | **Vercel** (proyecto ya vinculado: `mc-toolsbox`) | Gratis (Hobby) / US$20 mes (Pro, recomendado para uso comercial) |
| Base de datos + Auth | **Supabase Cloud** (migrar desde self-hosted) o asegurar el self-hosted con HTTPS | Gratis / US$25 mes (Pro) |
| IA | **OpenRouter** (una sola clave de servidor) | Por consumo (~US$0,01–0,05 por operación) |
| Pagos | **Stripe** (ya configurado en modo live) | 3,25 % + comisión por transacción en COP |
| Dominio | p. ej. `mclabs.co` apuntado a Vercel | ~US$15 año |

### ⚠️ Sobre el Supabase self-hosted actual (`http://187.77.4.10:8000`)

Funciona, pero **no es apto para producción tal como está**:
- Va por **HTTP sin TLS**: las contraseñas de los usuarios viajan en texto plano, y los navegadores bloquean peticiones HTTP desde un sitio HTTPS (mixed content) — **el login fallará en producción en Vercel**.
- Opción A (recomendada): crear proyecto en [supabase.com](https://supabase.com), ejecutar `supabase-migration.sql`, y actualizar las variables de entorno.
- Opción B: mantener el self-hosted poniéndole un dominio + certificado TLS (Caddy/Nginx + Let's Encrypt) delante, p. ej. `https://api.mclabs.co`.

## Pasos de despliegue

### 1. Rotar claves comprometidas (OBLIGATORIO)

Las claves de OpenRouter y Gemini estaban expuestas en el bundle del navegador (`NEXT_PUBLIC_*`). Antes de lanzar:
1. En [openrouter.ai/keys](https://openrouter.ai/keys): revocar las 4 claves antiguas y crear **una** nueva → `OPENROUTER_API_KEY`.
2. La clave de Gemini (`AIzaSy...`) ya no se usa: revocarla en Google AI Studio.
3. Verificar en el dashboard de Stripe que no haya actividad sospechosa (las claves live estuvieron en archivos locales).

### 2. Base de datos

Ejecutar `supabase-migration.sql` en el SQL Editor de Supabase. Crea/actualiza:
- `user_credits` con bono de bienvenida (1 crédito por herramienta, 3 de extractor) al registrarse.
- `stripe_events` (idempotencia del webhook).
- Políticas RLS de solo lectura para usuarios (los créditos solo los modifica el servidor).

### 3. Vercel

```bash
vercel link   # ya vinculado a mc-toolsbox
vercel env add ...   # o por dashboard
vercel --prod
```

Variables de entorno (ver `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL` (HTTPS en producción)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` (p. ej. `https://mclabs.co`)

### 4. Stripe webhook (crítico — sin esto los pagos NO acreditan créditos)

1. [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**.
2. URL: `https://<tu-dominio>/api/stripe/webhook`.
3. Evento: `checkout.session.completed`.
4. Copiar el **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET` en Vercel → redeploy.
5. Probar con un pago real pequeño o con `stripe trigger checkout.session.completed` (Stripe CLI).

### 5. Supabase Auth

- En Authentication > URL Configuration: poner `Site URL = https://<tu-dominio>` (los emails de confirmación redirigen ahí).
- Activar confirmación de email si se desea (actualmente el registro pide confirmación).

## Modelo de negocio implementado

- **Freemium**: al registrarse, cada usuario recibe 1 crédito de cada herramienta y 3 de extractor.
- **Paquetes** (Stripe Checkout, COP):
  - Completo $100.000: 2+2+2 + 30 extracciones.
  - Individuales $50.000: 2 usos (o 30 extracciones).
- El descuento de créditos es **atómico y del lado del servidor**; si la IA falla, el crédito se devuelve automáticamente.

## Seguridad aplicada en este release

- Claves de IA movidas al servidor (antes cualquiera podía robarlas del bundle del navegador).
- Todas las APIs (`/api/credits*`, `/api/ai/*`, `/api/stripe/checkout`) validan el JWT de Supabase; ya no aceptan `userId` arbitrario.
- Eliminado el backdoor que regalaba 100 créditos a cualquier `userId` desconocido.
- RLS corregido: los usuarios solo pueden LEER sus créditos (antes podían editárselos y existía una política `USING (true)` que anulaba todo).
- Webhook de Stripe idempotente (tabla `stripe_events`): un reintento de Stripe ya no duplica créditos.

## Pendientes recomendados (post-lanzamiento)

- Migrar Supabase a HTTPS (bloqueante para producción, ver arriba).
- Limpiar `add-credits.js`, `test-supabase.js`, `test-supabase-9999.js` (scripts de prueba locales; no desplegar).
- Página de términos y privacidad (los enlaces del footer apuntan a `#`).
- Límite de tamaño de archivo en los endpoints de IA (hoy se acepta cualquier tamaño en base64).
- Habría que decidir si `/landing` será la página pública de marketing (hoy la raíz `/` exige login).
