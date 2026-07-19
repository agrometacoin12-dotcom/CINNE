// Converts build/icon.png into build/icon.ico for the Windows installer.
// electron-builder picks up build/icon.ico automatically (win.icon).
import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'build/icon.png');
const out = path.join(root, 'build/icon.ico');

const png = await readFile(src);
const ico = await pngToIco(png);
await writeFile(out, ico);
console.log(`wrote ${out} (${ico.length} bytes)`);
