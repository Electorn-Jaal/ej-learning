/**
 * Both timetable workbooks, in one command.
 *
 *   pnpm timetable:excel
 *
 * The school keeps its timetable in two shapes and needs both:
 *
 *   timetable-export.xlsx   the one on the wall - teachers down the side, the
 *                           week across the top, a class in every cell
 *   timetable-form.xlsx     the one they fill in - a sheet per class, the week
 *                           across the top, a subject in every cell, and the
 *                           teachers named once on a sheet of their own
 *
 * Three steps behind one command because the steps span two languages: the
 * database is TypeScript's, the spreadsheets are Python's, and the JSON in
 * between means neither has to learn the other's job. Asking somebody to
 * remember all three in order is asking them to produce one file and forget
 * the second.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const extracted = path.join(root, "local-data", "extracted");
const generated = path.join(root, "local-data", "generated");
mkdirSync(extracted, { recursive: true });
mkdirSync(generated, { recursive: true });

const json = path.join(extracted, "timetable.json");
const wall = path.join(generated, "timetable-export.xlsx");
const form = path.join(generated, "timetable-form.xlsx");

/**
 * How to invoke the package manager again from inside a script it is running.
 *
 * npm_execpath is the JS entry point of whatever ran us, so calling it with
 * this same node binary needs no PATH lookup and no shell. That matters on
 * Windows, where `corepack` and `pnpm` resolve only through .cmd shims and
 * Node refuses to spawn a .cmd without a shell - so the bare name works on one
 * machine and fails on another.
 */
function packageManager() {
  const entry = process.env.npm_execpath;
  if (entry && /\.(c|m)?js$/.test(entry)) return [process.execPath, [entry]];
  // Run straight from a terminal rather than through pnpm: fall back to the
  // shell, which is safe here because every argument is a literal.
  return ["corepack pnpm", [], true];
}

/** Whichever Python this machine calls it. Windows ships `py`, Linux does not. */
function python() {
  for (const candidate of ["python", "python3", "py"]) {
    const probe = spawnSync(candidate, ["-c", "import openpyxl"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  console.error(
    "openpyxl суулгасан Python олдсонгүй. `pip install openpyxl` ажиллуулна уу.",
  );
  process.exit(1);
}

function run(command, args, label) {
  console.log(`\n— ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    console.error(`\n${label}: амжилтгүй.`);
    process.exit(result.status ?? 1);
  }
}

const [pm, pmPrefix, pmShell] = packageManager();
run(pm, [...pmPrefix, "--filter", "@workspace/api-server", "run", "export-timetable"],
  "Сангаас уншиж байна", pmShell ?? false);

if (!existsSync(json)) {
  console.error(`\n${json} үүсээгүй байна.`);
  process.exit(1);
}

const py = python();
run(py, [path.join("scripts", "src", "build-timetable-xlsx.py"), json, wall],
  "Ханын хуваарь");
run(py, [path.join("scripts", "src", "build-timetable-form-xlsx.py"), json, form],
  "Бөглөх маягт");

console.log("\nБэлэн:");
console.log(`  ${path.relative(root, wall)}`);
console.log(`  ${path.relative(root, form)}`);
