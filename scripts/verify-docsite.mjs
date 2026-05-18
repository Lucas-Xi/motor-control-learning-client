// scripts/verify-docsite.mjs
// 验证 docs/site/ 产物完整性：所有页面、所有模块链接、术语 / 公式 / 故障覆盖、搜索索引可用。
//
// 退出码：0 = 通过；1 = 失败（CI / npm script 失败传递）。
// 设计：纯静态文件读取 + 字符串包含断言；不需要启动浏览器或 Web 服务器。

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = join(ROOT, 'docs', 'site');

const MODULE_IDS = [
  'motor-basics',
  'three-phase',
  'clarke-transform',
  'park-transform',
  'pid-control',
  'foc-flow',
  'svpwm',
  'inverter',
  'control-loops',
  'sensorless-foc',
  'field-weakening',
  'faults-debugging',
  'hfi-sensorless',
  'startup-statemachine',
  'apf-frontend',
  'refrigeration-bench',
  'assembly-workshop',
];

const failures = [];
const evidence = [];

function fail(msg) { failures.push(msg); }
function ok(msg) { evidence.push(msg); }

function read(rel) {
  const p = join(SITE, rel);
  if (!existsSync(p)) {
    fail(`Missing file: ${rel}`);
    return '';
  }
  return readFileSync(p, 'utf8');
}

// 1. 站点根存在
if (!existsSync(SITE)) {
  console.error('[verify-docsite] FAIL: docs/site/ 不存在；请先运行 npm run docsite');
  process.exit(1);
}

// 2. 5 个根级页面
const indexHtml = read('index.html');
const glossaryHtml = read('glossary.html');
const formulasHtml = read('formulas.html');
const faultsHtml = read('faults.html');
const searchHtml = read('search.html');
ok('index.html / glossary.html / formulas.html / faults.html / search.html 已生成');

// 3. search.json 存在且为合法 JSON 数组
let searchIdx = [];
try {
  const raw = read('search.json');
  searchIdx = JSON.parse(raw);
  if (!Array.isArray(searchIdx)) fail('search.json 不是数组');
  else ok(`search.json 含 ${searchIdx.length} 条记录`);
} catch (e) {
  fail('search.json 解析失败: ' + e.message);
}

// 4. index.html 含全部 17 模块链接
for (const id of MODULE_IDS) {
  if (!indexHtml.includes(`module/${id}.html`)) {
    fail(`index.html 缺少模块链接: ${id}`);
  }
}
ok(`index.html 含 ${MODULE_IDS.length} 个模块链接`);

// 5. 17 个模块详情页 + 至少 16 个 walkthrough 详情页（assembly-workshop 是 17 个走廊里的一个）
const moduleDir = join(SITE, 'module');
const walkDir = join(SITE, 'walkthrough');
for (const id of MODULE_IDS) {
  const p = join(moduleDir, `${id}.html`);
  if (!existsSync(p)) fail(`module/${id}.html 缺失`);
}
ok(`module/ 含 ${readdirSync(moduleDir).length} 个页面`);

const walkFiles = existsSync(walkDir) ? readdirSync(walkDir).filter((f) => f.endsWith('.html')) : [];
if (walkFiles.length < 16) {
  fail(`walkthrough 详情页少于 16：实际 ${walkFiles.length}`);
} else {
  ok(`walkthrough/ 含 ${walkFiles.length} 个详情页`);
}

// 6. glossary.html 包含术语关键字（覆盖前 5 个核心术语）
for (const term of ['FOC', 'SVPWM', '电角度', 'PLL']) {
  if (!glossaryHtml.includes(term)) fail(`glossary.html 缺少术语: ${term}`);
}
ok('glossary.html 含核心术语 FOC / SVPWM / 电角度 / PLL');
// 搜索控件
if (!glossaryHtml.includes('gs-input')) fail('glossary.html 缺少搜索 input#gs-input');
else ok('glossary.html 含搜索控件');

// 7. formulas.html 含关键公式名（Clarke / Park / SVPWM）
for (const k of ['Clarke 变换', 'Park 变换', 'SVPWM 调制比']) {
  if (!formulasHtml.includes(k)) fail(`formulas.html 缺少公式: ${k}`);
}
ok('formulas.html 含核心公式');

// 8. faults.html 含 14 类核心故障 id（与 faultCases.ts 中 FaultType 枚举对应）
const faultIds = [
  'over-current', 'phase-loss', 'current-offset', 'phase-order', 'encoder-angle',
  'speed-oscillation', 'voltage-saturation', 'startup-fail', 'liquid-slugging',
  'locked-rotor', 'dc-undervolt', 'over-temp', 'vibration', 'oil-low',
];
for (const fid of faultIds) {
  if (!faultsHtml.includes(fid)) fail(`faults.html 缺少故障: ${fid}`);
}
ok(`faults.html 含 ${faultIds.length} 类故障`);

// 9. 打印按钮 + @media print 在每个页面
const pagesToCheck = ['index.html', 'glossary.html', 'formulas.html', 'faults.html', 'search.html'];
for (const p of pagesToCheck) {
  const html = read(p);
  if (!html.includes('window.print()')) fail(`${p} 缺少打印按钮（window.print()）`);
  if (!html.includes('@media print')) fail(`${p} 缺少 @media print CSS`);
}
ok('5 个根页面均含打印按钮 + @media print CSS');

// 10. 模块详情页随机抽 motor-basics 检查关键字段
const motorBasicsHtml = read('module/motor-basics.html');
for (const must of ['电机基础', '极对数', 'STM32', 'walkthrough/motor-basics.html']) {
  if (!motorBasicsHtml.includes(must)) fail(`module/motor-basics.html 缺少: ${must}`);
}
ok('module/motor-basics.html 字段齐全');

// 11. walkthrough 抽 motor-basics 检查 step + pitfall + quiz
const wMotor = walkFiles.includes('motor-basics.html') ? read('walkthrough/motor-basics.html') : '';
if (wMotor) {
  for (const must of ['Step 1', 'Pitfall', '随堂题', '误区']) {
    // "Pitfall" 大小写不敏感
    const re = new RegExp(must, 'i');
    if (!re.test(wMotor)) {
      if (must === 'Pitfall' && wMotor.includes('误区')) continue; // 中文也算
      fail(`walkthrough/motor-basics.html 缺少字段: ${must}`);
    }
  }
  ok('walkthrough/motor-basics.html 字段齐全（Step / 误区 / 随堂题）');
}

// 12. 搜索索引覆盖 4 大类：模块 / Walkthrough Step / 术语 / 公式 / 故障
const kinds = new Set(searchIdx.map((r) => r.kind));
for (const k of ['模块', 'Walkthrough Step', '术语', '公式', '故障']) {
  if (!kinds.has(k)) fail(`search.json 缺少 kind: ${k}`);
}
ok(`search.json 覆盖 kinds: ${[...kinds].join(', ')}`);

// 13. 站点总大小、文件数（参考性，不严格断言）
function dirStats(dir) {
  let files = 0, bytes = 0;
  function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p); else { files++; bytes += st.size; }
    }
  }
  walk(dir);
  return { files, bytes };
}
const stats = dirStats(SITE);
const sizeStr = stats.bytes < 1024 * 1024
  ? (stats.bytes / 1024).toFixed(1) + ' KB'
  : (stats.bytes / 1024 / 1024).toFixed(2) + ' MB';

// 输出汇总
console.log('');
if (failures.length) {
  console.error('[verify-docsite] FAILED:');
  for (const f of failures) console.error('  - ' + f);
  console.error('');
  console.error(`  通过的检查项: ${evidence.length}`);
  for (const e of evidence) console.error('    OK  ' + e);
  process.exit(1);
}

console.log('[verify-docsite] PASSED  ' + evidence.length + ' 项检查');
for (const e of evidence) console.log('  OK  ' + e);
console.log('');
console.log(`[verify-docsite] 站点统计：files=${stats.files}  size=${sizeStr}  search-records=${searchIdx.length}`);
