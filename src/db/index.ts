import "server-only";
import { createDb, type DB } from "./client";

const g = globalThis as unknown as { __upwardDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  g.__upwardDb ??= createDb();
  return g.__upwardDb;
}

export * as schema from "./schema";
