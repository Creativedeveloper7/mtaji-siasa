# M-Taji Siasa

Production-quality civic-tech prototype for leader, project and citizen visibility — with GIS evidence and Faida (WhatsApp) engagement.

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- MapLibre GL (GIS)
- Framer Motion utilities via CSS animations

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Tracker Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Siasa runs on the M-Taji Tracker Supabase backend: accounts, leaders,
projects, opportunities, applications, media, polls, products, photos, the
wallet and Adly ads are the Tracker's own records (see
`docs/tracker-backend.md`). Without the Supabase keys, or with
`MTAJI_STORE=memory`, it runs on in-memory sample data with sign-in turned off.

Environment (`.env.local`):

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Tracker backend (`https://jdddchjbglilkfrlenci.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tracker backend: the publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Admin pages (user directory, admin edits of other people's records, all applications, Adly interest leads) |
| `MTAJI_STORE=memory` | Force the in-memory sample data |
| `ADS_REQUIRE_APPROVAL` | `true` makes an admin approve each ad before it publishes (default `false`: ads are approved automatically) |
| `ADS_DRY_RUN` | `true` makes the Tracker ad edge functions audit only: nothing is created or charged |
| `PUBLIC_SITE_URL` | Public https address ads link to |
| `AD_REACH_PER_KES`, `AD_MIN_BUDGET_KES`, `AD_MAX_BUDGET_KES` | Ad pricing shown in the composer (`AD_KES_PER_USD` for the memory demo) |

Ad network keys (Google Ads, X, Meta, TikTok) and Paystack keys are Supabase
function secrets in the Tracker project. They are never set in Siasa.

After pulling this change run `npm install` once: `sharp` was removed from
`package.json` and `package-lock.json` still lists it.

```bash
npm test          # unit tests (Vitest)
npx tsc --noEmit  # type check
```

## Routes

- `/` — Landing
- `/leaders` — Leader discovery
- `/leaders/:slug` — Leader profile (+ vision, projects, opportunities, media, polls, merchandise)
- `/projects` — Project discovery
- `/projects/:slug` — Project detail (About, GIS, Opportunities, Media, Milestones)
- `/opportunities` — Opportunity discovery
- `/media` — Editorial media
- `/polls` — Community polls (signed-in citizens vote once per poll)
- `/signup` — Account creation

## Design system

Tokens live in `src/app/globals.css` and `tailwind.config.ts` (8px spacing, colour, radius, typography, shadows, transitions).

## Note

Sample leaders and projects are fictional demos. AI visualisations are always labelled as simulations / proposed vision.
