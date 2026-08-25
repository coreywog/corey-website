# athenics.com

Corey Wogenstahl's personal site — resume, "who I am," and a gym progress
dashboard with charts of lifts, volume, and PRs over time.

See [`.claude/plans`](.claude/) or ask Claude for the full build plan, which
covers phases 0–4: scaffold & deploy, home/resume content, the gym data
pipeline (Postgres + a private admin entry form), visualizations, and a
stretch goal of a C++/WebAssembly module for strength-progression math.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma + Postgres (Neon) for workout data
- Recharts + custom SVG/D3 for the gym dashboard visuals
- Deployed on Vercel

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env` and fill in `DATABASE_URL` once a Postgres
instance (e.g. Neon) is provisioned — needed starting in Phase 2 (gym data).
