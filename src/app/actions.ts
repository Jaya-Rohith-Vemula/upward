"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { PRIORITY, PROJECT_STATUS, PROJECT_TYPE } from "@/db/schema";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { isValidDay } from "@/lib/time";
import { taggableType } from "@/lib/categories";

const { timeLogs, reflections, projects, projectLogs, todos, settings, categories } = schema;

const clampScore = (n: unknown) => {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
};
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const assertDay = (d: string) => {
  if (!isValidDay(d)) throw new Error("Invalid day");
};


// ───────── auth
export async function login(_: unknown, form: FormData) {
  const password = process.env.APP_PASSWORD ?? "";
  const given = str(form.get("password"), 500);
  const next = str(form.get("next"), 500);
  if (!password || !safeEqual(await sessionToken(given), await sessionToken(password))) {
    return { error: "That's not it." };
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ───────── time logs
export type LogInput = {
  id?: number;
  day: string;
  startMinute: number;
  durationMinutes: number;
  categoryId: number | null;
  projectId?: number | null;
  activity: string;
  focus: number | null;
  energy: number | null;
  notes: string | null;
};

export type SaveLogResult = { ok: true; log: typeof timeLogs.$inferSelect } | { ok: false; error: string };

export async function saveLog(input: LogInput): Promise<SaveLogResult> {
  if (!isValidDay(input.day)) return { ok: false, error: "Invalid day" };
  const start = Math.trunc(input.startMinute);
  const dur = Math.trunc(input.durationMinutes);
  if (!(start >= 0 && dur > 0 && start + dur <= 1440)) return { ok: false, error: "Time range must stay within the day" };
  const values = {
    day: input.day,
    startMinute: start,
    durationMinutes: dur,
    categoryId: input.categoryId ?? null,
    projectId: null as number | null,
    activity: str(input.activity, 300),
    focus: clampScore(input.focus),
    energy: clampScore(input.energy),
    notes: str(input.notes) || null,
  };
  const db = await getDb();
  // Build projects can only be tagged under "Projects", learnings only under "Learning".
  if (values.categoryId != null && input.projectId != null) {
    const [[cat], [proj]] = await Promise.all([
      db.select({ name: categories.name }).from(categories).where(eq(categories.id, values.categoryId)),
      db.select({ type: projects.type }).from(projects).where(eq(projects.id, Math.trunc(input.projectId))),
    ]);
    const type = taggableType(cat?.name);
    if (type && proj && proj.type === type) values.projectId = Math.trunc(input.projectId);
  }
  const clash = await db
    .select({ id: timeLogs.id, start: timeLogs.startMinute, activity: timeLogs.activity })
    .from(timeLogs)
    .where(
      and(
        eq(timeLogs.day, input.day),
        lt(timeLogs.startMinute, start + dur),
        gt(sql`${timeLogs.startMinute} + ${timeLogs.durationMinutes}`, start),
        input.id ? ne(timeLogs.id, input.id) : undefined,
      ),
    )
    .limit(1);
  if (clash.length) return { ok: false, error: "That overlaps another entry. Shorten or move one of them." };

  const [row] = input.id
    ? await db.update(timeLogs).set({ ...values, updatedAt: sql`now()` }).where(eq(timeLogs.id, input.id)).returning()
    : await db.insert(timeLogs).values(values).returning();
  if (!row) return { ok: false, error: "That entry no longer exists. Reload the page." };
  revalidatePath("/");
  return { ok: true, log: row };
}

export async function deleteLog(id: number) {
  const db = await getDb();
  await db.delete(timeLogs).where(eq(timeLogs.id, Math.trunc(id)));
  revalidatePath("/");
}

// ───────── reflection
export async function saveReflection(input: { day: string; mood: number | null; wins: string; blockers: string; tomorrow: string }) {
  assertDay(input.day);
  const values = {
    day: input.day,
    mood: clampScore(input.mood),
    wins: str(input.wins) || null,
    blockers: str(input.blockers) || null,
    tomorrow: str(input.tomorrow) || null,
  };
  const db = await getDb();
  await db.insert(reflections).values(values).onConflictDoUpdate({ target: reflections.day, set: { ...values, updatedAt: sql`now()` } });
  revalidatePath("/");
}

// ───────── projects
type ProjectStatus = (typeof PROJECT_STATUS)[number];
type ProjectType = (typeof PROJECT_TYPE)[number];
type Priority = (typeof PRIORITY)[number];

/** "Build a CLI #upward !high" → title + tags + priority */
function parseQuick(raw: string) {
  const tags = [...raw.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase());
  const pri = raw.match(/!(high|medium|low)\b/i)?.[1]?.toLowerCase() as Priority | undefined;
  const title = raw.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/!(high|medium|low)\b/gi, "").replace(/\s+/g, " ").trim();
  return { title, tags: [...new Set(tags)], priority: pri };
}

export async function createProject(raw: string, status: ProjectStatus = "idea", type: ProjectType = "build") {
  const q = parseQuick(str(raw, 500));
  if (!q.title) return null;
  const db = await getDb();
  const [{ min }] = await db
    .select({ min: sql<number>`coalesce(min(${projects.sort}), 1000)` })
    .from(projects)
    .where(eq(projects.status, status));
  const [row] = await db
    .insert(projects)
    .values({
      title: q.title,
      tags: q.tags,
      priority: q.priority ?? "medium",
      status: PROJECT_STATUS.includes(status) ? status : "idea",
      type: PROJECT_TYPE.includes(type) ? type : "build",
      sort: Number(min) - 1,
    })
    .returning();
  revalidatePath("/projects");
  revalidatePath("/learnings");
  return row;
}

export type ProjectPatch = Partial<{
  title: string;
  status: ProjectStatus;
  type: ProjectType;
  priority: Priority;
  tags: string[];
  progress: number;
  targetDate: string | null;
  sort: number;
  notes: unknown;
  notesText: string;
}>;

export async function updateProject(id: number, patch: ProjectPatch) {
  const set: Partial<typeof projects.$inferInsert> = {};
  if (patch.title !== undefined && str(patch.title)) set.title = str(patch.title, 500);
  if (patch.status && PROJECT_STATUS.includes(patch.status)) {
    set.status = patch.status;
    set.doneAt = patch.status === "done" || patch.status === "dropped" ? new Date() : null;
    if (patch.status === "done") set.progress = 100;
  }
  if (patch.type && PROJECT_TYPE.includes(patch.type)) set.type = patch.type;
  if (patch.priority && PRIORITY.includes(patch.priority)) set.priority = patch.priority;
  if (Array.isArray(patch.tags)) set.tags = [...new Set(patch.tags.map((t) => str(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  if (patch.progress !== undefined) set.progress = Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0)));
  if (patch.targetDate !== undefined) set.targetDate = patch.targetDate && isValidDay(patch.targetDate) ? patch.targetDate : null;
  if (patch.sort !== undefined && Number.isFinite(patch.sort)) set.sort = patch.sort;
  if (patch.notes !== undefined) {
    set.notes = patch.notes;
    set.notesText = str(patch.notesText ?? "", 200_000);
  }
  if (!Object.keys(set).length) return;
  const db = await getDb();
  await db.update(projects).set({ ...set, updatedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath("/learnings");
}

export async function deleteProject(id: number) {
  const db = await getDb();
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath("/learnings");
}

export async function getProjectDetail(id: number) {
  const db = await getDb();
  const [[project], logs, projectTodos] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, id)),
    db.select().from(projectLogs).where(eq(projectLogs.projectId, id)).orderBy(desc(projectLogs.createdAt)),
    db.select().from(todos).where(eq(todos.projectId, id)).orderBy(asc(todos.done), asc(todos.sort)),
  ]);
  return project ? { project, logs, todos: projectTodos } : null;
}

export async function addProjectLog(projectId: number, content: unknown, text: string, progress: number | null) {
  const p = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  const db = await getDb();
  const [row] = await db
    .insert(projectLogs)
    .values({ projectId, content, text: str(text, 200_000), progress: p })
    .returning();
  await db
    .update(projects)
    .set({ updatedAt: new Date(), ...(p != null ? { progress: p } : {}) })
    .where(eq(projects.id, projectId));
  revalidatePath("/projects");
  revalidatePath("/learnings");
  return row;
}

export async function updateProjectLog(id: number, content: unknown, text: string) {
  const db = await getDb();
  const [row] = await db
    .update(projectLogs)
    .set({ content, text: str(text, 200_000), updatedAt: new Date() })
    .where(eq(projectLogs.id, id))
    .returning();
  return row;
}

export async function deleteProjectLog(id: number) {
  const db = await getDb();
  await db.delete(projectLogs).where(eq(projectLogs.id, id));
  revalidatePath("/projects");
  revalidatePath("/learnings");
}

// ───────── todos
export async function addTodo(input: { title: string; dueDate?: string | null; projectId?: number | null; priority?: Priority }) {
  const q = parseQuick(str(input.title, 500));
  if (!q.title) return null;
  const db = await getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${todos.sort}), 0)` }).from(todos);
  const [row] = await db
    .insert(todos)
    .values({
      title: q.title,
      priority: q.priority ?? (input.priority && PRIORITY.includes(input.priority) ? input.priority : "medium"),
      dueDate: input.dueDate && isValidDay(input.dueDate) ? input.dueDate : null,
      projectId: input.projectId ?? null,
      sort: Number(max) + 1,
    })
    .returning();
  revalidatePath("/todos");
  revalidatePath("/projects");
  revalidatePath("/learnings");
  return row;
}

export async function updateTodo(
  id: number,
  patch: Partial<{ title: string; done: boolean; dueDate: string | null; projectId: number | null; priority: Priority; notes: string }>,
) {
  const set: Partial<typeof todos.$inferInsert> = {};
  if (patch.title !== undefined && str(patch.title)) set.title = str(patch.title, 500);
  if (patch.done !== undefined) {
    set.done = !!patch.done;
    set.doneAt = patch.done ? new Date() : null;
  }
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate && isValidDay(patch.dueDate) ? patch.dueDate : null;
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.priority && PRIORITY.includes(patch.priority)) set.priority = patch.priority;
  if (patch.notes !== undefined) set.notes = str(patch.notes) || null;
  if (!Object.keys(set).length) return;
  const db = await getDb();
  await db.update(todos).set(set).where(eq(todos.id, id));
  revalidatePath("/todos");
  revalidatePath("/projects");
  revalidatePath("/learnings");
}

export async function deleteTodo(id: number) {
  const db = await getDb();
  await db.delete(todos).where(eq(todos.id, id));
  revalidatePath("/todos");
  revalidatePath("/projects");
  revalidatePath("/learnings");
}

// ───────── settings & categories
export async function saveSettings(input: { slotMinutes: number; dayStartHour: number; dayEndHour: number; timezone: string }) {
  const slot = Math.trunc(input.slotMinutes);
  const start = Math.trunc(input.dayStartHour);
  const end = Math.trunc(input.dayEndHour);
  if (![15, 30, 60].includes(slot)) throw new Error("Grid must be 15, 30 or 60 minutes");
  if (!(start >= 0 && end <= 24 && start < end)) throw new Error("Day must start before it ends");
  let tz = str(input.timezone, 80) || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const values = { id: 1, slotMinutes: slot, dayStartHour: start, dayEndHour: end, timezone: tz };
  const db = await getDb();
  await db.insert(settings).values(values).onConflictDoUpdate({ target: settings.id, set: values });
  revalidatePath("/", "layout");
}

const KIND = ["productive", "neutral", "rest", "drain"] as const;
type Kind = (typeof KIND)[number];

export async function upsertCategory(input: { id?: number; name: string; color: string; kind: Kind; archived?: boolean }) {
  const name = str(input.name, 60);
  if (!name) return;
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#8a7f6a";
  const kind = KIND.includes(input.kind) ? input.kind : "neutral";
  const db = await getDb();
  if (input.id) {
    await db.update(categories).set({ name, color, kind, archived: !!input.archived }).where(eq(categories.id, input.id));
  } else {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${categories.sort}), 0)` }).from(categories);
    await db.insert(categories).values({ name, color, kind, sort: Number(max) + 1 }).onConflictDoNothing();
  }
  revalidatePath("/", "layout");
}
