# ATO Triage

A tax-return preparation tool that takes plain text, file uploads, or CSV exports (crypto
exchanges, bank statements), triages every ATO income/deduction/offset category without assuming
what you do or don't own, and produces a label-mapped pre-fill using **live** ATO guidance fetched
fresh each session — not a static dataset that goes stale.

This is a preparation aid, not a lodgement service and not tax advice. It flags categories
(capital gains, rental property, foreign income, business income) where a registered tax agent
should review before you lodge.

Each filing is a named project (e.g. "2023-24 sole trader return", "FY22 rental amendment") so you
can run multiple filings — including previous financial years you're catching up on — side by side
without them colliding.

## What's inside

```
lib/
  types.ts                 Domain types — records, categories, sessions, CGT lots
  taxonomy.ts               Full ATO category tree (Q1-24, D1-15, T1-9), mapped to real labels
  triage-engine.ts          Zero-assumption triage state machine
  text-extractor.ts         Free-text → structured record extraction (regex fallback)
  classifier.ts             Chat message → ATO category + extracted fields via Anthropic
  csv-normalizer.ts         Exchange/bank CSV format detection + normalization
  cgt-engine.ts             Crypto cost-base ledgers, FIFO disposal matching, discount test
  guidance-fetcher.ts       Live Claude API + web search call for current ATO guidance
  deduction-maximizer.ts    Flags likely-unclaimed deductions (never auto-adds them)
  prefill-generator.ts      Final label-mapped output + agent-review flags
  supabase/                 Browser + server Supabase clients

app/
  login/                    Magic-link auth
  dashboard/                New-filing form (name + FY + occupation) + list of your filings
  session/[id]/             Main triage → chat/upload → records → guidance → pre-fill flow
  api/                      Route handlers: sessions, records, upload, guidance, prefill

supabase/schema.sql          Full Postgres schema with row-level security
```

## 1. Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (only needed if you later add server-only admin actions) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

## 2. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once created, open the SQL editor and paste the contents of `supabase/schema.sql`, then run it.
3. In **Authentication → Providers**, ensure Email (magic link) is enabled — it is by default.
4. In **Authentication → URL Configuration**, add your local and production URLs to the redirect
   allow-list, e.g.:
   - `http://localhost:3000/auth/callback`
   - `https://<your-vercel-domain>/auth/callback`

## 3. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`, sent a magic link, and land on
`/dashboard` after clicking it.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial ATO triage app"
git branch -M main
git remote add origin https://github.com/<your-username>/ato-triage.git
git push -u origin main
```

## 5. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo you just pushed.
2. Framework preset: Next.js (auto-detected).
3. Add the same four environment variables from `.env.local` under **Settings → Environment
   Variables** (for Production, Preview, and Development).
4. Deploy. Once live, go back to Supabase **Authentication → URL Configuration** and add your real
   Vercel domain's `/auth/callback` URL to the redirect allow-list — magic links won't work until
   you do this.

## How the "live guidance" piece works

Every time you click **Fetch current ATO guidance** in a session, the app calls the Anthropic API
(`lib/guidance-fetcher.ts`) with web search enabled, scoped to exactly the categories your triage
answers activated for that financial year. The result is stored against that session only —
nothing is cached globally or reused across financial years, because thresholds and rulings change
every year and sometimes mid-year (see the README note in `lib/guidance-fetcher.ts` for why this
matters).

## Extending it

- **Exchange APIs (read-only)**: add a new module under `lib/` following the pattern in
  `csv-normalizer.ts` — each exchange gets a signature/mapper, then a scheduled or on-demand pull
  populates `tax_records` the same way CSV upload does now.
- **New CSV formats**: add a new entry to `FORMAT_SIGNATURES` in `lib/csv-normalizer.ts`.
- **New ATO categories or a new financial year's label changes**: update `lib/taxonomy.ts` — this
  is the single source of truth the triage engine, classifier, and pre-fill generator all read
  from.

## How chat categorisation works

The "Chat" panel in a filing (`app/session/[id]/page.tsx`) sends whatever you type to
`POST /api/records`, which calls `lib/classifier.ts`. That module gives Claude the full ATO
category list plus the filing's financial year and asks it to pick a single category code,
extract the amount/date/description, and flag anything missing (e.g. no amount) with a
clarification question instead of guessing. The result is stored as a `candidate` record — still
subject to the same Confirm/Exclude review as uploaded records — and echoed back in the chat
immediately so you see what it was filed under. If `ANTHROPIC_API_KEY` isn't set, it falls back to
the plain regex extractor with no category assigned, so you can still categorise manually.

## Known limitations (v0.1)

- OCR for photographed receipts isn't wired up yet — PDF text extraction works, but image-only
  receipts need a vision step added to `app/api/upload/route.ts`.
- Exchange API pulls (CoinSpot/Binance/etc. read-only keys) are designed for but not yet
  implemented — CSV upload is the current path.
