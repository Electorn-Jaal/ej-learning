// LEGACY schema definitions — NOT part of the live database.
//
// These tables (ej_learning_*, ej_workspace_*) do not exist in ej_learning_dev.
// They are referenced only by artifacts/api-server/src/routes/ej-learning.ts,
// which routes/index.ts does not mount (it mounts native-learning.ts instead).
//
// They are deliberately kept OUT of ./index.ts: drizzle-kit reads that barrel,
// and exporting them there makes `generate` emit a migration that CREATEs all
// seven tables in the public schema. `schemaFilter` does not prevent this.
//
// Delete this file together with the dead route once that work is scheduled.
export * from "./ej-learning";
export * from "./workspace-integrations";
