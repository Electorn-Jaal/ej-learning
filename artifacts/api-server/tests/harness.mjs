/**
 * Stands a whole system up on a throwaway database, for the duration of a test
 * run, and takes it back down again.
 *
 * Every run gets its own database named ej_learning_test_<random>, built by the
 * same `db:setup` a person runs on a new machine. That is deliberate: if setup
 * breaks, the tests fail, so the documented path onto a new machine cannot rot
 * unnoticed. Nothing here ever connects to ej_learning_dev - the name is
 * generated, and the drop refuses anything that does not match the pattern.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(here, "..");
const repoRoot = path.resolve(apiServerDir, "../..");

/** Only ever a name this file generated. Guards every DROP DATABASE. */
const DISPOSABLE = /^ej_learning_test_[0-9a-f]{12}$/;

function adminUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Tests need a local PostgreSQL to create a throwaway database on.");
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/postgres";
  return url;
}

function databaseUrl(name) {
  const url = adminUrl();
  url.pathname = "/" + name;
  return url;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited with code ${child.exitCode} before becoming healthy.`);
    }
    try {
      const res = await fetch(baseUrl + "/healthz");
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("API did not become healthy within 30s.");
}

export async function startHarness() {
  const database = "ej_learning_test_" + randomBytes(6).toString("hex");
  if (!DISPOSABLE.test(database)) throw new Error("Generated an unusable database name.");

  const storageDir = await mkdtemp(path.join(os.tmpdir(), "ej-test-storage-"));
  const accountsFile = path.join(repoRoot, "local-data/generated", database + "-accounts.json");

  const admin = new pg.Client({ connectionString: adminUrl().href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();

  const childEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl(database).href,
    EJ_STORAGE_DIR: storageDir,
    NODE_ENV: "test",
  };

  let client;
  let server;
  const stop = async () => {
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    if (client) await client.end().catch(() => {});
    await rm(storageDir, { recursive: true, force: true });
    await rm(accountsFile, { force: true });
    if (DISPOSABLE.test(database)) {
      const cleanup = new pg.Client({ connectionString: adminUrl().href });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await cleanup.end();
    }
  };

  try {
    // The same command the README gives a new machine.
    const setup = spawnSync(
      process.execPath,
      [path.join(repoRoot, "lib/db/scripts/setup-local.mjs")],
      { cwd: repoRoot, env: childEnv, encoding: "utf8" },
    );
    if (setup.status !== 0) {
      throw new Error("db:setup failed: " + (setup.stderr || setup.stdout).trim());
    }

    const accounts = JSON.parse(await readFile(accountsFile, "utf8"));

    const build = spawnSync(process.execPath, ["build.mjs"], {
      cwd: apiServerDir,
      env: childEnv,
      encoding: "utf8",
    });
    if (build.status !== 0) {
      throw new Error("API build failed: " + (build.stderr || build.stdout).trim());
    }

    const port = await freePort();
    server = spawn(process.execPath, ["dist/index.mjs"], {
      cwd: apiServerDir,
      env: { ...childEnv, API_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const serverLog = [];
    for (const stream of [server.stdout, server.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => serverLog.push(chunk));
    }

    const baseUrl = `http://127.0.0.1:${port}/api`;
    try {
      await waitForHealth(baseUrl, server);
    } catch (error) {
      throw new Error(error.message + "\nServer output:\n" + serverLog.join(""));
    }

    client = new pg.Client({ connectionString: databaseUrl(database).href });
    await client.connect();

    return {
      database,
      baseUrl,
      accounts,
      /** Read-only helper for asserting what actually landed in the database. */
      sql: async (text, values = []) => (await client.query(text, values)).rows,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Minimal HTTP client that carries one account's session cookie. */
export function createClient(baseUrl) {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(pathname, { method = "GET", body, raw = false } = {}) {
      const res = await fetch(baseUrl + pathname, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.getSetCookie?.() ?? [];
      if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
      if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      return { status: res.status, payload };
    },
    async signIn(account) {
      const res = await this.request("/auth/login", {
        method: "POST",
        body: { username: account.username, password: account.password },
      });
      if (res.status !== 200) throw new Error(`Sign-in failed for ${account.username}: ${res.status}`);
      return res;
    },
  };
}
