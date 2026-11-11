import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "";

export default url.startsWith("pglite:")
  ? defineConfig({
      schema: ["./src/db/schema.ts", "./src/db/legacy.ts"],
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: { url: url.slice("pglite:".length) },
    })
  : defineConfig({
      schema: ["./src/db/schema.ts", "./src/db/legacy.ts"],
      dialect: "postgresql",
      dbCredentials: { url },
    });
