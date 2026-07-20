# MC Labs Architecture Documentation

## Project Overview
MC Labs is an accounting AI suite designed to automate financial workflows.
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Supabase, N8N, Stripe.

## Design System
- **Primary Color:** `#009FE3` (Cyan/Blue) - Used for CTAs, active states, and highlights.
- **Secondary Color:** `#000000` (Black) - Primary text and headers.
- **Background:** `#FFFFFF` (White) with subtle gray borders (`#E5E7EB`).
- **Typography:** Inter or similar clean sans-serif (via Shadcn/Next.js default).
- **Radius:** `rounded-xl` (0.75rem) for cards and buttons.
- **Spacing:** Extensive whitespace, minimalist clean layout.
- **UI Library:** Shadcn/UI.

## Core Features Architecture

### 1. Tributar-ia Integration
- **Mechanism:** Secure `iframe` embedding.
- **Location:** Dedicated dashboard route (e.g., `/dashboard/tributar-ia`).
- **Security:** Ensure proper CSP headers if necessary.

### 2. Bank Reconciliation
- **Input:**
  - 1 Bank File (PDF or Excel).
  - 1 Ledger File (Excel).
- **Flow:**
  1. Frontend uploads files to Supabase Storage (Bucket: `bank-recs`).
  2. Upload triggers N8N Webhook.
  3. N8N processes files and performs matching logic.
  4. Results returned to frontend (polling or realtime subscription).

### 3. Financial Dashboards
- **Input:** User uploads Financial Report (Excel/CSV).
- **Processing:**
  - Client-side parsing (e.g., `xlsx`, `papaparse`) or Edge Function.
  - Transformation to JSON format suitable for graphing.
- **Visualization:** Recharts or Visx.

### 4. Paywall Logic (Metering)
- **Data Model:**
  - `user_usage` table: tracks `usage_count` per tool per user.
- **Business Logic:**
  - **Freemium:** First use is free (`usage_count < 1`).
  - **Gate:** If `usage_count > 0` AND `subscription_status != 'active'`, redirect to Stripe Checkout.

## Directory Structure
```
/app                # Next.js App Router
  /components       # Shared UI components
  /(dashboard)      # Authenticated routes
/components         # Shadcn & global components
  /ui               # Shadcn primitives
/lib
  /supabase         # Supabase client & admin
  /types            # TypeScript interfaces
  /utils            # Helper functions
/hooks              # Custom React hooks
/public             # Static assets
```
