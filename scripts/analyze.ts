/**
 * Analyze a date range and write a Markdown report.
 *   npm run analyze -- --from 2026-11-01 --to 2026-11-10
 *   npm run analyze -- --days 7          # last 7 days incl. today (default)
 *   npm run analyze -- --from 2026-11-01 --json
 * Output: reports/<from>_<to>.md (and printed to stdout).
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { settings } from "../src/db/schema";
import { analyze, toMarkdown } from "../src/lib/analysis";
import { addDays, isValidDay, todayIn } from "../src/lib/time";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const db = await createDb();
  const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
  const today = todayIn(cfg?.timezone ?? "UTC");
  const to = arg("to") ?? today;
  const from = arg("from") ?? addDays(to, -(Number(arg("days") ?? 7) - 1));
  if (!isValidDay(from) || !isValidDay(to) || from > to) throw new Error(`Bad range: ${from} → ${to} (use YYYY-MM-DD)`);

  const result = await analyze(db, from, to);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const md = toMarkdown(result);
    mkdirSync("reports", { recursive: true });
    const file = `reports/${from}_${to}.md`;
    writeFileSync(file, md);
    console.log(md);
    console.error(`\n→ saved ${file}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
