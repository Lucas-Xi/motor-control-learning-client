#!/usr/bin/env node
/**
 * 视觉回归基线对比 — 简易版。
 *
 * 用法：
 *   1. 首次：`npm run qa:screenshots` 生成基线 → 提交到 git
 *   2. 改 UI 后：`npm run qa:screenshots` 覆盖产物，然后 `npm run qa:diff`
 *      → 脚本对比 git tracked 版本（基线）与工作区版本（新）的 PNG，
 *        用 sha256 比对每张图是否变化，列出 changed/unchanged/added/missing
 *      → 不做像素级 diff（要做像素级请上 pixelmatch + 跨 OS 字体渲染处理）
 *
 * 设计取舍：
 *   - 不引入额外 npm 依赖（pixelmatch / sharp），用 node:crypto 算哈希即可。
 *   - 不显示像素差异；只告诉你"哪些 PNG 变了"，再人工对照 git diff 查看。
 *   - 跨 OS / 字体 / GPU 差异会造成 false positive，所以这工具只在同机器同浏览器二次 run 才有意义。
 *
 * 退出码：
 *   - 0 = 无变化
 *   - 1 = 有变化（不一定是回归，可能是预期改动；CI 上用作"需要 review"信号）
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const SHOTS_DIR = join(ROOT, 'output', 'screenshots');

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function listPngs() {
  if (!existsSync(SHOTS_DIR)) {
    console.error(`Screenshots dir missing: ${SHOTS_DIR}\nRun \`npm run qa:screenshots\` first.`);
    process.exit(2);
  }
  return readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png')).sort();
}

function baselineSha(relPath) {
  // 用 git show HEAD:path 拿到基线字节。注意路径要 forward slash。
  const gitPath = relPath.replace(/\\/g, '/');
  try {
    const buf = execSync(`git show HEAD:${gitPath}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return sha(buf);
  } catch {
    return null;  // 文件在 HEAD 中不存在 → 新增
  }
}

function workingSha(absPath) {
  return sha(readFileSync(absPath));
}

const pngs = listPngs();
const changed = [];
const unchanged = [];
const added = [];

for (const name of pngs) {
  const relPath = `output/screenshots/${name}`;
  const absPath = join(SHOTS_DIR, name);
  const work = workingSha(absPath);
  const base = baselineSha(relPath);
  if (base === null) added.push(name);
  else if (base === work) unchanged.push(name);
  else changed.push({ name, base, work });
}

// 同时检测被删的基线
let missing = [];
try {
  const lsOut = execSync('git ls-files output/screenshots/', { encoding: 'utf-8' });
  const tracked = lsOut.split(/\r?\n/).filter((l) => l.endsWith('.png')).map((l) => l.split('/').pop());
  missing = tracked.filter((name) => !pngs.includes(name));
} catch {
  // 不在 git 仓库或没有基线，跳过
}

console.log(`\n视觉回归对比 — output/screenshots/`);
console.log(`  未变化: ${unchanged.length}`);
console.log(`  有变化: ${changed.length}`);
console.log(`  新增:   ${added.length}`);
console.log(`  缺失:   ${missing.length}`);

if (changed.length > 0) {
  console.log(`\n=== Changed ===`);
  for (const c of changed) {
    console.log(`  ${c.name}  base=${c.base}  work=${c.work}`);
  }
}
if (added.length > 0) {
  console.log(`\n=== Added (not in HEAD) ===`);
  for (const a of added) console.log(`  ${a}`);
}
if (missing.length > 0) {
  console.log(`\n=== Missing (in HEAD but not produced) ===`);
  for (const m of missing) console.log(`  ${m}`);
}

if (changed.length === 0 && added.length === 0 && missing.length === 0) {
  console.log('\n✓ 与基线完全一致。');
  process.exit(0);
}

console.log('\n⚠ 视觉发生变化——请用 `git diff -- output/screenshots/*.png` 或图像查看器人工对照。');
console.log('  如果改动符合预期，`git add` 并提交即可形成新基线。');
process.exit(1);
