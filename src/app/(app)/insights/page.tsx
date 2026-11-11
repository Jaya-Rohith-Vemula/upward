import Link from "next/link";
import { getDb } from "@/db";
import { analyze, toMarkdown } from "@/lib/analysis";
import { getToday } from "@/lib/data";
import { addDays, fmtHours, isValidDay, prettyDay } from "@/lib/time";
import { CopyReport, KindLegend, StackedColumns } from "@/components/insights-charts";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "Insights" };

const PRESETS = [7, 14, 30, 90];

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { today } = await getToday();
  const to = isValidDay(sp.to) ? sp.to : today;
  const from = isValidDay(sp.from) && sp.from <= to ? sp.from : addDays(to, -6);
  const a = await analyze(await getDb(), from, to);
  const md = toMarkdown(a);
  const L = a.coverage.loggedMinutes;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rangeDays = a.range.days;

  return (
    <div className="max-w-5xl">
      <header className="rise flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">
            {prettyDay(from)} – {prettyDay(to)} · {rangeDays} days
          </p>
          <h1 className="display mt-1 text-5xl leading-none">Insights</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {PRESETS.map((n) => (
            <Link
              key={n}
              href={`/insights?from=${addDays(today, -(n - 1))}&to=${today}`}
              className={`grid min-h-9 place-items-center rounded-full px-3 text-xs ${to === today && rangeDays === n ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"}`}
            >
              {n}d
            </Link>
          ))}
          <RangePicker from={from} to={to} today={today} />
        </div>
      </header>

      {L === 0 ? (
        <p className="rise rise-1 mt-12 max-w-md text-ink-2">
          Nothing logged between these dates. Log a few slots on the <Link href="/" className="text-accent underline underline-offset-4">Day</Link> page and patterns will show up here.
        </p>
      ) : (
        <>
          {/* Headline as prose, not a tile wall */}
          <p className="rise rise-1 display mt-8 max-w-3xl text-xl leading-snug md:mt-10 md:text-[1.75rem]">
            You logged <strong className="font-semibold">{fmtHours(L)}</strong> ({pct(a.coverage.pct)} of waking slots).{" "}
            <span style={{ color: "var(--k-productive)" }}>■</span> {pct(a.byKind.productive / L)} went to productive work
            {a.byKind.drain > 0 && (
              <>
                , <span style={{ color: "var(--k-drain)" }}>■</span> {pct(a.byKind.drain / L)} drained away
              </>
            )}
            .
          </p>
          <dl className="rise rise-1 mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              ["Avg focus", a.avgFocus != null ? `${a.avgFocus}/5` : "–"],
              ["Avg energy", a.avgEnergy != null ? `${a.avgEnergy}/5` : "–"],
              ["Avg mood", a.avgMood != null ? `${a.avgMood}/5` : "–"],
              ["Logging streak", `${a.streak.current}d (best ${a.streak.longest}d)`],
              ["Best day", a.bestDay ? `${a.bestDay.day.slice(5)} · ${fmtHours(a.bestDay.productiveMinutes)}` : "–"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-0.5 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <section className="rise rise-2 mt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
              <h2 className="display text-2xl">Observations</h2>
            </div>
            <ul className="mt-4 max-w-3xl space-y-2.5">
              {a.observations.map((o, i) => (
                <li key={i} className="flex gap-3 text-[0.9375rem] leading-relaxed">
                  <span className="display text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {o}
                </li>
              ))}
            </ul>
          </section>

          <section className="rise rise-2 mt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
              <h2 className="display text-2xl">Day by day</h2>
              <KindLegend />
            </div>
            <StackedColumns
              unit="day"
              columns={a.perDay.map((d) => ({
                key: d.day,
                label: rangeDays <= 14 ? d.weekday.slice(0, 2) : d.day.slice(8),
                title: `${d.weekday} ${d.day}`,
                kinds: d.kinds,
                extra: [
                  ["Focus", d.avgFocus ?? "–"],
                  ["Mood", d.mood ?? "–"],
                ],
                href: `/?d=${d.day}`,
              }))}
            />
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted hover:text-ink">Show as table</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-xs text-muted">
                    <tr>{["Day", "Logged", "Productive", "Neutral", "Rest", "Drain", "Focus", "Mood"].map((h) => <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {a.perDay.map((d) => (
                      <tr key={d.day} className="border-t border-rule">
                        <td className="py-1.5 pr-4">{d.day} {d.weekday}</td>
                        <td className="pr-4">{fmtHours(d.loggedMinutes)}</td>
                        <td className="pr-4">{fmtHours(d.kinds.productive)}</td>
                        <td className="pr-4">{fmtHours(d.kinds.neutral)}</td>
                        <td className="pr-4">{fmtHours(d.kinds.rest)}</td>
                        <td className="pr-4">{fmtHours(d.kinds.drain)}</td>
                        <td className="pr-4">{d.avgFocus ?? "–"}</td>
                        <td>{d.mood ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="rise rise-3 mt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
              <h2 className="display text-2xl">Hour of day</h2>
              <p className="text-xs text-muted">Total time per hour across the range · avg focus beneath</p>
            </div>
            <StackedColumns
              unit="hour"
              columns={a.byHour.map((h) => ({
                key: String(h.hour),
                label: `${h.hour % 12 || 12}${h.hour < 12 ? "a" : "p"}`,
                title: `${h.label}${h.topCategory ? ` · usually ${h.topCategory}` : ""}`,
                kinds: h.kinds,
                foot: h.avgFocus != null ? String(h.avgFocus) : "",
                extra: [
                  ["Focus", h.avgFocus ?? "–"],
                  ["Energy", h.avgEnergy ?? "–"],
                ],
              }))}
            />
          </section>

          <div className="mt-14 grid gap-x-14 gap-y-14 lg:grid-cols-2">
            <section>
              <div className="border-b border-ink pb-2">
                <h2 className="display text-2xl">Where it went</h2>
              </div>
              <ul className="mt-2">
                {a.byCategory.map((c) => (
                  <li key={String(c.id)} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-rule py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: c.color }} />
                      {c.name}
                      <span className="text-xs text-muted">{c.kind}</span>
                    </span>
                    <span className="tabular-nums">
                      {fmtHours(c.minutes)} <span className="text-muted">· {pct(c.pct)}</span>
                    </span>
                    <span className="col-span-2 mt-1.5 h-[3px] rounded-full bg-paper-2">
                      <span className="block h-full rounded-full" style={{ width: `${c.pct * 100}%`, background: c.color }} />
                    </span>
                    {c.avgFocus != null && <span className="col-span-2 mt-1 text-xs text-muted">focus {c.avgFocus} · energy {c.avgEnergy ?? "–"}</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="border-b border-ink pb-2">
                <h2 className="display text-2xl">Projects &amp; to-dos</h2>
              </div>
              <ul className="mt-2">
                {a.projects
                  .filter((t) => t.status === "active" || t.logsInRange > 0 || t.doneInRange || t.overdue)
                  .map((t) => (
                    <li key={t.id} className="border-b border-rule py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-4">
                        <Link href={`/projects?p=${t.id}`} className="hover:underline">
                          {t.title} <span className="text-xs text-muted">{t.type} · {t.status}</span>
                          {t.overdue && <span className="ml-2 text-xs font-semibold text-warn">overdue</span>}
                          {t.doneInRange && <span className="ml-2 text-xs font-semibold text-accent">finished</span>}
                        </Link>
                        <span className="shrink-0 tabular-nums">
                          {t.progress}%{" "}
                          <span className={t.progressDelta > 0 ? "text-accent" : "text-muted"}>
                            {t.progressDelta > 0 ? `+${t.progressDelta}` : t.progressDelta === 0 ? "±0" : t.progressDelta}
                          </span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{t.logsInRange} log entr{t.logsInRange === 1 ? "y" : "ies"} in range</p>
                    </li>
                  ))}
              </ul>
              <p className="mt-4 text-sm text-ink-2">
                {a.projects.filter((p) => p.createdInRange).length} new project(s). To-dos: {a.todos.completed} completed, {a.todos.created} created
                {a.todos.overdue.length > 0 && <span className="text-warn">, {a.todos.overdue.length} overdue</span>}, {a.todos.open} open.
              </p>
            </section>
          </div>

          <section className="mt-16 rounded-lg bg-paper-2 px-5 py-5 md:px-7">
            <h2 className="display text-xl">Go deeper with Claude</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              Copy this range as a Markdown report and paste it to Claude, or in this project run{" "}
              <code className="rounded bg-paper px-1.5 py-0.5 text-xs">npm run analyze -- --from {from} --to {to}</code> and ask Claude Code to read it.
            </p>
            <CopyReport markdown={md} />
          </section>
        </>
      )}
    </div>
  );
}
