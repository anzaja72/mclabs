# MC Labs — Suite Contable Inteligente con IA

### Plataforma SaaS de herramientas contables que automatiza la conciliación bancaria, la conciliación DIAN, la generación de tableros financieros y la extracción de facturas, reduciendo el trabajo manual del contador y el riesgo de error en el cierre contable.

---

# 1. Descripción de la Operación

MC Labs es una plataforma SaaS orientada a contadores, firmas contables y pymes que necesitan automatizar tareas repetitivas de alto riesgo documental. Mediante Inteligencia Artificial generativa aplicada sobre archivos financieros (extractos bancarios, libros auxiliares, RIPS DIAN, facturas en PDF/Excel), el sistema interpreta, estructura y concilia la información, devolviendo reportes listos para revisión y cierre.

La plataforma opera como un conjunto de herramientas independientes detrás de un mismo login, con un modelo freemium basado en créditos por herramienta y monetización vía Stripe.

MC Labs permite:

* Conciliar automáticamente extractos bancarios contra el libro contable.
* Conciliar facturas y recibos con la información reportada a la DIAN.
* Cargar reportes financieros y obtener tableros analíticos al instante.
* Extraer datos estructurados de facturas en PDF o imagen.
* Gestionar créditos de uso por herramienta y por usuario.
* Cobrar paquetes de créditos de forma segura con Stripe.
* Mantener trazabilidad y auditoría de cada operación de IA.

Toda operación de IA se ejecuta del lado del servidor; las claves nunca se exponen al navegador.

---

# 2. Sub-sistemas del Núcleo Integrados

## Capa de IA Contable (Server-side)

Agente IA especializado en interpretar documentos financieros colombianos, invocado desde API routes protegidas con validación de JWT.

Funciones:

* Extracción de entidades desde PDF/Excel/imágenes.
* Reconocimiento de conceptos contables y tributarios.
* Comparación y matching entre conjuntos de datos.
* Sugerencias de clasificación y categorización.
* Devolución automática del crédito si la IA falla.

Proveedor: **OpenRouter** (una sola clave de servidor).

---

## Motor de Conciliación Bancaria

* Entrada: extracto bancario (PDF o Excel) + libro auxiliar (Excel).
* Carga segura a Supabase Storage.
* Lógica de matching en `conciliator-logic.ts`.
* Resultados con estados (conciliado, pendiente, discrepancia).
* Modales de detalle y estados para revisión interactiva.

---

## Conciliación DIAN

* Comparación de facturas/recibos con la información reportada ante la DIAN.
* Detección de inconsistencias y omisiones.
* Reporte de diferencias por documento.

---

## Tableros Financieros

* Carga de reportes financieros (Excel/CSV).
* Parseo con `xlsx` y `papaparse`.
* Visualización con **Recharts**.
* Indicadores de liquidez, ingresos, egresos y tendencias.

---

## Extractor de Facturas

* Carga de facturas en PDF o imagen (drag & drop con `react-dropzone`).
* Extracción estructurada vía IA (endpoint `extract-invoice`).
* Salida en JSON listo para integración contable.

---

## Dashboard de Usuario

Panel web con:

* Acceso a las cuatro herramientas.
* Banner de créditos disponibles por herramienta.
* Historial de uso.
* Pasarela de compra de paquetes (Stripe Checkout).
* Modal de paywall cuando se agotan los créditos.

---

## Sistema de Créditos y Paywall

* Modelo **freemium**: al registrarse, el usuario recibe 1 crédito de cada herramienta y 3 de extractor.
* Descuento **atómico del lado del servidor**; si la IA falla, el crédito se devuelve.
* Tabla `user_credits` en Supabase con políticas RLS (solo lectura para el usuario; el servidor descuenta con `service_role`).
* Paquetes pagados en COP vía Stripe Checkout.

---

## Integración de Pagos (Stripe)

* Stripe Checkout para compras de paquetes.
* Webhook idempotente (`checkout.session.completed`) con tabla `stripe_events`.
* Reintentos de Stripe no duplican créditos.
* Claves live ya configuradas.

---

## Infraestructura Tecnológica

### Frontend

* Next.js 16 (App Router)
* React 19
* TypeScript
* Tailwind CSS 4
* Shadcn/UI
* Recharts (visualización)
* `react-dropzone` / `canvas-confetti`

### Backend

* API Routes de Next.js (frontend + API en misma app)
* `/api/credits` · `/api/credits/use`
* `/api/ai/extract-invoice` · `extract-bank` · `reconcile-bank` · `reconcile-dian` · `analyze-financials`
* `/api/stripe/checkout` · `/api/stripe/webhook`

### Datos y Auth

* Supabase (Auth + Postgres: `user_credits`, `stripe_events`)
* Supabase Storage (bucket `bank-recs`)
* Validación de JWT en todas las APIs sensibles

### IA

* OpenRouter (clave única de servidor)
* OpenAI SDK como cliente

### Pagos

* Stripe (Checkout + Webhooks idempotentes)

### DevOps / Hosting

* Vercel (proyecto vinculado `mc-toolsbox`)
* Alternativamente Netlify (`netlify.toml` + plugin Next.js)
* Variables de entorno centralizadas

---

# 3. Componentes del Proyecto Cubiertos

## Conciliación Bancaria

Automatización del match extracto vs. libro contable.

## Conciliación DIAN

Verificación de facturación reportada vs. documentos internos.

## Tableros Financieros

Visualización analítica de reportes contables cargados.

## Extracción de Facturas

Parseo estructurado de facturas desde PDF/imagen.

## Gestión de Créditos

Medición y control de uso por herramienta y usuario.

## Monetización

Venta de paquetes de créditos con Stripe.

## Seguridad

Claves de IA en servidor, JWT, RLS, webhook idempotente.

---

# 4. Estándar de Cumplimiento

MC Labs se diseña teniendo en cuenta:

* Principios de protección de datos personales (Ley 1581 de 2012 y Decreto 1377 de 2013).
* Manejo seguro de información financiera de clientes.
* Trazabilidad de operaciones de IA (qué se procesó y cuándo).
* Control de acceso por usuario autenticado (Supabase Auth).
* Separación estricta entre claves de servidor y暴露 al cliente (claves IA no viajan en el bundle).
* Idempotencia en eventos de pago (sin doble cobro / doble crédito).

> ⚠️ Pendiente: página de Términos y Privacidad (los enlaces del footer apuntan a `#`).

---

# 5. Propuesta de Valor

### Para el Contador

* Menos trabajo manual de conciliación.
* Menor riesgo de error humano.
* Cierre contable más rápido.
* Herramientas accesibles desde el navegador.

### Para la Firma Contable

* Estándar de calidad uniforme entre contadores.
* Reducción de reprocesos.
* Escalabilidad sin ampliar nómina.

### Para la Pyme

* Conciliaciones confiables sin software costoso.
*visión financiera al instante con tableros.
*Pago por uso, sin licencias anuales.

---

# 6. Datos de Referencia

| Campo                       | Información                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| Plataforma                  | MC Labs (repo `mc-toolsbox`)                                             |
| Tipo                        | SaaS Contable con IA                                                     |
| Modalidad                   | Web                                                                      |
| Usuarios objetivo           | Contadores, firmas contables y pymes                                     |
| Funcionalidades principales | Conciliación Bancaria · Conciliación DIAN · Tableros · Extractor · Pagos |
| Capa de IA                  | OpenRouter (GPT y modelos disponibles)                                   |
| Formatos de entrada         | PDF · Excel · CSV · Imagen                                               |
| Formatos de salida          | JSON estructurado · Tableros Recharts · Reportes conciliados             |
| Integración de pagos        | Stripe (Checkout + Webhooks)                                             |
| Auth y Datos                | Supabase (Auth + Postgres + Storage)                                     |
| Modelo comercial            | Freemium con créditos + paquetes pagos en COP                            |
| Paquetes                    | Completo $100.000 COP (2+2+2 + 30 extracciones) · Individual $50.000 COP |
| Estado actual               | Pre-lanzamiento (pendiente migrar Supabase a HTTPS)                       |
| URL de producción           | Pendiente (sugerida `mclabs.co` → Vercel)                                 |
| Stack                       | Next.js 16 · React 19 · TypeScript · Tailwind · Supabase · Stripe · OpenRouter |
| Hosting                     | Vercel (o Netlify)                                                       |
| Mercado objetivo inicial    | Colombia                                                                 |
| Responsable                 | Ángel Zambrano Jaraba                                                    |