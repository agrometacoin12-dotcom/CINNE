// Dev orchestrator: starts the Vite dev server, builds main+preload once,
// then launches Electron pointed at the dev server. Ctrl-C tears it all down.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEV_URL = 'http://localhost:5183';

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
}

function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(undefined);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`timed out waiting for ${url}`));
        else setTimeout(poll, 300);
      });
    };
    poll();
  });
}

const vite = run('npx', ['vite']);

const electronBuild = run('node', ['scripts/build-electron.mjs']);
await new Promise((resolve, reject) => {
  electronBuild.on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error('electron build failed'))));
});

await waitFor(DEV_URL);

const electron = run('npx', ['electron', '.', ...process.argv.slice(2)], {
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
});

const shutdown = () => {
  vite.kill();
  electron.kill();
  process.exit(0);
};
electron.on('exit', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
