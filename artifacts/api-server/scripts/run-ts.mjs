/**
 * Bundles a TypeScript entry with esbuild and runs it.
 *
 * The workspace uses `moduleResolution: "bundler"`, so its TypeScript sources
 * import directories and omit extensions - shapes Node's ESM resolver rejects.
 * The server itself is bundled before it runs (build.mjs); this does the same
 * for one-off scripts.
 *
 *   node scripts/run-ts.mjs scripts/create-user.ts --username admin ...
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const [entry] = process.argv.slice(2);
if (!entry) {
  console.error("Usage: node scripts/run-ts.mjs <entry.ts> [args...]");
  process.exit(1);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "ej-script-"));
const outfile = path.join(tempDir, "entry.mjs");

try {
  await build({
    entryPoints: [path.resolve(entry)],
    outfile,
    platform: "node",
    format: "esm",
    bundle: true,
    logLevel: "warning",
    external: ["pg-native", "*.node"],
    banner: {
      js: `import { createRequire as __cr } from 'node:module';
globalThis.require = __cr(import.meta.url);`,
    },
  });
  // Drop the runner's own arguments so the script sees its own flags at the
  // same positions it would when run directly.
  process.argv = [process.argv[0], path.resolve(entry), ...process.argv.slice(3)];
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
