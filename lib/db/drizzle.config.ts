import { defineConfig } from "drizzle-kit";
import path from "path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const envFile = path.resolve(__dirname, "../../.env");
if (existsSync(envFile)) loadEnvFile(envFile);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Paths stay relative: drizzle-kit resolves them against the config directory,
// and re-joins an absolute path onto the cwd, which breaks every command.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // The application owns these schemas only. Without this filter drizzle-kit
  // treats every unlisted table as a drop candidate.
  schemaFilter: ["core", "content", "learning", "assessment", "staging", "audit"],
});
