import "server-only";
import { asc, desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Settings } from "@/db/schema";
import { todayIn } from "./time";

const DEFAULT_SETTINGS: Settings = { id: 1, slotMinutes: 15, dayStartHour: 6, dayEndHour: 24, timezone: "UTC" };

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  return row ?? DEFAULT_SETTINGS;
}

export async function getToday() {
  const s = await getSettings();
  return { settings: s, today: todayIn(s.timezone) };
}

export async function getCategories(includeArchived = false) {
  const db = await getDb();
  const rows = await db.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.id));
  return includeArchived ? rows : rows.filter((c) => !c.archived);
}

export async function getDay(day: string) {
  const db = await getDb();
  const [logs, [reflection]] = await Promise.all([
    db.select().from(schema.timeLogs).where(eq(schema.timeLogs.day, day)).orderBy(asc(schema.timeLogs.startMinute)),
    db.select().from(schema.reflections).where(eq(schema.reflections.day, day)),
  ]);
  return { logs, reflection: reflection ?? null };
}

export async function getLoggedMinutesByDay(from: string, to: string) {
  const db = await getDb();
  const rows = await db
    .select({ day: schema.timeLogs.day, minutes: schema.timeLogs.durationMinutes })
    .from(schema.timeLogs)
    .where(and(gte(schema.timeLogs.day, from), lte(schema.timeLogs.day, to)));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day, (m.get(r.day) ?? 0) + r.minutes);
  return m;
}

export type ProjectCard = Awaited<ReturnType<typeof getProjects>>[number];

/** Board cards: projects without their (potentially large) notes, plus log/todo counts. */
export async function getProjects() {
  const db = await getDb();
  const p = schema.projects;
  const [rows, logStats, todoStats] = await Promise.all([
    db
      .select({
        id: p.id, title: p.title, status: p.status, type: p.type, priority: p.priority, tags: p.tags,
        progress: p.progress, targetDate: p.targetDate, sort: p.sort, createdAt: p.createdAt, updatedAt: p.updatedAt,
      })
      .from(p)
      .orderBy(asc(p.sort), desc(p.createdAt)),
    db
      .select({
        projectId: schema.projectLogs.projectId,
        count: sql<number>`count(*)::int`,
        last: sql<string>`max(${schema.projectLogs.createdAt})`,
      })
      .from(schema.projectLogs)
      .groupBy(schema.projectLogs.projectId),
    db
      .select({ projectId: schema.todos.projectId, open: sql<number>`count(*) filter (where not ${schema.todos.done})::int` })
      .from(schema.todos)
      .groupBy(schema.todos.projectId),
  ]);
  const ls = new Map(logStats.map((l) => [l.projectId, l]));
  const ts = new Map(todoStats.map((t) => [t.projectId, t.open]));
  return rows.map((r) => ({
    ...r,
    logCount: Number(ls.get(r.id)?.count ?? 0),
    lastLogAt: ls.get(r.id)?.last ? new Date(ls.get(r.id)!.last).toISOString() : null,
    openTodos: Number(ts.get(r.id) ?? 0),
  }));
}

export async function getTodos() {
  const db = await getDb();
  return db.select().from(schema.todos).orderBy(asc(schema.todos.sort));
}

export async function getProjectOptions() {
  const db = await getDb();
  return db
    .select({ id: schema.projects.id, title: schema.projects.title, status: schema.projects.status })
    .from(schema.projects)
    .orderBy(asc(schema.projects.title));
}
