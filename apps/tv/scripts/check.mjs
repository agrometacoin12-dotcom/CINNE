import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../src/', import.meta.url));
for (const file of readdirSync(source).filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', source + file]);
console.log('TV JavaScript syntax checked.');
