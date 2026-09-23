import { spawnSync, spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { once } from 'node:events';

const env = { ...process.env, NODE_ENV: 'development' };
let server;
let restarting = false;
let pending = false;
let stopping = false;
let timer;

async function rebuild() {
  if (stopping) return;
  if (restarting) { pending = true; return; }
  restarting = true;
  try {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    const result = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit', env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error('Build failed. Waiting for source changes.');
      return;
    }
    server = spawn(process.execPath, [
      '--env-file-if-exists=../../.env', '--enable-source-maps', 'dist/index.mjs',
    ], { stdio: 'inherit', env });
    server.on('error', (error) => console.error(error));
  } finally {
    restarting = false;
    if (pending) { pending = false; void rebuild(); }
  }
}

// The UI reloads automatically; the API must reload as well when its response
// shape changes, or an old server can keep breaking a freshly updated page.
const watchers = ['src', '../../lib/api-zod/src', '../../lib/db/src'].map((dir) =>
  watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.ts')) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild().catch(console.error), 300);
  }),
);
await rebuild();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.close());
    server?.kill(signal);
  });
}
