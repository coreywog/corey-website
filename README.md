# athenics.com

Corey Wogenstahl's personal site — resume, "who I am," and a private
finance dashboard (Plaid-synced bank accounts, spending categorization,
cash-flow trends).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma + Postgres (Neon)
- Plaid for live bank account syncing
- Recharts for the finance dashboard visuals
- Deployed on Vercel

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env` and fill in the required values (see comments
in that file) once a Postgres instance (e.g. Neon) is provisioned.
