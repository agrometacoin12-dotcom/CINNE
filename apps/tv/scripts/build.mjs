import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'dist');
const apiBaseUrl = process.env.TV_API_BASE_URL || 'https://api.cinnetemple.com';
const websiteUrl = process.env.TV_WEBSITE_URL || 'https://cinnetemple.com';
const hostedUrl = process.env.TV_WEBOS_APP_URL || 'https://cinnetemple.com/tv/webos/';
for (const raw of [apiBaseUrl, websiteUrl, hostedUrl]) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('TV endpoints must use HTTPS (HTTP is allowed only for local development).');
  }
}
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await rm(out, { recursive: true, force: true });
for (const platform of ['webos', 'vidaa']) {
  const dir = path.join(out, platform);
  await mkdir(dir, { recursive: true });
  await cp(path.join(root, 'public'), dir, { recursive: true });
  await build({ entryPoints: [path.join(root, 'src/app.js')], outfile: path.join(dir, 'app.js'), bundle: true,
    format: 'iife', target: ['chrome53'], minify: true, sourcemap: true, legalComments: 'none' });
  await build({ entryPoints: [path.join(root, 'public/app.css')], outfile: path.join(dir, 'app.css'),
    target: ['chrome53'], minify: true });
  await writeFile(path.join(dir, 'config.js'), 'window.CT_TV_CONFIG = ' + JSON.stringify({ platform, version, apiBaseUrl, websiteUrl }) + ';\n');
}
// A hosted webOS shell preserves an HTTPS origin compatible with backend CORS.
// The two website builds above must be hosted before this launcher is installed.
const launcher = path.join(out, 'webos-launcher');
await mkdir(launcher, { recursive: true });
await cp(path.join(root, 'public/icon.png'), path.join(launcher, 'icon.png'));
await cp(path.join(root, 'public/large-icon.png'), path.join(launcher, 'large-icon.png'));
await writeFile(path.join(launcher, 'appinfo.json'), JSON.stringify({
  id: 'com.cinnetemple.tv', version, vendor: 'CinneTemple', type: 'web', main: 'index.html', title: 'CinneTemple',
  icon: 'icon.png', largeIcon: 'large-icon.png', resolution: '1920x1080', disableBackHistoryAPI: true,
  appDescription: 'Stories worth the screen.', splashColor: '#090d18', requiredACG: []
}, null, 2) + '\n');
await writeFile(path.join(launcher, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>CinneTemple</title></head>' +
  '<body style="background:#090d18;color:white;font:28px Arial;padding:80px">Opening CinneTemple…<script src="launch.js"></script></body></html>');
await writeFile(path.join(launcher, 'launch.js'), 'window.location.replace(' + JSON.stringify(hostedUrl) + ');\n');
console.log('Built dist/webos, dist/vidaa and dist/webos-launcher.');
console.log('webOS launcher URL: ' + hostedUrl + ' (hosting is a separate deployment step).');
