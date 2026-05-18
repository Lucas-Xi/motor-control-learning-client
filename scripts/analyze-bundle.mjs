#!/usr/bin/env node
// 性能审计：解析 dist/assets/，列 top 20 chunk + raw/gzip/比例 + 总览。
// 无外部依赖，专门替代 vite-bundle-visualizer / rollup-plugin-visualizer。
// 用法：node scripts/analyze-bundle.mjs [topN]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = 'dist/assets';
const topN = Number(process.argv[2] ?? 20);

if (!existsSync(dir)) {
  console.error(`未找到 ${dir}，请先 npm run build`);
  process.exit(1);
}

/** 递归收集所有 js / css / 图片文件 */
function walk(d) {
  const out = [];
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push({ path: p, name, size: s.size });
  }
  return out;
}

const all = walk(dir);
const jsCss = all.filter((f) => /\.(js|css)$/.test(f.name));
const images = all.filter((f) => /\.(png|webp|jpg|jpeg|svg)$/i.test(f.name));

const rows = jsCss.map((f) => {
  const buf = readFileSync(f.path);
  const gz = gzipSync(buf, { level: 9 });
  return { name: f.name, raw: buf.length, gz: gz.length };
}).sort((a, b) => b.raw - a.raw);

const tot = rows.reduce((a, b) => ({ raw: a.raw + b.raw, gz: a.gz + b.gz }), { raw: 0, gz: 0 });

// index.html
let htmlRaw = 0;
let htmlGz = 0;
if (existsSync('dist/index.html')) {
  const html = readFileSync('dist/index.html');
  htmlRaw = html.length;
  htmlGz = gzipSync(html, { level: 9 }).length;
}

const kb = (n) => (n / 1024).toFixed(1);
const pct = (n, t) => ((n / t) * 100).toFixed(1) + '%';

console.log(`\nTOP ${Math.min(topN, rows.length)} CHUNKS (sorted by raw size):`);
console.log('rank  raw_kb   gz_kb    raw%     gz%      name');
console.log('----  ------   -----    ----     ----     --------------------------------');
for (let i = 0; i < Math.min(topN, rows.length); i++) {
  const r = rows[i];
  console.log(`${String(i + 1).padStart(4)}  ${kb(r.raw).padStart(6)}   ${kb(r.gz).padStart(5)}    ${pct(r.raw, tot.raw).padStart(6)}   ${pct(r.gz, tot.gz).padStart(6)}   ${r.name}`);
}

console.log(`\nSUMMARY:`);
console.log(`  total chunks   : ${rows.length}`);
console.log(`  total raw      : ${kb(tot.raw)} KB`);
console.log(`  total gzip     : ${kb(tot.gz)} KB`);
console.log(`  index.html     : ${kb(htmlRaw)} KB raw / ${kb(htmlGz)} KB gz`);

// 图片审计（dist 目录里的图片，主要是 public/assets/generated 拷过来的）
if (images.length) {
  const imgTot = images.reduce((a, b) => a + b.size, 0);
  console.log(`\nIMAGES (dist):`);
  console.log(`  count          : ${images.length}`);
  console.log(`  total raw      : ${kb(imgTot)} KB`);
  const byExt = images.reduce((acc, f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    acc[ext] = (acc[ext] ?? 0) + f.size;
    return acc;
  }, {});
  for (const [ext, sz] of Object.entries(byExt).sort((a, b) => b[1] - a[1])) {
    console.log(`    .${ext.padEnd(5)} : ${kb(sz)} KB`);
  }
}

// 分类汇总：vendor (charts/three/motion/react-vendor/lucide-icons) vs app vs lazy module
console.log(`\nBY CATEGORY (raw / gz KB):`);
const categories = {
  'vendor (charts/three/motion/react/lucide)': /^(charts|three|motion|react-vendor|lucide-icons)-/,
  'index entry': /^index-/,
  'module page (kebab-case-X.js)': /^[a-z][a-z0-9-]*-[A-Za-z0-9_]{6,}\.js$/,
  'Module wrapper (PascalCase-X.js)': /^[A-Z][A-Za-z0-9]+-[A-Za-z0-9_]{6,}\.js$/,
  'css': /\.css$/,
};
for (const [label, re] of Object.entries(categories)) {
  const subset = rows.filter((r) => re.test(r.name));
  const subRaw = subset.reduce((a, b) => a + b.raw, 0);
  const subGz = subset.reduce((a, b) => a + b.gz, 0);
  console.log(`  ${label.padEnd(48)} ${String(subset.length).padStart(3)} files  ${kb(subRaw).padStart(8)} / ${kb(subGz).padStart(6)} KB`);
}

// 机器可读末行：脚本调用者拿一行就行
console.log(`\nTOTAL_JS_CSS_RAW=${tot.raw} TOTAL_JS_CSS_GZ=${tot.gz} CHUNKS=${rows.length} INDEX_HTML_GZ=${htmlGz}`);
