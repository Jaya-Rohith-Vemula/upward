import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzleNeon<typeof schema>>;

/** Creates a Drizzle client. Neon over HTTP in prod; `pglite:<dir>` for an offline local DB. */
export async function createDb(url = process.env.DATABASE_URL): Promise<DB> {
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    return drizzle(new PGlite(url.slice("pglite:".length)), { schema }) as unknown as DB;
  }
  return drizzleNeon(neon(url), { schema });
}
