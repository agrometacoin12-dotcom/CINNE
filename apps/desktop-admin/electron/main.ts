import { app, BrowserWindow, ipcMain, safeStorage, shell, nativeImage } from 'electron';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

// ── CLI flags (verification hooks) ──────────────────────────────────────────
const argv = process.argv.slice(1);
const MOCK = argv.includes('--mock');
const screenshotArg = argv.find((a) => a.startsWith('--screenshot-dir='));
const SCREENSHOT_DIR = screenshotArg ? screenshotArg.slice('--screenshot-dir='.length) : null;
const PROBE_API = argv.includes('--probe-api');

const APP_BG = '#0B0B14';
const TOKEN_FILE = () => path.join(app.getPath('userData'), 'studio-tokens.bin');

/** Hosts the renderer is allowed to open externally (device-link auth page + site). */
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'www.cinnetemple.com',
  'cinnetemple.com',
  'api.cinnetemple.com',
]);

let mainWindow: BrowserWindow | null = null;

// ── Auth loopback server (device link) ──────────────────────────────────────
// The renderer cannot run a Node HTTP server (sandboxed), so it lives here.
// GET /callback?code=... stores the single-use code and shows a branded page.
let loopbackServer: http.Server | null = null;
let pendingCode: string | null = null;
let codeWaiter: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null;

const CALLBACK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>CinneTemple Studio</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:${APP_BG};color:#f5f5f7;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
  .card{text-align:center;padding:48px 56px;border:1px solid rgba(255,255,255,.08);
        border-radius:20px;background:#10131c;box-shadow:0 24px 80px rgba(0,0,0,.5)}
  .badge{width:56px;height:56px;border-radius:16px;margin:0 auto 20px;
         background:linear-gradient(135deg,#6c6ffc,#4f46e5);display:flex;align-items:center;
         justify-content:center;font-size:26px;font-weight:800}
  h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px}
</style></head>
<body><div class="card"><div class="badge">C</div>
<h1>You're signed in</h1><p>You can return to CinneTemple Studio.</p></div></body></html>`;

function stopLoopback(): void {
  if (loopbackServer) {
    loopbackServer.close();
    loopbackServer = null;
  }
  if (codeWaiter) {
    codeWaiter.reject(new Error('auth cancelled'));
    codeWaiter = null;
  }
  pendingCode = null;
}

function startLoopback(): Promise<{ port: number }> {
  stopLoopback();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(CALLBACK_HTML);
        if (code) {
          if (codeWaiter) {
            codeWaiter.resolve(code);
            codeWaiter = null;
          } else {
            pendingCode = code;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });
    server.on('error', reject);
    // Port 0 = OS-assigned free port; bound strictly to loopback.
    server.listen(0, '127.0.0.1', () => {
      loopbackServer = server;
      const { port } = server.address() as AddressInfo;
      resolve({ port });
    });
  });
}

function awaitAuthCode(): Promise<string> {
  if (pendingCode) {
    const code = pendingCode;
    pendingCode = null;
    return Promise.resolve(code);
  }
  if (codeWaiter) codeWaiter.reject(new Error('superseded'));
  return new Promise<string>((resolve, reject) => {
    codeWaiter = { resolve, reject };
  });
}

// ── IPC surface (mirrors the preload bridge exactly) ────────────────────────
ipcMain.handle('studio:openExternal', async (_e: unknown, url: unknown) => {
  if (typeof url !== 'string') throw new Error('invalid url');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('invalid url');
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
    throw new Error('blocked url');
  }
  await shell.openExternal(parsed.toString());
});

ipcMain.handle('studio:authStart', () => startLoopback());
ipcMain.handle('studio:authAwait', () => awaitAuthCode());
ipcMain.handle('studio:authStop', () => {
  stopLoopback();
});

ipcMain.handle('studio:saveTokens', async (_e: unknown, json: unknown) => {
  if (typeof json !== 'string') throw new Error('invalid payload');
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8'); // headless/dev fallback (e.g. Linux CI without keyring)
  await fsp.writeFile(TOKEN_FILE(), data, { mode: 0o600 });
});

ipcMain.handle('studio:loadTokens', async () => {
  try {
    const data = await fsp.readFile(TOKEN_FILE());
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(data);
      } catch {
        return null;
      }
    }
    return data.toString('utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('studio:clearTokens', async () => {
  await fsp.rm(TOKEN_FILE(), { force: true });
});

ipcMain.handle('studio:getVersion', () => app.getVersion());
ipcMain.handle('studio:getFlags', () => ({ mock: MOCK, screenshotDir: SCREENSHOT_DIR }));

// ── Screenshot hooks (dev-only; used with --mock --screenshot-dir=PATH) ─────
ipcMain.handle('studio:captureScreenshot', async (_e: unknown, name: unknown) => {
  if (!SCREENSHOT_DIR || !mainWindow) return;
  if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) throw new Error('bad name');
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  const image = await mainWindow.webContents.capturePage();
  await fsp.writeFile(path.join(SCREENSHOT_DIR, `${name}.png`), image.toPNG());
});

ipcMain.handle('studio:screenshotsDone', () => {
  if (SCREENSHOT_DIR) app.quit();
});

// ── CORS bridge ─────────────────────────────────────────────────────────────
// The packaged renderer is served from file:// — an opaque "null" origin that
// the API's CORS allowlist rightly rejects. Rather than weakening the server,
// rewrite this app's outgoing Origin to the canonical web origin (the API
// treats Studio like the web app) and normalize the response
// Access-Control-Allow-Origin for the renderer's null origin. Auth is Bearer
// tokens only — no cookies are ever sent — so the wildcard is safe here.
function installCorsBridge(ses: Electron.Session): void {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders: Record<string, string> = { ...details.requestHeaders };
    if (/^https?:/i.test(details.url)) {
      for (const key of Object.keys(requestHeaders)) {
        if (key.toLowerCase() === 'origin') delete requestHeaders[key];
      }
      requestHeaders.Origin = 'https://www.cinnetemple.com';
    }
    callback({ requestHeaders });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string[]> = { ...(details.responseHeaders ?? {}) };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete responseHeaders[key];
    }
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    callback({ responseHeaders });
  });
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow(): void {
  const iconPath = path.join(__dirname, '../build/icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: APP_BG,
    title: 'CinneTemple Studio',
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  installCorsBridge(mainWindow.webContents.session);

  // Headless CORS-bridge proof (--probe-api): from the real file:// page,
  // run a simple GET and a preflighted (Authorization) request against the
  // live API, print PROBE lines to stdout, and exit.
  if (PROBE_API) {
    mainWindow.webContents.on('did-finish-load', () => {
      void mainWindow?.webContents
        .executeJavaScript(
          `(async () => {
             const base = 'https://api.cinnetemple.com';
             const out = [];
             try { const r = await fetch(base + '/v1/health'); out.push('simple:' + r.status); }
             catch (e) { out.push('simple:ERR ' + e); }
             try {
               const r = await fetch(base + '/v1/auth/me', { headers: { Authorization: 'Bearer probe' } });
               out.push('preflighted:' + r.status);
             } catch (e) { out.push('preflighted:ERR ' + e); }
             return out.join('\\n');
           })()`,
        )
        .then((result: unknown) => {
          console.log(`PROBE\n${String(result)}`);
          app.exit(0);
        })
        .catch((err: unknown) => {
          console.log(`PROBE\nfail:${String(err)}`);
          app.exit(1);
        });
    });
  }

  // The renderer never opens windows; any target=_blank is denied.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Hard block in-window navigation away from the app shell.
  mainWindow.webContents.on(
    'will-navigate',
    (event: { preventDefault: () => void }, url: string) => {
      const dev = process.env.VITE_DEV_SERVER_URL;
      if (!(dev && url.startsWith(dev)) && !url.startsWith('file:')) event.preventDefault();
    },
  );

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopLoopback();
  if (process.platform !== 'darwin') app.quit();
});
