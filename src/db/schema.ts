import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  smallint,
  boolean,
  uniqueIndex,
  index,
  jsonb,
  doublePrecision,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Single-row app settings (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  slotMinutes: integer("slot_minutes").notNull().default(15),
  dayStartHour: integer("day_start_hour").notNull().default(6),
  dayEndHour: integer("day_end_hour").notNull().default(24),
  timezone: text("timezone").notNull().default("UTC"),
});

/**
 * What a block of time was spent on.
 * weight: how much it counts toward "intentional time" (productive = 1, neutral = 0.5, rest = 0.5, drain = 0).
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  kind: text("kind", { enum: ["productive", "neutral", "rest", "drain"] })
    .notNull()
    .default("neutral"),
  archived: boolean("archived").notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

/** One logged slot of the day. startMinute = minutes since local midnight. */
export const timeLogs = pgTable(
  "time_logs",
  {
    id: serial("id").primaryKey(),
    day: date("day").notNull(),
    startMinute: integer("start_minute").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    /** Which project the time went to (only set when the category is "Projects"). */
    projectId: integer("project_id").references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    activity: text("activity").notNull().default(""),
    focus: smallint("focus"), // 1-5
    energy: smallint("energy"), // 1-5
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("time_logs_day_start").on(t.day, t.startMinute),
    index("time_logs_day").on(t.day),
    index("time_logs_project").on(t.projectId),
  ],
);

/** End-of-day reflection. */
export const reflections = pgTable("reflections", {
  day: date("day").primaryKey(),
  mood: smallint("mood"), // 1-5
  wins: text("wins"),
  blockers: text("blockers"),
  tomorrow: text("tomorrow"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const PROJECT_STATUS = ["idea", "next", "active", "paused", "done", "dropped"] as const;
export const PROJECT_TYPE = ["build", "learn"] as const;
export const PRIORITY = ["low", "medium", "high"] as const;

/** Projects: things to build and things to learn. Notes = BlockNote JSON; notesText = markdown copy for analysis. */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status", { enum: PROJECT_STATUS }).notNull().default("idea"),
    type: text("type", { enum: PROJECT_TYPE }).notNull().default("build"),
    priority: text("priority", { enum: PRIORITY }).notNull().default("medium"),
    tags: text("tags").array().notNull().default([]),
    progress: integer("progress").notNull().default(0), // 0-100
    targetDate: date("target_date"),
    notes: jsonb("notes"),
    notesText: text("notes_text"),
    sort: doublePrecision("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("projects_status").on(t.status)],
);

/** Dated journal entries on a project. */
export const projectLogs = pgTable(
  "project_logs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: jsonb("content"),
    text: text("text").notNull().default(""),
    progress: integer("progress"), // progress snapshot at the time of the entry
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_logs_project").on(t.projectId)],
);

export const todos = pgTable(
  "todos",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    done: boolean("done").notNull().default(false),
    priority: text("priority", { enum: PRIORITY }).notNull().default("medium"),
    dueDate: date("due_date"),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    sort: doublePrecision("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("todos_done").on(t.done), index("todos_project").on(t.projectId)],
);

export type Category = typeof categories.$inferSelect;
export type TimeLog = typeof timeLogs.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectLog = typeof projectLogs.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type Reflection = typeof reflections.$inferSelect;
export type Settings = typeof settings.$inferSelect;
