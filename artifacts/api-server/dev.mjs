import { spawnSync, spawn } from 'node:child_process';

const env = { ...process.env, NODE_ENV: 'development' };
const build = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit', env });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn(process.execPath, [
  '--env-file-if-exists=../../.env', '--enable-source-maps', 'dist/index.mjs',
], { stdio: 'inherit', env });
server.on('error', (error) => { console.error(error); process.exitCode = 1; });
server.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
