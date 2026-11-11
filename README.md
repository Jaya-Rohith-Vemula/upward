# Upward

A private ledger of your hours, ideas, and progress.

- **Day**: calendar on a 15-min grid. Drag empty time to log it, drag a block to move it, drag its bottom edge to resize. Each entry has an activity, category, focus, and energy. End-of-day reflection.
- **Projects**: a Kanban board (Ideas → Up next → In progress → Paused → Done) with drag-and-drop. Click a card for its page: Status/Type/Priority selects, a Tags multi-select, a target date, and progress. It has a dated **Log**, a **Notes** page, and linked **To-dos**. Logs and notes use a Notion-style editor (type `/` for headings, bullet/numbered/check/toggle lists, quote, code, table, divider).
- **To-dos**: quick add with Today/Tomorrow/date chips, `!high` priority, and an optional project link. Grouped by Overdue, Today, Upcoming, and No date.
- **Insights**: any date range, with day-by-day and hour-of-day charts, category breakdown, and observations. Copy the range as Markdown for Claude.

## Local setup
```bash
cp .env.example .env          # paste your Neon URL, or use DATABASE_URL="pglite:./.pglite" offline
npm install
npm run db:push && npm run db:seed   # seed also migrates old ideas/progress into projects (once)
npm run dev                   # http://localhost:3000
```
`APP_PASSWORD` is optional locally. Without it, the app is open.

## Deploy (Vercel + Neon, upward.jayass.app)
1. Push this folder to a GitHub repo and import it in Vercel (or run `npx vercel` from here).
2. Vercel project → **Storage → Create → Neon** (Marketplace). This sets `DATABASE_URL` for you.
   Or create a project at neon.tech and add its **pooled** connection string as `DATABASE_URL`.
3. Add env var `APP_PASSWORD` (a long passphrase). Production refuses to serve without it.
4. Create the tables once from your machine: put the same `DATABASE_URL` in `.env`, then `npm run db:push && npm run db:seed`.
5. Vercel project → **Settings → Domains** → add `upward.jayass.app`. Since `jayass.app` is on Vercel Domains, DNS is configured automatically.

## Analysis
```bash
npm run analyze -- --from 2026-11-01 --to 2026-11-30   # writes reports/2026-11-01_2026-11-30.md
npm run analyze -- --days 7
```
Then ask Claude Code: *"analyze from 2026-11-01 to 2026-11-30"*. `CLAUDE.md` tells it how.

## Why Postgres (Neon) and not NoSQL
The data is small and relational (logs → categories, updates → tracks), and the main workload is date-range aggregation by hour, weekday, and category. SQL handles that natively. Neon's free tier, scale-to-zero, and one-click Vercel integration make it the simplest fit.
