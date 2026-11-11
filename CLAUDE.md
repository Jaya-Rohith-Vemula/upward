# Upward

Personal life ledger: calendar-style time logs (15-min grid), projects (build/learn Kanban, each with a dated log + notes in BlockNote), to-dos, daily reflections. Next.js 15 App Router + Drizzle + Neon Postgres. Deployed on Vercel at https://upward.jayass.app, password-gated by `APP_PASSWORD`.

## Layout
- `src/db/schema.ts` – tables: settings, categories (kind = productive|neutral|rest|drain), time_logs, reflections, projects, project_logs, todos
- `src/db/legacy.ts` – v1 ideas/tracks tables, kept only so `db:seed` can migrate them
- `src/components/rich-editor.tsx` – BlockNote wrapper (text-only blocks); JSON stored in jsonb + markdown copy in a text column for analysis
- `src/app/actions.ts` – all mutations (server actions)
- `src/lib/analysis.ts` – range analysis shared by `/insights` and `scripts/analyze.ts`
- `src/middleware.ts` + `src/lib/auth.ts` – password gate

## Commands
- `npm run dev` · `npm run build`
- `npm run db:push` – apply schema to DATABASE_URL · `npm run db:seed` – default categories
- `npm run analyze -- --from YYYY-MM-DD --to YYYY-MM-DD` (or `--days N`) → `reports/<from>_<to>.md`

## When asked to "analyze from X to Y"
1. Run `npm run analyze -- --from X --to Y` (needs `.env` with the Neon DATABASE_URL).
2. Read the generated report. Give insights grounded in the numbers: where time went, peak/low focus hours, drain patterns and their triggers (check notes/reflections), weekday patterns, project momentum (log entries, progress deltas, stalled/overdue, too many in progress), what the project logs say about blockers and decisions, and to-do follow-through.
3. End with 3–5 concrete, schedulable changes for the next week (e.g. "block 09:00–11:00 for deep work; it's your highest-focus window at 3.8/5").
4. Compare against a previous report in `reports/` if one exists.
