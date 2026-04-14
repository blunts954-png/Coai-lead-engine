# COAI Launch Setup

## 1) Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 2) Environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL` — full URL including `https://` (e.g. `https://xxxx.supabase.co`; a malformed value is ignored so the audit form still works without DB writes)
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAGESPEED_API_KEY`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (GA4, e.g. `G-XXXXXXXXXX`)
- `SMS_PROVIDER` (`console` or `twilio`)
- `TWILIO_ACCOUNT_SID` (if Twilio)
- `TWILIO_AUTH_TOKEN` (if Twilio)
- `TWILIO_FROM_NUMBER` (if Twilio)

## 3) Database setup (Supabase SQL Editor)

Run files in this order:

1. `supabase/schema.sql`
2. `supabase/rls.sql`
3. `supabase/seed.sql`

## 4) Verify the pipeline

1. Submit the homepage RedScreen audit (or use `/intake` for the Formspree diagnostic wizard).
2. For `/api/register` audits, confirm rows exist in:
   - `leads`
   - `audits`
   - `audit_results`
   - `messages`
3. Follow-up is by email / contact — there is no public `/report/<id>` page.

## 5) Security and anti-spam included

- API rate limit: 8 submissions per minute per IP (`/api/register`)
- Honeypot field check
- Minimum fill-time check to reject bots
- RLS enabled on all tables

## 6) Before production deploy

- Rotate any secrets exposed in chat or screenshots.
- Set all env vars in Vercel project settings.
- Verify Google file on deployed domain:
  - `/google910114b2ba5a69fb.html`
- If using Twilio, set `SMS_PROVIDER=twilio`.
- If using GA4, verify Realtime shows:
  - `diagnostic_submit_started`
  - `diagnostic_submit_success`
  - `pricing_cta_click`
  - `case_studies_view`
