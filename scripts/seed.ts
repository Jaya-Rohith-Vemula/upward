/**
 * Seeds settings + default categories (idempotent).
 *   npm run db:seed            # defaults only
 *   npm run db:seed -- --demo  # also 14 days of fake data (for trying the UI; don't run on your real DB)
 * Also migrates v1 ideas/tracks into projects (once, only while `projects` is empty).
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { categories, projectLogs, projects, reflections, settings, timeLogs, todos } from "../src/db/schema";
import { ideas, trackUpdates, tracks } from "../src/db/legacy";
import { addDays, todayIn } from "../src/lib/time";

const DEFAULT_CATEGORIES = [
  { name: "Deep work", color: "#2f6b4f", kind: "productive" },
  { name: "Learning", color: "#3d6fa3", kind: "productive" },
  { name: "Exercise", color: "#b8743a", kind: "productive" },
  { name: "Admin & email", color: "#8a7f6a", kind: "neutral" },
  { name: "Meals", color: "#c49a3c", kind: "neutral" },
  { name: "Commute", color: "#7d8b8f", kind: "neutral" },
  { name: "Chores", color: "#9b8a74", kind: "neutral" },
  { name: "Social & family", color: "#a65b7a", kind: "rest" },
  { name: "Rest", color: "#6f7fa8", kind: "rest" },
  { name: "Sleep", color: "#4b5470", kind: "rest" },
  { name: "Scrolling / distraction", color: "#b5483b", kind: "drain" },
] as const;

async function main() {
  const db = await createDb();
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i })))
    .onConflictDoNothing();
  console.log("✓ settings + categories");
  await migrateV1(db);

  if (process.argv.includes("--demo")) {
    const cats = await db.select().from(categories);
    const id = (n: string) => cats.find((c) => c.name === n)!.id;
    const today = todayIn("UTC");
    const plan: [number, string, string][] = [
      [7, "Exercise", "Run"], [8, "Meals", "Breakfast"], [9, "Deep work", "Build feature"], [10, "Deep work", "Build feature"],
      [11, "Admin & email", "Inbox"], [12, "Learning", "Course"], [13, "Meals", "Lunch"], [14, "Scrolling / distraction", "Twitter"],
      [15, "Deep work", "Debugging"], [16, "Learning", "Reading docs"], [17, "Commute", "Travel"], [18, "Social & family", "Family"],
      [19, "Meals", "Dinner"], [20, "Rest", "Movie"], [21, "Scrolling / distraction", "YouTube"], [22, "Rest", "Wind down"],
    ];
    for (let d = 13; d >= 0; d--) {
      const day = addDays(today, -d);
      for (const [h, cat, act] of plan) {
        if (Math.random() < 0.12) continue;
        const swapDrain = Math.random() < 0.15;
        await db.insert(timeLogs).values({
          day, startMinute: h * 60, durationMinutes: 60,
          categoryId: id(swapDrain ? "Scrolling / distraction" : cat), activity: swapDrain ? "Phone" : act,
          focus: 1 + Math.floor(Math.random() * 5), energy: 1 + Math.floor(Math.random() * 5),
        }).onConflictDoNothing();
      }
      await db.insert(reflections).values({ day, mood: 2 + Math.floor(Math.random() * 4), wins: "Shipped a small thing", blockers: Math.random() < 0.5 ? "Got distracted after lunch" : null }).onConflictDoNothing();
    }
    const para = (t: string) => [{ type: "paragraph", content: t }];
    const days = (n: number) => new Date(Date.now() - n * 864e5);
    const [p1, p2] = await db
      .insert(projects)
      .values([
        { title: "Ship Upward v1", status: "active", type: "build", priority: "high", tags: ["upward"], progress: 40, sort: 0 },
        { title: "Learn Postgres internals", status: "next", type: "learn", tags: ["db"], progress: 10, sort: 0 },
        { title: "Telegram bot to log a slot", status: "idea", type: "build", tags: ["upward"], sort: 0 },
        { title: "Weekly email digest", status: "idea", type: "build", priority: "low", sort: 1 },
      ])
      .returning();
    await db.insert(projectLogs).values([
      { projectId: p1.id, content: para("Schema done. Went with Postgres on Neon."), text: "Schema done. Went with Postgres on Neon.", progress: 20, createdAt: days(5) },
      { projectId: p1.id, content: para("Calendar-style day view works. Drag to log."), text: "Calendar-style day view works. Drag to log.", progress: 40, createdAt: days(1) },
      { projectId: p2.id, content: para("Started reading about MVCC."), text: "Started reading about MVCC.", progress: 10, createdAt: days(3) },
    ]);
    await db.insert(todos).values([
      { title: "Set up Neon project", projectId: p1.id, dueDate: today, priority: "high", sort: 1 },
      { title: "Point upward.jayass.app at Vercel", projectId: p1.id, dueDate: addDays(today, 1), sort: 2 },
      { title: "Read chapter 2", projectId: p2.id, dueDate: addDays(today, -1), sort: 3 },
      { title: "Renew passport photos", sort: 4 },
      { title: "Write README", projectId: p1.id, done: true, doneAt: days(2), sort: 5 },
    ]);
    console.log("✓ demo data");
  }
  const counts = await db.execute(sql`select (select count(*) from time_logs)::int as logs, (select count(*) from projects)::int as projects, (select count(*) from todos)::int as todos`);
  console.log(((counts as { rows?: unknown[] }).rows ?? counts as unknown as unknown[])[0]);
  process.exit(0);
}

/** Copy v1 ideas/tracks/track_updates into projects/project_logs (only when projects is empty). */
async function migrateV1(db: Awaited<ReturnType<typeof createDb>>) {
  const rows = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));
  const [{ n }] = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from projects`));
  if (Number(n) > 0) return;
  const [{ has }] = rows<{ has: boolean }>(await db.execute(sql`select to_regclass('public.ideas') is not null as has`));
  if (!has) return;
  const para = (t: string | null) => (t ? t.split("\n").map((line) => ({ type: "paragraph", content: line })) : null);
  const ideaStatus = { inbox: "idea", next: "next", building: "active", shipped: "done", dropped: "dropped" } as const;
  const trackStatus = { queued: "next", active: "active", paused: "paused", done: "done" } as const;

  const oldIdeas = await db.select().from(ideas);
  for (const i of oldIdeas) {
    await db.insert(projects).values({
      title: i.title, status: ideaStatus[i.status], type: "build", priority: i.priority, tags: i.tags,
      notes: para(i.notes), notesText: i.notes, createdAt: i.createdAt, doneAt: i.doneAt, sort: 0,
    });
  }
  const oldTracks = await db.select().from(tracks);
  const updates = await db.select().from(trackUpdates);
  for (const t of oldTracks) {
    const [p] = await db.insert(projects).values({
      title: t.title, status: trackStatus[t.status], type: t.kind === "learning" ? "learn" : "build", progress: t.progress,
      targetDate: t.targetDate, notes: para(t.description), notesText: t.description, createdAt: t.createdAt, sort: 0,
    }).returning();
    for (const u of updates.filter((u) => u.trackId === t.id)) {
      const text = u.note ?? `Progress → ${u.progress}%`;
      await db.insert(projectLogs).values({ projectId: p.id, content: para(text), text, progress: u.progress, createdAt: u.createdAt });
    }
  }
  if (oldIdeas.length || oldTracks.length) console.log(`✓ migrated ${oldIdeas.length} ideas + ${oldTracks.length} tracks → projects`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
