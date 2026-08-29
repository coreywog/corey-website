<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cross-device session continuity

This repo and its database are shared between a MacBook and a Windows
machine, each running its own isolated Claude Code session — neither can
see what the other did until it actually pulls. That gap has already
caused real, wasted, parallel work once (dashboard tabs and a whole widget
editor rebuilt twice, independently, from two different starting points,
in the same afternoon). This section exists so that doesn't happen again.

**At the start of a session:**

1. `git fetch origin`, then `git log --oneline main..origin/main`. If
   origin is ahead, pull it before writing any code — don't build on a
   stale checkout. If there's also a real live database involved (there
   is, here — Neon Postgres, shared across both machines), a migration run
   from the other device may already be applied there even if your local
   migration files don't have it yet; `npx prisma migrate status` catches
   that mismatch before it turns into a second, conflicting migration.
2. Read the most recent file(s) in `docs/sessions/` (sort by the date in
   the filename) for what the last session — on either device — actually
   did, what's mid-flight, and what's next.

**At the end of a session** that made real progress (a schema change, a
new feature, anything non-trivial — not every one-line fix needs this),
write `docs/sessions/athenics-session-{YYYY-MM-DD}-{device}.md` (device =
your own platform, e.g. "windows" or "macbook") using this template:

```
# Athenics Session — {Date} | {Device}

## Completed Today
- [Feature/fix] → ✅ done / 🔄 in-progress / 🚫 blocked

## Code Changes
- Files modified: [list]
- New files created: [list]
- Git commit(s): [reference]

## Uncommitted Work
- [WIP description, and how to resume it]

## What's Next
- [Priority 1]
- [Priority 2]
- [Blockers/notes]
```

Then commit and push it **with** the actual code changes — a summary that
only exists locally is exactly the problem this is meant to solve.
