import { and, asc, gte, lte, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { categories, projectLogs, projects, reflections, settings, timeLogs, todos } from "@/db/schema";
import { daysBetween, fmtHours, fmtMinute, weekdayName } from "./time";

export type Kind = "productive" | "neutral" | "rest" | "drain" | "uncategorized";
export const KINDS: Kind[] = ["productive", "neutral", "rest", "drain", "uncategorized"];

type KindMap = Record<Kind, number>;
const emptyKinds = (): KindMap => ({ productive: 0, neutral: 0, rest: 0, drain: 0, uncategorized: 0 });

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

async function summarize(db: DB, from: string, to: string) {
  const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
  const slotMinutes = cfg?.slotMinutes ?? 15;
  const dayStartHour = cfg?.dayStartHour ?? 6;
  const dayEndHour = cfg?.dayEndHour ?? 24;

  const [cats, logs, refl, allProjects, plogs, allTodos] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sort)),
    db.select().from(timeLogs).where(and(gte(timeLogs.day, from), lte(timeLogs.day, to))).orderBy(asc(timeLogs.day), asc(timeLogs.startMinute)),
    db.select().from(reflections).where(and(gte(reflections.day, from), lte(reflections.day, to))).orderBy(asc(reflections.day)),
    db
      .select({
        id: projects.id, title: projects.title, status: projects.status, type: projects.type, priority: projects.priority,
        tags: projects.tags, progress: projects.progress, targetDate: projects.targetDate, createdAt: projects.createdAt, doneAt: projects.doneAt,
      })
      .from(projects),
    db.select({ projectId: projectLogs.projectId, text: projectLogs.text, progress: projectLogs.progress, createdAt: projectLogs.createdAt }).from(projectLogs).orderBy(asc(projectLogs.createdAt)),
    db.select().from(todos),
  ]);

  const catById = new Map(cats.map((c) => [c.id, c]));
  const kindOf = (catId: number | null): Kind => (catId != null ? (catById.get(catId)?.kind ?? "uncategorized") : "uncategorized");
  const days = daysBetween(from, to);
  const trackablePerDay = (dayEndHour - dayStartHour) * 60;

  // ---- per category
  const catAgg = new Map<number | null, { minutes: number; focus: number[]; energy: number[]; slots: number }>();
  for (const l of logs) {
    const a = catAgg.get(l.categoryId) ?? { minutes: 0, focus: [], energy: [], slots: 0 };
    a.minutes += l.durationMinutes;
    a.slots += 1;
    if (l.focus != null) a.focus.push(l.focus);
    if (l.energy != null) a.energy.push(l.energy);
    catAgg.set(l.categoryId, a);
  }
  const loggedMinutes = logs.reduce((s, l) => s + l.durationMinutes, 0);
  const byCategory = [...catAgg.entries()]
    .map(([id, a]) => {
      const c = id != null ? catById.get(id) : undefined;
      return {
        id,
        name: c?.name ?? "Uncategorized",
        color: c?.color ?? "#9a948a",
        kind: kindOf(id),
        minutes: a.minutes,
        pct: loggedMinutes ? a.minutes / loggedMinutes : 0,
        slots: a.slots,
        avgFocus: round1(avg(a.focus)),
        avgEnergy: round1(avg(a.energy)),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const byKind = emptyKinds();
  for (const l of logs) byKind[kindOf(l.categoryId)] += l.durationMinutes;

  // ---- per day
  const reflByDay = new Map(refl.map((r) => [r.day, r]));
  const perDay = days.map((day) => {
    const dl = logs.filter((l) => l.day === day);
    const kinds = emptyKinds();
    const cats: Record<string, number> = {};
    for (const l of dl) {
      kinds[kindOf(l.categoryId)] += l.durationMinutes;
      const key = String(l.categoryId ?? "none");
      cats[key] = (cats[key] ?? 0) + l.durationMinutes;
    }
    const logged = dl.reduce((s, l) => s + l.durationMinutes, 0);
    return {
      day,
      weekday: weekdayName(day, "short"),
      loggedMinutes: logged,
      coverage: trackablePerDay ? logged / trackablePerDay : 0,
      kinds,
      categories: cats,
      avgFocus: round1(avg(dl.flatMap((l) => (l.focus != null ? [l.focus] : [])))),
      avgEnergy: round1(avg(dl.flatMap((l) => (l.energy != null ? [l.energy] : [])))),
      mood: reflByDay.get(day)?.mood ?? null,
    };
  });

  // ---- per hour of day (a 09:30–11:00 block contributes 30m to 09h and 60m to 10h)
  const pieces = logs.flatMap((l) => {
    const out: { hour: number; minutes: number; l: (typeof logs)[number] }[] = [];
    for (let m = l.startMinute; m < l.startMinute + l.durationMinutes; ) {
      const hour = Math.floor(m / 60);
      const next = Math.min((hour + 1) * 60, l.startMinute + l.durationMinutes);
      out.push({ hour, minutes: next - m, l });
      m = next;
    }
    return out;
  });
  const wavg = (ps: typeof pieces, f: (l: (typeof logs)[number]) => number | null) => {
    let sum = 0, w = 0;
    for (const p of ps) {
      const v = f(p.l);
      if (v != null) { sum += v * p.minutes; w += p.minutes; }
    }
    return w ? sum / w : null;
  };
  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const hp = pieces.filter((p) => p.hour === hour);
    const kinds = emptyKinds();
    const catMin = new Map<number | null, number>();
    for (const p of hp) {
      kinds[kindOf(p.l.categoryId)] += p.minutes;
      catMin.set(p.l.categoryId, (catMin.get(p.l.categoryId) ?? 0) + p.minutes);
    }
    const top = [...catMin.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      hour,
      label: fmtMinute(hour * 60),
      minutes: hp.reduce((s, p) => s + p.minutes, 0),
      kinds,
      avgFocus: round1(wavg(hp, (l) => l.focus)),
      avgEnergy: round1(wavg(hp, (l) => l.energy)),
      topCategory: top ? (top[0] != null ? catById.get(top[0])?.name ?? "?" : "Uncategorized") : null,
    };
  }).filter((h) => h.hour >= dayStartHour && h.hour < dayEndHour);

  // ---- weekday pattern
  const byWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((wd) => {
    const ds = perDay.filter((d) => d.weekday === wd);
    return {
      weekday: wd,
      days: ds.length,
      avgLogged: avg(ds.map((d) => d.loggedMinutes)) ?? 0,
      avgProductive: avg(ds.map((d) => d.kinds.productive)) ?? 0,
      avgDrain: avg(ds.map((d) => d.kinds.drain)) ?? 0,
    };
  });

  // ---- activities (free-text)
  const actAgg = new Map<string, { activity: string; minutes: number; count: number }>();
  for (const l of logs) {
    const key = l.activity.trim().toLowerCase();
    if (!key) continue;
    const a = actAgg.get(key) ?? { activity: l.activity.trim(), minutes: 0, count: 0 };
    a.minutes += l.durationMinutes;
    a.count += 1;
    actAgg.set(key, a);
  }
  const topActivities = [...actAgg.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 15);

  // ---- logging streaks
  let longest = 0, run = 0;
  for (const d of perDay) {
    run = d.loggedMinutes > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = perDay.length - 1; i >= 0 && perDay[i].loggedMinutes > 0; i--) current++;

  const loggedDays = perDay.filter((d) => d.loggedMinutes > 0);
  const bestDay = [...loggedDays].sort((a, b) => b.kinds.productive - a.kinds.productive)[0] ?? null;
  const worstDay = [...loggedDays].sort((a, b) => b.kinds.drain - a.kinds.drain)[0] ?? null;

  const inRange = (ts: Date | null) => {
    if (!ts) return false;
    const d = new Date(ts).toISOString().slice(0, 10);
    return d >= from && d <= to;
  };

  // ---- projects (+ their journal)
  const minutesByProject = new Map<number, number>();
  for (const l of logs) if (l.projectId != null) minutesByProject.set(l.projectId, (minutesByProject.get(l.projectId) ?? 0) + l.durationMinutes);
  const projectStats = allProjects.map((p) => {
    const pl = plogs.filter((l) => l.projectId === p.id);
    const before = pl.filter((l) => l.progress != null && new Date(l.createdAt).toISOString().slice(0, 10) < from).at(-1);
    const within = pl.filter((l) => inRange(l.createdAt));
    const withinP = within.filter((l) => l.progress != null);
    const startProgress = before?.progress ?? (inRange(p.createdAt) ? 0 : withinP[0]?.progress ?? p.progress);
    const endProgress = withinP.at(-1)?.progress ?? before?.progress ?? p.progress;
    const last = pl.at(-1);
    return {
      id: p.id,
      title: p.title,
      type: p.type,
      status: p.status,
      priority: p.priority,
      tags: p.tags,
      progress: p.progress,
      progressDelta: (endProgress ?? 0) - (startProgress ?? 0),
      minutesInRange: minutesByProject.get(p.id) ?? 0,
      logsInRange: within.length,
      entries: within.map((l) => ({ at: new Date(l.createdAt).toISOString().slice(0, 10), text: l.text, progress: l.progress })),
      lastLog: last ? new Date(last.createdAt).toISOString().slice(0, 10) : null,
      targetDate: p.targetDate,
      overdue: !!p.targetDate && p.targetDate < to && p.status !== "done" && p.status !== "dropped",
      createdInRange: inRange(p.createdAt),
      doneInRange: p.status === "done" && inRange(p.doneAt),
    };
  });
  const projectsByStatus: Record<string, number> = {};
  for (const p of allProjects) projectsByStatus[p.status] = (projectsByStatus[p.status] ?? 0) + 1;

  // ---- to-dos
  const todosCreated = allTodos.filter((t) => inRange(t.createdAt));
  const todosDone = allTodos.filter((t) => t.done && inRange(t.doneAt));
  const openTodos = allTodos.filter((t) => !t.done);
  const titleOf = new Map(allProjects.map((p) => [p.id, p.title]));
  const todoSummary = {
    created: todosCreated.length,
    completed: todosDone.length,
    completionRate: todosCreated.length ? todosCreated.filter((t) => t.done).length / todosCreated.length : null,
    avgDaysToComplete:
      avg(todosDone.map((t) => (new Date(t.doneAt!).getTime() - new Date(t.createdAt).getTime()) / 864e5)) != null
        ? round1(avg(todosDone.map((t) => (new Date(t.doneAt!).getTime() - new Date(t.createdAt).getTime()) / 864e5)))
        : null,
    open: openTodos.length,
    overdue: openTodos
      .filter((t) => t.dueDate && t.dueDate < to)
      .map((t) => ({ title: t.title, due: t.dueDate!, project: t.projectId != null ? titleOf.get(t.projectId) ?? null : null })),
    completedList: todosDone.map((t) => ({ title: t.title, project: t.projectId != null ? titleOf.get(t.projectId) ?? null : null })),
  };

  const summary = {
    range: { from, to, days: days.length, loggedDays: loggedDays.length },
    settings: { slotMinutes, dayStartHour, dayEndHour },
    coverage: {
      loggedMinutes,
      trackableMinutes: trackablePerDay * days.length,
      pct: trackablePerDay ? loggedMinutes / (trackablePerDay * days.length) : 0,
    },
    byKind,
    avgFocus: round1(avg(logs.flatMap((l) => (l.focus != null ? [l.focus] : [])))),
    avgEnergy: round1(avg(logs.flatMap((l) => (l.energy != null ? [l.energy] : [])))),
    avgMood: round1(avg(refl.flatMap((r) => (r.mood != null ? [r.mood] : [])))),
    byCategory,
    perDay,
    byHour,
    byWeekday,
    topActivities,
    streak: { current, longest },
    bestDay: bestDay && { day: bestDay.day, productiveMinutes: bestDay.kinds.productive },
    worstDay: worstDay && worstDay.kinds.drain > 0 ? { day: worstDay.day, drainMinutes: worstDay.kinds.drain } : null,
    projects: projectStats,
    projectTime: projectStats
      .filter((p) => p.minutesInRange > 0)
      .map((p) => ({ id: p.id, title: p.title, minutes: p.minutesInRange }))
      .sort((a, b) => b.minutes - a.minutes),
    projectsByStatus,
    todos: todoSummary,
    reflections: refl.map((r) => ({ day: r.day, mood: r.mood, wins: r.wins, blockers: r.blockers, tomorrow: r.tomorrow })),
  };

  return summary;
}

type Summary = Awaited<ReturnType<typeof summarize>>;

export async function analyze(db: DB, from: string, to: string) {
  const s = await summarize(db, from, to);
  return { ...s, observations: observe(s) };
}

export type Analysis = Summary & { observations: string[] };

/** Rule-based observations. Deliberately plain; deeper interpretation is done by asking Claude over the report. */
function observe(s: Summary): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const L = s.coverage.loggedMinutes;
  if (!L) return ["No time logged in this range yet. Log a few days first."];

  if (s.coverage.pct < 0.6)
    out.push(`Only ${pct(s.coverage.pct)} of waking slots were logged. Insights get sharper above ~80%. Try logging at the end of every slot.`);

  const peak = [...s.byHour].filter((h) => h.minutes > 0 && h.avgFocus != null).sort((a, b) => (b.avgFocus! - a.avgFocus!) || b.kinds.productive - a.kinds.productive).slice(0, 3);
  if (peak.length) out.push(`Highest focus around ${peak.map((h) => h.label).join(", ")}. Protect these hours for deep work.`);

  const drainHours = [...s.byHour].filter((h) => h.kinds.drain > 0).sort((a, b) => b.kinds.drain - a.kinds.drain).slice(0, 2);
  if (s.byKind.drain > 0)
    out.push(`${fmtHours(s.byKind.drain)} (${pct(s.byKind.drain / L)}) went to drain time${drainHours.length ? `, mostly around ${drainHours.map((h) => h.label).join(" & ")}` : ""}.`);

  out.push(`Productive share: ${pct(s.byKind.productive / L)} of logged time (${fmtHours(s.byKind.productive)} over ${s.range.days} days, ~${fmtHours(Math.round(s.byKind.productive / s.range.days))}/day).`);

  const wd = s.byWeekday.filter((w) => w.days > 0).sort((a, b) => b.avgProductive - a.avgProductive);
  if (wd.length >= 3) out.push(`Strongest weekday: ${wd[0].weekday}; weakest: ${wd.at(-1)!.weekday}.`);

  const active = s.projects.filter((p) => p.status === "active");
  const stalled = active.filter((p) => p.logsInRange === 0 && p.minutesInRange === 0);
  if (s.projectTime.length) {
    const total = s.projectTime.reduce((t, p) => t + p.minutes, 0);
    const top = s.projectTime[0];
    out.push(`${fmtHours(total)} tagged to projects; ${top.title} got the most (${fmtHours(top.minutes)}, ${pct(top.minutes / total)}).`);
  }
  if (stalled.length) out.push(`No time or log entries on in-progress: ${stalled.map((p) => p.title).join(", ")}. Pause them or schedule a slot.`);
  if (active.length > 3) out.push(`${active.length} projects in progress at once. Finishing beats starting, so consider pausing some.`);
  const overdue = s.projects.filter((p) => p.overdue);
  if (overdue.length) out.push(`Past target date: ${overdue.map((p) => p.title).join(", ")}.`);
  const newIdeas = s.projects.filter((p) => p.createdInRange).length;
  const finished = s.projects.filter((p) => p.doneInRange).length;
  if (newIdeas > 3 && finished === 0) out.push(`${newIdeas} new projects captured, none finished. Pick one to move to "In progress".`);
  if (s.todos.created >= 5 && s.todos.completionRate != null && s.todos.completionRate < 0.5)
    out.push(`Only ${pct(s.todos.completionRate)} of to-dos created in this range got done. Add fewer, or give them dates.`);
  if (s.todos.overdue.length) out.push(`${s.todos.overdue.length} overdue to-do${s.todos.overdue.length === 1 ? "" : "s"}.`);

  const uncategorized = s.byKind.uncategorized;
  if (uncategorized / L > 0.15) out.push(`${pct(uncategorized / L)} of logs have no category, which weakens the analysis.`);
  return out;
}

/** Markdown report for the CLI / for Claude to read. */
export function toMarkdown(a: Analysis): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const L: string[] = [];
  L.push(`# Upward report: ${a.range.from} → ${a.range.to}`, "");
  L.push(`Grid: ${a.settings.slotMinutes} min · Day window: ${fmtMinute(a.settings.dayStartHour * 60)}–${fmtMinute(a.settings.dayEndHour * 60)}`, "");
  L.push("## Overview", "");
  L.push(`- Days: ${a.range.days} (${a.range.loggedDays} with logs) · logging streak now ${a.streak.current}, longest ${a.streak.longest}`);
  L.push(`- Logged: ${fmtHours(a.coverage.loggedMinutes)} of ${fmtHours(a.coverage.trackableMinutes)} trackable (${pct(a.coverage.pct)})`);
  L.push(`- By kind: ${KINDS.filter((k) => a.byKind[k]).map((k) => `${k} ${fmtHours(a.byKind[k])}`).join(" · ")}`);
  L.push(`- Avg focus ${a.avgFocus ?? "–"}/5 · energy ${a.avgEnergy ?? "–"}/5 · mood ${a.avgMood ?? "–"}/5`);
  if (a.bestDay) L.push(`- Most productive day: ${a.bestDay.day} (${fmtHours(a.bestDay.productiveMinutes)})`);
  if (a.worstDay) L.push(`- Most drain: ${a.worstDay.day} (${fmtHours(a.worstDay.drainMinutes)})`);
  L.push("", "## Categories", "", "| Category | Kind | Time | Share | Focus | Energy |", "|---|---|---|---|---|---|");
  for (const c of a.byCategory) L.push(`| ${c.name} | ${c.kind} | ${fmtHours(c.minutes)} | ${pct(c.pct)} | ${c.avgFocus ?? "–"} | ${c.avgEnergy ?? "–"} |`);
  L.push("", "## Per day", "", "| Day | Logged | Productive | Drain | Focus | Mood |", "|---|---|---|---|---|---|");
  for (const d of a.perDay) L.push(`| ${d.day} ${d.weekday} | ${fmtHours(d.loggedMinutes)} | ${fmtHours(d.kinds.productive)} | ${fmtHours(d.kinds.drain)} | ${d.avgFocus ?? "–"} | ${d.mood ?? "–"} |`);
  L.push("", "## Hour of day", "", "| Hour | Logged | Productive | Drain | Focus | Energy | Usually |", "|---|---|---|---|---|---|---|");
  for (const h of a.byHour) L.push(`| ${h.label} | ${fmtHours(h.minutes)} | ${fmtHours(h.kinds.productive)} | ${fmtHours(h.kinds.drain)} | ${h.avgFocus ?? "–"} | ${h.avgEnergy ?? "–"} | ${h.topCategory ?? "–"} |`);
  L.push("", "## Weekday averages", "", "| Weekday | Days | Avg logged | Avg productive | Avg drain |", "|---|---|---|---|---|");
  for (const w of a.byWeekday) if (w.days) L.push(`| ${w.weekday} | ${w.days} | ${fmtHours(Math.round(w.avgLogged))} | ${fmtHours(Math.round(w.avgProductive))} | ${fmtHours(Math.round(w.avgDrain))} |`);
  if (a.topActivities.length) {
    L.push("", "## Top activities", "");
    for (const t of a.topActivities) L.push(`- ${t.activity}: ${fmtHours(t.minutes)} (${t.count}×)`);
  }
  L.push("", "## Projects", "");
  L.push(`Status: ${Object.entries(a.projectsByStatus).map(([k, v]) => `${k} ${v}`).join(", ") || "–"}`, "");
  if (a.projectTime.length) {
    L.push("| Project | Time logged |", "|---|---|");
    for (const p of a.projectTime) L.push(`| ${p.title} | ${fmtHours(p.minutes)} |`);
    L.push("");
  }
  const relevant = a.projects.filter((p) => p.status === "active" || p.minutesInRange || p.logsInRange || p.createdInRange || p.doneInRange || p.overdue);
  if (!relevant.length) L.push("_no project activity in range_");
  for (const p of relevant) {
    L.push(
      `### ${p.title} (${p.type}, ${p.status}, ${p.priority}) ${p.progress}%` +
        ` · Δ ${p.progressDelta >= 0 ? "+" : ""}${p.progressDelta} · ${fmtHours(p.minutesInRange)} logged · ${p.logsInRange} log entries` +
        `${p.targetDate ? ` · target ${p.targetDate}${p.overdue ? " (OVERDUE)" : ""}` : ""}` +
        `${p.createdInRange ? " · NEW" : ""}${p.doneInRange ? " · FINISHED" : ""}`,
    );
    for (const e of p.entries) {
      L.push(`- ${e.at}${e.progress != null ? ` (→${e.progress}%)` : ""}:`);
      L.push(e.text.trim().split("\n").map((line) => `  ${line}`).join("\n"));
    }
    L.push("");
  }
  L.push("## To-dos", "");
  L.push(`Created ${a.todos.created} · completed ${a.todos.completed}${a.todos.completionRate != null ? ` · ${pct(a.todos.completionRate)} of new ones done` : ""}${a.todos.avgDaysToComplete != null ? ` · avg ${a.todos.avgDaysToComplete} days to complete` : ""} · ${a.todos.open} open`);
  if (a.todos.overdue.length) {
    L.push("", "Overdue:");
    for (const t of a.todos.overdue) L.push(`- ${t.title} (due ${t.due}${t.project ? `, ${t.project}` : ""})`);
  }
  if (a.todos.completedList.length) {
    L.push("", "Completed:");
    for (const t of a.todos.completedList) L.push(`- ${t.title}${t.project ? ` (${t.project})` : ""}`);
  }
  if (a.reflections.length) {
    L.push("", "## Reflections", "");
    for (const r of a.reflections) {
      L.push(`### ${r.day}${r.mood ? ` · mood ${r.mood}/5` : ""}`);
      if (r.wins) L.push(`- Wins: ${r.wins}`);
      if (r.blockers) L.push(`- Blockers: ${r.blockers}`);
      if (r.tomorrow) L.push(`- Tomorrow: ${r.tomorrow}`);
    }
  }
  L.push("", "## Automatic observations", "");
  for (const o of a.observations) L.push(`- ${o}`);
  return L.join("\n") + "\n";
}
