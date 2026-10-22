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

Siasa runs on the M-Taji Tracker Supabase backend: accounts are Supabase Auth
users (see `docs/tracker-backend.md`). Without the Supabase keys, or with
`MTAJI_STORE=memory`, it runs on in-memory sample data with sign-in turned off.

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
- `/polls` — Community polls
- `/signup` — Account creation

## Design system

Tokens live in `src/app/globals.css` and `tailwind.config.ts` (8px spacing, colour, radius, typography, shadows, transitions).

## Note

Sample leaders and projects are fictional demos. AI visualisations are always labelled as simulations / proposed vision.
