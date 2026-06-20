# Run COAI LEADS (coaihq.online)

Live site: **https://coaihq.online** (Vercel project `coai-leads`, auto-deploys on `git push`).

## Run it locally
```bash
cd "C:\Users\blunt\Desktop\programs\COAI LEADS"
npm install
vercel dev          # opens http://localhost:3000
```
`.env.local` already holds the real keys (pulled from Vercel). Don't commit it — it's gitignored.

## Required env vars (already set on Vercel ✓)
| Var | Purpose | Status |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Maps search + place details | ✅ set |
| `APP_PASSWORD` | Auth header for all API calls | ✅ set |

Search, scraping, and lead scoring work with just these two.

## To enable the AI outreach button (currently the only missing piece)
The code defaults to free Google Gemini but no key is set, so outreach generation fails.

1. Get a free key: https://aistudio.google.com/apikey
2. Add it to Vercel:
   ```bash
   vercel env add GEMINI_API_KEY production
   ```
   (paste key when prompted), then redeploy: `vercel --prod`
3. For local runs, also add to `.env.local`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

Alternatives (set `AI_PROVIDER` accordingly): `PERPLEXITY_API_KEY` or `ANTHROPIC_API_KEY`.

## Optional (free tier works without these)
`PROXY_*` (residential proxy, Level-2 scrape escalation) and `CAPSOLVER_API_KEY` (CAPTCHA, Level-4). See `.env.example`.

## Deploy a change
```bash
git add -A && git commit -m "your message" && git push   # auto-deploys to coaihq.online
```
