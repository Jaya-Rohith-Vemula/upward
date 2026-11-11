/**
 * v1 tables (ideas, tracks, track_updates). No longer used by the app; kept so `db:push`
 * doesn't drop them before `db:seed` copies their rows into projects / project_logs.
 * Safe to delete this file (and its entry in drizzle.config.ts) once migrated.
 */
import { pgTable, serial, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";

/** Things to build next — the idea inbox. */
export const ideas = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  status: text("status", { enum: ["inbox", "next", "building", "shipped", "dropped"] })
    .notNull()
    .default("inbox"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  doneAt: timestamp("done_at", { withTimezone: true }),
});

/** Progress tracks: things I'm doing, and things I need to learn next. */
export const tracks = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["doing", "learning"] }).notNull(),
  description: text("description"),
  status: text("status", { enum: ["queued", "active", "paused", "done"] }).notNull().default("active"),
  progress: integer("progress").notNull().default(0), // 0-100
  targetDate: date("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** History of progress check-ins, so analysis can see velocity. */
export const trackUpdates = pgTable(
  "track_updates",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("track_updates_track").on(t.trackId)],
);

