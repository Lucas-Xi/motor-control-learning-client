import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = 'dist/assets';
const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
const rows = files.map((f) => {
  const buf = readFileSync(join(dir, f));
  const gz = gzipSync(buf, { level: 9 });
  return { name: f, raw: buf.length, gz: gz.length };
}).sort((a, b) => b.raw - a.raw);

console.log('NAME\tRAW\tGZIP');
for (const r of rows) console.log(`${r.name}\t${r.raw}\t${r.gz}`);
const tot = rows.reduce((a, b) => ({ raw: a.raw + b.raw, gz: a.gz + b.gz }), { raw: 0, gz: 0 });
console.log(`TOTAL_ASSETS\t${tot.raw}\t${tot.gz}`);

try {
  const html = readFileSync('dist/index.html');
  console.log(`index.html\t${html.length}\t${gzipSync(html, { level: 9 }).length}`);
} catch {}
