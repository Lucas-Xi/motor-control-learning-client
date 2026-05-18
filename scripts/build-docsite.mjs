// scripts/build-docsite.mjs
// 把 src/content/{lessons,walkthroughs/*,formulas,glossary,faultCases}.ts 静态化成可托管 HTML 站点。
//
// 设计原则：
//   - 不引入新 npm 依赖；esbuild 已在 devDeps 中（vite 间接安装），用它把 TS 内容文件转成 ESM。
//   - 转译产物落在 node_modules/.cache/docsite/ 临时目录，再用 `import()` 动态加载（绕过 import 限制）。
//   - 输出 HTML 用纯字符串拼接，内联 CSS；除 search.html 外无任何 JS。
//   - 视觉令牌与主应用一致：accent.primary cyan / measure mint / warn amber / fault rose；dark 主题默认。
//
// 与 verify-project.mjs 解耦：脚本可独立运行；docsite 不属于 release:audit 强制步骤。

import { build as esbuild } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_CONTENT = join(ROOT, 'src', 'content');
const WALK_DIR = join(SRC_CONTENT, 'walkthroughs');
const OUT_DIR = join(ROOT, 'docs', 'site');
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'docsite');

const MODULE_ORDER = [
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

// 4 条学习主线（与 Sidebar 分组语义对齐）
const CURRICULA = [
  { id: 'foundation', title: '主线 A：电机与坐标变换', modules: ['motor-basics', 'three-phase', 'clarke-transform', 'park-transform'] },
  { id: 'controller', title: '主线 B：FOC 与调制', modules: ['pid-control', 'foc-flow', 'svpwm', 'inverter', 'control-loops'] },
  { id: 'advanced', title: '主线 C：无感 / 弱磁 / 启动', modules: ['sensorless-foc', 'hfi-sensorless', 'field-weakening', 'startup-statemachine'] },
  { id: 'system', title: '主线 D：系统级（故障 / APF / 制冷台架 / 装配）', modules: ['faults-debugging', 'apf-frontend', 'refrigeration-bench', 'assembly-workshop'] },
];

// 模块标题映射（与 presets.ts 一致；这里硬编码避免引入额外 TS）
const MODULE_META = {
  'motor-basics': { stage: '01', title: '电机基础', subtitle: '结构、极对数、电角度与机械角度' },
  'three-phase': { stage: '02', title: '三相正弦波与旋转磁场', subtitle: '观察三相电流如何合成旋转磁场' },
  'clarke-transform': { stage: '03', title: 'Clarke 变换', subtitle: 'abc 到 alpha-beta 的投影' },
  'park-transform': { stage: '04', title: 'Park 变换', subtitle: 'alpha-beta 到 dq 同步旋转坐标' },
  'pid-control': { stage: '05', title: 'PID 控制', subtitle: 'P/I/D、限幅和抗积分饱和' },
  'foc-flow': { stage: '06', title: 'FOC 总体流程', subtitle: '采样、变换、电流环、SVPWM 闭环链路' },
  svpwm: { stage: '07', title: 'SVPWM', subtitle: '空间电压矢量、扇区、T1/T2/T0' },
  inverter: { stage: '08', title: '三相逆变器', subtitle: '桥臂、PWM、死区和线电压' },
  'control-loops': { stage: '09', title: '电流环 / 速度环 / 位置环', subtitle: '内环快、外环慢和参数整定' },
  'sensorless-foc': { stage: '10', title: '无感 FOC / 观测器', subtitle: '反电动势、SMO、PLL 与开闭环切换' },
  'field-weakening': { stage: '11', title: '弱磁控制', subtitle: '电压极限、负 Id、恒功率区' },
  'faults-debugging': { stage: '12', title: '故障与调试', subtitle: '波形现象、原因定位与 STM32 排查路径' },
  'hfi-sensorless': { stage: '13', title: 'HFI 高频注入低速无感', subtitle: '凸极比解调 + 零速启动的压缩机标配方案' },
  'startup-statemachine': { stage: '14', title: '压缩机启动状态机', subtitle: 'V/f → HFI → BEMF → 弱磁全过程' },
  'apf-frontend': { stage: '15', title: 'APF 前级 PFC', subtitle: '单相 220V → Boost PFC → 直流母线' },
  'refrigeration-bench': { stage: '16', title: '制冷系统台架', subtitle: '蒸气压缩循环 + 工况输入 + 与 FOC 闭环耦合' },
  'assembly-workshop': { stage: '17', title: '装配工坊', subtitle: '搭积木式 FOC 调参实战' },
};

// ============================================================================
// 1. 内容加载：用 esbuild 把 TS 文件打成单个 ESM bundle，写到 cache 后 dynamic import
// ============================================================================

async function transpileAndImport(entryAbs, outName) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const outFile = join(CACHE_DIR, outName + '.mjs');
  await esbuild({
    entryPoints: [entryAbs],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    outfile: outFile,
    logLevel: 'silent',
    // 内容文件只 import type；任何残留的 type 都被 esbuild 自动剥离
  });
  return import(pathToFileURL(outFile).href);
}

async function loadContent() {
  const lessonsMod = await transpileAndImport(join(SRC_CONTENT, 'lessons.ts'), 'lessons');
  const formulasMod = await transpileAndImport(join(SRC_CONTENT, 'formulas.ts'), 'formulas');
  const glossaryMod = await transpileAndImport(join(SRC_CONTENT, 'glossary.ts'), 'glossary');
  const faultCasesMod = await transpileAndImport(join(SRC_CONTENT, 'faultCases.ts'), 'faultCases');

  const walkthroughs = {};
  const walkFiles = readdirSync(WALK_DIR).filter(
    (f) => f.endsWith('.ts') && !['index.ts', 'types.ts'].includes(f) && !statSync(join(WALK_DIR, f)).isDirectory()
  );
  for (const f of walkFiles) {
    const moduleId = f.replace(/\.ts$/, '');
    const mod = await transpileAndImport(join(WALK_DIR, f), `walk-${moduleId}`);
    // 每个 walkthrough 文件 export 一个命名变量，例如 motorBasicsWalkthrough。
    // 我们暴力遍历 module exports 找到第一个含 moduleId 字段的对象。
    for (const key of Object.keys(mod)) {
      const v = mod[key];
      if (v && typeof v === 'object' && v.moduleId && Array.isArray(v.steps)) {
        walkthroughs[v.moduleId] = v;
        break;
      }
    }
  }

  return {
    lessons: lessonsMod.lessons ?? {},
    formulas: formulasMod.formulaIndex ?? [],
    glossary: glossaryMod.glossary ?? [],
    faultCases: faultCasesMod.faultCases ?? {},
    walkthroughs,
  };
}

// ============================================================================
// 2. HTML 模板与转义
// ============================================================================

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 视觉令牌：与主应用 tailwind.config.js / index.css 对齐
const CSS = `
:root {
  --bg-deep: 7 12 25;
  --bg-panel: 13 23 44;
  --bg-card: 18 29 56;
  --line: 36 58 102;
  --ink-primary: 226 232 255;
  --ink-secondary: 153 173 217;
  --ink-muted: 110 132 178;
  --accent-primary: 86 207 255;
  --accent-measure: 95 232 178;
  --accent-warn: 251 191 36;
  --accent-fault: 251 113 133;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: rgb(var(--bg-deep));
  color: rgb(var(--ink-primary));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.7;
}
a { color: rgb(var(--accent-primary)); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, .mono {
  font-family: "JetBrains Mono", "Fira Code", "Consolas", "SF Mono", monospace;
  font-size: 13px;
}
pre {
  background: rgb(var(--bg-card));
  border: 1px solid rgb(var(--line) / 0.6);
  border-radius: 6px;
  padding: 14px 16px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
code:not(pre code) {
  background: rgb(var(--bg-card));
  padding: 2px 6px;
  border-radius: 4px;
  color: rgb(var(--accent-measure));
}
:focus-visible {
  outline: 2px solid rgb(var(--accent-primary));
  outline-offset: 2px;
}

/* 顶部导航 */
.topbar {
  position: sticky; top: 0; z-index: 30;
  background: rgb(var(--bg-panel) / 0.95);
  border-bottom: 1px solid rgb(var(--line));
  padding: 12px 24px;
  display: flex; align-items: center; gap: 20px;
  backdrop-filter: blur(6px);
}
.topbar .brand {
  font-weight: 600; font-size: 16px;
  color: rgb(var(--accent-primary));
}
.topbar nav { display: flex; gap: 18px; flex-wrap: wrap; }
.topbar nav a { color: rgb(var(--ink-secondary)); font-size: 14px; }
.topbar nav a.active, .topbar nav a:hover { color: rgb(var(--ink-primary)); }
.topbar .right { margin-left: auto; }

/* 主布局 */
.layout {
  max-width: 1080px;
  margin: 24px auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 220px 1fr 200px;
  gap: 28px;
}
.sidebar, .toc {
  font-size: 13px;
  position: sticky; top: 76px; align-self: start;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}
.sidebar h3, .toc h3 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: rgb(var(--ink-muted));
  margin: 16px 0 8px;
}
.sidebar a, .toc a {
  display: block; padding: 4px 0;
  color: rgb(var(--ink-secondary));
}
.sidebar a:hover, .toc a:hover { color: rgb(var(--ink-primary)); }
.sidebar a.active { color: rgb(var(--accent-primary)); font-weight: 500; }

.content {
  min-width: 0;
}
.content h1 {
  font-size: 28px; line-height: 1.3;
  margin: 0 0 8px;
}
.content h2 {
  font-size: 20px; margin: 36px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgb(var(--line));
}
.content h3 { font-size: 16px; margin: 24px 0 8px; color: rgb(var(--accent-primary)); }
.content p { margin: 8px 0; color: rgb(var(--ink-primary)); }
.content ul, .content ol { padding-left: 22px; }
.content li { margin: 4px 0; }
.subtitle {
  color: rgb(var(--ink-muted)); font-size: 14px; margin-bottom: 24px;
}
.stage-chip {
  display: inline-block; padding: 2px 8px;
  background: rgb(var(--accent-primary) / 0.15);
  color: rgb(var(--accent-primary));
  border-radius: 4px;
  font-size: 12px; font-weight: 600;
  margin-right: 8px; vertical-align: middle;
}

/* 卡片与块 */
.card {
  background: rgb(var(--bg-panel));
  border: 1px solid rgb(var(--line));
  border-radius: 8px;
  padding: 16px 18px;
  margin: 12px 0;
}
.card.measure { border-left: 3px solid rgb(var(--accent-measure)); }
.card.warn { border-left: 3px solid rgb(var(--accent-warn)); }
.card.fault { border-left: 3px solid rgb(var(--accent-fault)); }
.card.primary { border-left: 3px solid rgb(var(--accent-primary)); }
.card .label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: rgb(var(--ink-muted));
  margin-bottom: 6px;
}
.formula {
  font-family: "JetBrains Mono", monospace;
  background: rgb(var(--bg-card));
  padding: 8px 12px; border-radius: 4px;
  margin: 6px 0;
  color: rgb(var(--accent-measure));
  overflow-x: auto;
}

/* 主页 grid */
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin: 16px 0 32px;
}
.module-tile {
  display: block;
  background: rgb(var(--bg-panel));
  border: 1px solid rgb(var(--line));
  border-radius: 8px;
  padding: 14px;
  color: rgb(var(--ink-primary));
  transition: border-color 0.15s, transform 0.15s;
}
.module-tile:hover {
  border-color: rgb(var(--accent-primary));
  transform: translateY(-1px);
  text-decoration: none;
}
.module-tile .stage {
  color: rgb(var(--accent-primary)); font-size: 12px; font-weight: 600;
}
.module-tile .ttl { font-size: 15px; margin: 4px 0; font-weight: 500; }
.module-tile .sub { font-size: 12px; color: rgb(var(--ink-muted)); }

/* walkthrough step */
.step {
  background: rgb(var(--bg-panel));
  border: 1px solid rgb(var(--line));
  border-radius: 8px;
  padding: 16px 18px;
  margin: 14px 0;
}
.step .step-no {
  color: rgb(var(--accent-primary));
  font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.step h3 {
  color: rgb(var(--ink-primary));
  margin: 4px 0 12px;
}
.step .field {
  margin: 8px 0; display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px; font-size: 14px;
}
.step .field-label {
  color: rgb(var(--ink-muted));
  font-size: 12px;
}
.quiz {
  margin-top: 12px; padding: 12px;
  background: rgb(var(--accent-primary) / 0.06);
  border-radius: 6px;
  border-left: 3px solid rgb(var(--accent-primary));
}
.quiz .q { font-weight: 500; margin-bottom: 8px; }
.quiz ol { margin: 6px 0; }
.quiz .correct { color: rgb(var(--accent-measure)); font-weight: 500; }
.quiz .hint {
  margin-top: 8px; font-size: 13px;
  color: rgb(var(--ink-muted));
  font-style: italic;
}
.pitfall {
  background: rgb(var(--accent-warn) / 0.08);
  border-left: 3px solid rgb(var(--accent-warn));
  border-radius: 6px;
  padding: 12px 14px;
  margin: 10px 0;
}
.pitfall .label { color: rgb(var(--accent-warn)); font-size: 12px; font-weight: 600; }

/* 故障速查 */
.fault-card {
  background: rgb(var(--bg-panel));
  border-left: 3px solid rgb(var(--accent-fault));
  border-radius: 8px;
  padding: 16px 18px; margin: 12px 0;
}
.fault-card h3 { color: rgb(var(--accent-fault)); margin-top: 0; }

/* 术语表 */
.glossary-list { display: grid; grid-template-columns: 1fr; gap: 8px; }
.glossary-item {
  background: rgb(var(--bg-panel));
  border: 1px solid rgb(var(--line));
  border-radius: 6px;
  padding: 10px 14px;
}
.glossary-item .term {
  font-weight: 600; color: rgb(var(--accent-primary));
  font-size: 15px;
}
.glossary-item .def {
  font-size: 13px; color: rgb(var(--ink-secondary)); margin-top: 4px;
}
.glossary-search input {
  width: 100%; padding: 10px 14px;
  background: rgb(var(--bg-card));
  border: 1px solid rgb(var(--line));
  border-radius: 6px;
  color: rgb(var(--ink-primary)); font-size: 14px;
  margin-bottom: 14px;
}

/* 按钮 */
.btn {
  display: inline-block;
  padding: 6px 14px;
  background: rgb(var(--accent-primary) / 0.15);
  color: rgb(var(--accent-primary));
  border: 1px solid rgb(var(--accent-primary) / 0.4);
  border-radius: 4px;
  font-size: 13px; cursor: pointer;
  font-family: inherit;
}
.btn:hover { background: rgb(var(--accent-primary) / 0.25); }

/* 课程主线 */
.curriculum {
  background: rgb(var(--bg-panel));
  border-left: 3px solid rgb(var(--accent-measure));
  border-radius: 6px;
  padding: 12px 16px;
  margin: 10px 0;
}
.curriculum .ttl { font-weight: 600; color: rgb(var(--accent-measure)); margin-bottom: 4px; }
.curriculum .mods { font-size: 13px; color: rgb(var(--ink-secondary)); }

/* 移动端 */
@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 0 16px;
  }
  .sidebar, .toc {
    position: static; max-height: none;
    border-bottom: 1px solid rgb(var(--line));
    padding-bottom: 12px;
  }
  .topbar { padding: 10px 16px; flex-wrap: wrap; }
  .topbar nav { gap: 10px; }
  .content h1 { font-size: 22px; }
}

/* 打印模式：隐藏导航 + 大字号 + 分页符 + 浅色主题 */
@media print {
  :root {
    color-scheme: light;
  }
  html, body {
    background: #fff; color: #000;
    font-size: 13pt; line-height: 1.5;
  }
  .topbar, .sidebar, .toc, .print-btn, .glossary-search {
    display: none !important;
  }
  .layout {
    grid-template-columns: 1fr;
    max-width: 100%;
    padding: 0;
    margin: 0;
  }
  .content { color: #000; }
  .content h1, .content h2, .content h3 { color: #000; }
  .content h2 { page-break-before: auto; page-break-after: avoid; }
  .content h3 { page-break-after: avoid; }
  .step, .card, .pitfall, .fault-card, .glossary-item, .module-tile, .curriculum {
    page-break-inside: avoid;
    background: #fff; color: #000;
    border-color: #ccc;
  }
  .step .step-no, .step .field-label, .stage-chip,
  .pitfall .label, .glossary-item .term, .fault-card h3, .quiz .correct,
  .formula, .curriculum .ttl, .module-tile .stage, .content h3 {
    color: #000 !important;
  }
  a { color: #000; text-decoration: underline; }
  a::after { content: ""; }
  pre, code:not(pre code), .formula {
    background: #f4f4f4; color: #000;
    border: 1px solid #ccc;
  }
}
`;

function pageShell({ title, currentNav, body, includeSearch = false }) {
  const navLinks = [
    { href: 'index.html', label: '首页', key: 'home' },
    { href: 'glossary.html', label: '术语表', key: 'glossary' },
    { href: 'formulas.html', label: '公式集', key: 'formulas' },
    { href: 'faults.html', label: '故障速查', key: 'faults' },
    { href: 'search.html', label: '搜索', key: 'search' },
  ];
  const navHtml = navLinks
    .map((l) => `<a href="${l.href}"${currentNav === l.key ? ' class="active"' : ''}>${l.label}</a>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} · 电机控制学习文档</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="topbar" role="banner">
    <div class="brand">电机控制学习文档</div>
    <nav role="navigation" aria-label="主导航">${navHtml}</nav>
    <div class="right"><button class="btn print-btn" onclick="window.print()">打印</button></div>
  </header>
  ${body}
</body>
</html>`;
}

function sidebarHtml(currentModuleId) {
  let html = '<aside class="sidebar" role="navigation" aria-label="模块导航"><h3>16 模块</h3>';
  for (const id of MODULE_ORDER) {
    const m = MODULE_META[id];
    if (!m) continue;
    const active = id === currentModuleId ? ' class="active"' : '';
    html += `<a href="module/${id}.html"${active}>${m.stage} · ${esc(m.title)}</a>`;
  }
  html += '<h3>索引页</h3>';
  html += '<a href="glossary.html">术语表</a>';
  html += '<a href="formulas.html">公式集</a>';
  html += '<a href="faults.html">故障速查</a>';
  html += '<a href="search.html">站内搜索</a>';
  html += '</aside>';
  return html;
}

// 相对路径修复：模块详情页 / walkthrough 详情页位于子目录
function rebaseHtml(html, depth) {
  if (depth === 0) return html;
  const prefix = '../'.repeat(depth);
  // 简单粗暴替换 href="xxx" 中以 [a-z] 开头的相对路径
  return html
    .replace(/href="([a-z][\w./-]*\.html)"/g, (_, p) => `href="${prefix}${p}"`)
    .replace(/href="module\//g, `href="${prefix}module/`)
    .replace(/href="walkthrough\//g, `href="${prefix}walkthrough/`);
}

// ============================================================================
// 3. 各页面生成
// ============================================================================

function renderIndex({ lessons, walkthroughs }) {
  let body = '<main class="layout">';
  body += sidebarHtml(null);
  body += '<article class="content">';
  body += '<h1>电机控制学习文档</h1>';
  body += '<p class="subtitle">交互式 BLDC / PMSM / FOC / SVPWM 学习客户端的静态文档形态。覆盖 17 个核心模块、'
       + Object.keys(walkthroughs).length + ' 个深度 walkthrough、30+ 公式、50+ 术语、14 类典型故障。</p>';

  body += '<h2>4 条学习主线</h2>';
  for (const c of CURRICULA) {
    const mods = c.modules
      .filter((m) => MODULE_META[m])
      .map((m) => `<a href="module/${m}.html">${MODULE_META[m].stage} ${esc(MODULE_META[m].title)}</a>`)
      .join(' · ');
    body += `<div class="curriculum"><div class="ttl">${esc(c.title)}</div><div class="mods">${mods}</div></div>`;
  }

  body += '<h2>17 模块速查</h2>';
  body += '<div class="module-grid">';
  for (const id of MODULE_ORDER) {
    const m = MODULE_META[id];
    if (!m) continue;
    body += `<a class="module-tile" href="module/${id}.html">`
         + `<div class="stage">${m.stage}</div>`
         + `<div class="ttl">${esc(m.title)}</div>`
         + `<div class="sub">${esc(m.subtitle)}</div>`
         + '</a>';
  }
  body += '</div>';

  body += '<h2>如何使用本站</h2>';
  body += '<ul>'
       + '<li>每个模块页含中文讲义（学习目标 / 概念 / 公式 / 工程意义 / STM32 指南 / 常见误区 / 调试方法 / 实验 / 总结）。</li>'
       + '<li><a href="walkthrough/motor-basics.html">深度 walkthrough</a> 含 5-9 步操作 → 观察 → 为什么 → 随堂题流程；适合打印当纸质教材。</li>'
       + '<li><a href="glossary.html">术语表</a> 支持站内搜索；<a href="formulas.html">公式集</a> 按模块分组；<a href="faults.html">故障速查</a> 含 STM32 调试要点。</li>'
       + '<li>每一页右上角的"打印"按钮触发浏览器打印，CSS 已做打印优化（隐藏导航 + 浅色主题 + 分页符）。</li>'
       + '</ul>';

  body += '</article>';
  body += '<aside class="toc"></aside>';
  body += '</main>';
  return pageShell({ title: '首页', currentNav: 'home', body });
}

function renderModulePage(moduleId, { lessons, walkthroughs, formulas, faultCases }) {
  const meta = MODULE_META[moduleId] || { stage: '—', title: moduleId, subtitle: '' };
  const lesson = lessons[moduleId];
  const walk = walkthroughs[moduleId];
  // 关联公式：在 formulaIndex 中匹配 expression / name 含 moduleId 关键字（简版）
  const relatedFormulas = (formulas || []).filter((f) => {
    const text = (f.name + ' ' + f.expression).toLowerCase();
    return text.includes(moduleId.split('-')[0]);
  });
  // 关联故障：扫所有 faultCases；本模块主要关联 'faults-debugging'，否则只在 fault page 列
  let body = '<main class="layout">';
  body += sidebarHtml(moduleId);
  body += '<article class="content">';

  body += `<h1><span class="stage-chip">${esc(meta.stage)}</span>${esc(meta.title)}</h1>`;
  body += `<p class="subtitle">${esc(meta.subtitle)}</p>`;

  if (walk) {
    body += `<div class="card primary"><div class="label">本模块主旨</div>${esc(walk.bigPicture)}</div>`;
    body += '<h2>学完应能回答</h2><ul>';
    for (const s of walk.successCriteria) body += `<li>${esc(s)}</li>`;
    body += '</ul>';
    body += `<p><a class="btn" href="../walkthrough/${moduleId}.html">查看完整 Walkthrough（${walk.steps.length} 步 + ${walk.pitfalls.length} 误区）</a></p>`;
  }

  if (lesson && (lesson.learningGoals?.length || lesson.summary)) {
    if (lesson.summary) body += `<div class="card measure"><div class="label">总览</div>${esc(lesson.summary)}</div>`;
    if (lesson.introBeginner) {
      body += '<h2>零基础速入</h2>';
      body += `<div class="card"><div class="label">类比</div>${esc(lesson.introBeginner.metaphor)}</div>`;
      body += `<div class="card measure"><div class="label">核心概念</div>${esc(lesson.introBeginner.coreIdea)}</div>`;
      if (lesson.introBeginner.whyCare?.length) {
        body += '<h3>为什么要学</h3><ul>';
        for (const w of lesson.introBeginner.whyCare) body += `<li>${esc(w)}</li>`;
        body += '</ul>';
      }
      if (lesson.introBeginner.firstAction) {
        body += `<div class="card primary"><div class="label">第一手操作</div>${esc(lesson.introBeginner.firstAction)}</div>`;
      }
    }

    if (lesson.learningGoals?.length) {
      body += '<h2>学习目标</h2><ul>';
      for (const g of lesson.learningGoals) body += `<li>${esc(g)}</li>`;
      body += '</ul>';
    }
    if (lesson.concepts?.length) {
      body += '<h2>核心概念</h2><ul>';
      for (const c of lesson.concepts) body += `<li>${esc(c)}</li>`;
      body += '</ul>';
    }
    if (lesson.formulas?.length) {
      body += '<h2>公式</h2>';
      for (const f of lesson.formulas) {
        body += `<div class="card"><div class="label">${esc(f.title)}</div>`
             + `<div class="formula">${esc(f.expression)}</div>`
             + `<p>${esc(f.explanation)}</p></div>`;
      }
    }
    if (lesson.engineeringMeaning?.length) {
      body += '<h2>工程意义</h2><ul>';
      for (const m of lesson.engineeringMeaning) body += `<li>${esc(m)}</li>`;
      body += '</ul>';
    }
    if (lesson.stm32Guide?.length) {
      body += '<h2>STM32 移植指南</h2><ul>';
      for (const s of lesson.stm32Guide) body += `<li>${esc(s)}</li>`;
      body += '</ul>';
    }
    if (lesson.commonMistakes?.length) {
      body += '<h2>常见误区</h2><div class="card warn"><ul>';
      for (const c of lesson.commonMistakes) body += `<li>${esc(c)}</li>`;
      body += '</ul></div>';
    }
    if (lesson.debugMethods?.length) {
      body += '<h2>调试方法</h2><ul>';
      for (const d of lesson.debugMethods) body += `<li>${esc(d)}</li>`;
      body += '</ul>';
    }
    if (lesson.experiments?.length) {
      body += '<h2>建议实验</h2><ul>';
      for (const e of lesson.experiments) body += `<li>${esc(e)}</li>`;
      body += '</ul>';
    }
    if (lesson.codeExample) {
      body += '<h2>STM32 C 代码骨架</h2>';
      body += `<pre>${esc(lesson.codeExample)}</pre>`;
    }
    if (lesson.nextSteps?.length) {
      body += '<h2>下一步</h2><ul>';
      for (const n of lesson.nextSteps) body += `<li>${esc(n)}</li>`;
      body += '</ul>';
    }
    if (lesson.quiz?.length) {
      body += '<h2>随堂题</h2>';
      for (const q of lesson.quiz) {
        body += '<div class="quiz">';
        body += `<div class="q">${esc(q.q)}</div><ol>`;
        for (let i = 0; i < q.options.length; i++) {
          const isCorrect = i === q.correct;
          body += `<li${isCorrect ? ' class="correct"' : ''}>${esc(q.options[i])}${isCorrect ? ' (正确)' : ''}</li>`;
        }
        body += '</ol>';
        if (q.hint) body += `<div class="hint">提示：${esc(q.hint)}</div>`;
        body += '</div>';
      }
    }
  }

  if (relatedFormulas.length) {
    body += '<h2>相关公式索引</h2>';
    for (const f of relatedFormulas) {
      body += `<div class="card"><div class="label">${esc(f.name)}</div><div class="formula">${esc(f.expression)}</div></div>`;
    }
  }

  body += '</article>';

  // TOC：右侧目录
  let toc = '<aside class="toc"><h3>本页目录</h3>';
  if (walk) toc += '<a href="#">本模块主旨</a>';
  if (lesson?.summary) toc += '<a href="#">总览</a>';
  if (lesson?.introBeginner) toc += '<a href="#">零基础速入</a>';
  if (lesson?.learningGoals?.length) toc += '<a href="#">学习目标</a>';
  if (lesson?.concepts?.length) toc += '<a href="#">核心概念</a>';
  if (lesson?.formulas?.length) toc += '<a href="#">公式</a>';
  if (lesson?.engineeringMeaning?.length) toc += '<a href="#">工程意义</a>';
  if (lesson?.stm32Guide?.length) toc += '<a href="#">STM32 移植指南</a>';
  if (lesson?.commonMistakes?.length) toc += '<a href="#">常见误区</a>';
  if (lesson?.codeExample) toc += '<a href="#">C 代码骨架</a>';
  toc += '</aside>';
  body += toc;
  body += '</main>';

  return rebaseHtml(pageShell({ title: meta.title, currentNav: null, body }), 1);
}

function renderWalkthroughPage(moduleId, walk) {
  const meta = MODULE_META[moduleId] || { stage: '—', title: moduleId };
  let body = '<main class="layout">';
  body += sidebarHtml(moduleId);
  body += '<article class="content">';
  body += `<h1><span class="stage-chip">${esc(meta.stage)} Walkthrough</span>${esc(meta.title)}</h1>`;
  body += `<p class="subtitle">${esc(walk.bigPicture)}</p>`;
  body += `<p><a href="../module/${moduleId}.html">← 返回模块讲义</a></p>`;

  body += '<h2>学完应能回答</h2><ul>';
  for (const s of walk.successCriteria) body += `<li>${esc(s)}</li>`;
  body += '</ul>';

  body += `<h2>主线步骤（${walk.steps.length} 步）</h2>`;
  let idx = 1;
  for (const step of walk.steps) {
    body += '<section class="step">';
    body += `<div class="step-no">Step ${idx} / ${walk.steps.length} · ${esc(step.id)}</div>`;
    body += `<h3>${esc(step.title)}</h3>`;
    body += `<div class="field"><div class="field-label">目标</div><div>${esc(step.goal)}</div></div>`;
    body += `<div class="field"><div class="field-label">操作</div><div>${esc(step.action)}</div></div>`;
    body += `<div class="field"><div class="field-label">观察</div><div>${esc(step.observe)}</div></div>`;
    body += `<div class="field"><div class="field-label">为什么</div><div>${esc(step.whyMatters)}</div></div>`;
    if (step.presetId) body += `<div class="field"><div class="field-label">工况</div><div><code>${esc(step.presetId)}</code></div></div>`;
    if (step.quiz) {
      const q = step.quiz;
      body += '<div class="quiz">';
      body += `<div class="q">随堂题：${esc(q.q)}</div><ol>`;
      for (let i = 0; i < q.options.length; i++) {
        const isCorrect = i === q.correct;
        body += `<li${isCorrect ? ' class="correct"' : ''}>${esc(q.options[i])}${isCorrect ? ' (正确)' : ''}</li>`;
      }
      body += '</ol>';
      if (q.hint) body += `<div class="hint">提示：${esc(q.hint)}</div>`;
      body += '</div>';
    }
    body += '</section>';
    idx++;
  }

  body += `<h2>常见误区（${walk.pitfalls.length} 个）</h2>`;
  for (const p of walk.pitfalls) {
    body += '<div class="pitfall">';
    body += `<div class="label">${esc(p.label)}</div>`;
    body += `<p><strong>现象：</strong>${esc(p.symptom)}</p>`;
    body += `<p><strong>为什么：</strong>${esc(p.why)}</p>`;
    body += '</div>';
  }

  if (walk.nextModuleHook) {
    body += '<h2>下一模块引子</h2>';
    body += `<div class="card primary">${esc(walk.nextModuleHook)}</div>`;
  }

  body += '</article>';

  let toc = '<aside class="toc"><h3>本页目录</h3>';
  toc += '<a href="#">学完应能回答</a><a href="#">主线步骤</a><a href="#">常见误区</a>';
  if (walk.nextModuleHook) toc += '<a href="#">下一模块引子</a>';
  toc += '</aside>';
  body += toc;
  body += '</main>';

  return rebaseHtml(pageShell({ title: meta.title + ' Walkthrough', currentNav: null, body }), 1);
}

function renderGlossaryPage(glossary) {
  let body = '<main class="layout">';
  body += sidebarHtml(null);
  body += '<article class="content">';
  body += '<h1>术语表</h1>';
  body += `<p class="subtitle">共 ${glossary.length} 个核心术语。键入关键词可过滤。</p>`;
  body += '<div class="glossary-search"><input id="gs-input" type="text" placeholder="搜索术语 / 定义..." aria-label="搜索术语" oninput="filterGlossary()"></div>';
  body += '<div class="glossary-list" id="glossary-list">';
  for (const g of glossary) {
    body += `<div class="glossary-item" data-key="${esc((g.term + ' ' + g.definition).toLowerCase())}">`
         + `<div class="term">${esc(g.term)}</div>`
         + `<div class="def">${esc(g.definition)}</div>`
         + '</div>';
  }
  body += '</div>';
  body += '</article><aside class="toc"></aside></main>';
  body += `<script>
    function filterGlossary() {
      const q = document.getElementById('gs-input').value.trim().toLowerCase();
      const items = document.querySelectorAll('#glossary-list .glossary-item');
      for (const it of items) {
        if (!q || it.dataset.key.includes(q)) it.style.display = '';
        else it.style.display = 'none';
      }
    }
  </script>`;
  return pageShell({ title: '术语表', currentNav: 'glossary', body });
}

function renderFormulasPage(formulas) {
  // 按 key 前缀分组
  const groups = {};
  for (const f of formulas) {
    const key = f.key || '';
    let group = '通用';
    if (/^clarke|park|svpwm/.test(key)) group = '坐标变换 / 调制';
    else if (/^pi|antiwindup|deadtime/.test(key)) group = '控制器与逆变器';
    else if (/^bemf|pi-bandwidth|foc-total|electrical|torque/.test(key)) group = 'FOC 时序与转矩';
    else if (/^hfi|fw-|mtpa|voltage/.test(key)) group = '弱磁 / 无感 / 高级';
    else if (/^pfc|ocp|vf|ramp/.test(key)) group = '前级 / 保护 / 启动';
    else if (/^cop|superheat|subcool|comp/.test(key)) group = '制冷循环 / 压缩机';
    else if (/^kcl|clarke-q15|dq-decoupling/.test(key)) group = '工程实现细节';
    (groups[group] = groups[group] || []).push(f);
  }

  let body = '<main class="layout">';
  body += sidebarHtml(null);
  body += '<article class="content">';
  body += '<h1>公式集</h1>';
  body += `<p class="subtitle">共 ${formulas.length} 条公式，按主题分组。</p>`;
  for (const [g, items] of Object.entries(groups)) {
    body += `<h2>${esc(g)}</h2>`;
    for (const f of items) {
      body += `<div class="card"><div class="label">${esc(f.name)}</div>`
           + `<div class="formula">${esc(f.expression)}</div></div>`;
    }
  }
  body += '</article><aside class="toc"></aside></main>';
  return pageShell({ title: '公式集', currentNav: 'formulas', body });
}

function renderFaultsPage(faultCases) {
  const all = Object.values(faultCases || {});
  let body = '<main class="layout">';
  body += sidebarHtml(null);
  body += '<article class="content">';
  body += '<h1>故障速查</h1>';
  body += `<p class="subtitle">共 ${all.length} 类典型故障：症状 → 原因 → 排查 → 修复 → STM32 调试要点。</p>`;
  for (const fc of all) {
    body += '<div class="fault-card">';
    body += `<h3>${esc(fc.title)} <code>${esc(fc.id)}</code></h3>`;
    body += `<p><strong>现象：</strong>${esc(fc.phenomenon)}</p>`;
    body += '<p><strong>可能原因：</strong></p><ul>';
    for (const c of fc.causes) body += `<li>${esc(c)}</li>`;
    body += '</ul>';
    body += '<p><strong>排查步骤：</strong></p><ol>';
    for (const s of fc.steps) body += `<li>${esc(s)}</li>`;
    body += '</ol>';
    body += '<p><strong>修复建议：</strong></p><ul>';
    for (const f of fc.fix) body += `<li>${esc(f)}</li>`;
    body += '</ul>';
    body += `<div class="card primary"><div class="label">STM32 调试要点</div>${esc(fc.stm32)}</div>`;
    body += '</div>';
  }
  body += '</article><aside class="toc"></aside></main>';
  return pageShell({ title: '故障速查', currentNav: 'faults', body });
}

// 搜索页：客户端 JS 用 search.json
function renderSearchPage() {
  let body = '<main class="layout">';
  body += sidebarHtml(null);
  body += '<article class="content">';
  body += '<h1>站内搜索</h1>';
  body += '<p class="subtitle">在所有模块讲义 / walkthrough / 公式 / 术语 / 故障中查找。</p>';
  body += '<div class="glossary-search"><input id="search-input" type="text" placeholder="输入关键词..." aria-label="站内搜索"></div>';
  body += '<div id="search-results"></div>';
  body += '</article><aside class="toc"></aside></main>';
  // 简单内置搜索（< 80 行 JS，遵循约束）
  body += `<script>
  (function() {
    var idx = null;
    var input = document.getElementById('search-input');
    var out = document.getElementById('search-results');
    function tokenize(s) {
      return String(s || '').toLowerCase().split(/[\\s,。、;；：:.()（）\\[\\]【】"'!?！？]+/).filter(function(t) { return t.length > 0; });
    }
    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function highlight(text, terms) {
      var t = escapeHtml(text);
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i].replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        if (!term) continue;
        t = t.replace(new RegExp('(' + term + ')', 'gi'), '<mark style="background:rgba(86,207,255,0.3);color:inherit">$1</mark>');
      }
      return t;
    }
    function search(q) {
      if (!idx) { out.innerHTML = '<p>索引加载中...</p>'; return; }
      var terms = tokenize(q);
      if (!terms.length) { out.innerHTML = '<p>请输入关键词。</p>'; return; }
      var hits = [];
      for (var i = 0; i < idx.length; i++) {
        var rec = idx[i];
        var hay = (rec.title + ' ' + rec.body).toLowerCase();
        var score = 0;
        for (var j = 0; j < terms.length; j++) {
          var t = terms[j];
          if (rec.title.toLowerCase().indexOf(t) >= 0) score += 5;
          if (hay.indexOf(t) >= 0) score += 1;
        }
        if (score > 0) hits.push({ rec: rec, score: score });
      }
      hits.sort(function(a, b) { return b.score - a.score; });
      hits = hits.slice(0, 30);
      if (!hits.length) { out.innerHTML = '<p>未找到匹配项。</p>'; return; }
      var html = '<p>命中 ' + hits.length + ' 条：</p>';
      for (var k = 0; k < hits.length; k++) {
        var r = hits[k].rec;
        var snippet = r.body.length > 180 ? r.body.slice(0, 180) + '…' : r.body;
        html += '<div class="card"><div class="label">' + escapeHtml(r.kind) + '</div>';
        html += '<h3 style="margin:4px 0"><a href="' + escapeHtml(r.url) + '">' + highlight(r.title, terms) + '</a></h3>';
        html += '<p style="font-size:13px;color:rgb(var(--ink-secondary))">' + highlight(snippet, terms) + '</p></div>';
      }
      out.innerHTML = html;
    }
    fetch('search.json').then(function(r) { return r.json(); }).then(function(data) {
      idx = data;
      if (input.value) search(input.value);
    }).catch(function(e) { out.innerHTML = '<p>索引加载失败：' + e + '</p>'; });
    input.addEventListener('input', function() { search(input.value); });
  })();
  </script>`;
  return pageShell({ title: '搜索', currentNav: 'search', body, includeSearch: true });
}

// ============================================================================
// 4. 搜索索引：覆盖 title / first-paragraph / 模块 / walkthrough / 术语 / 公式 / 故障
// ============================================================================

function firstParagraph(text, max = 500) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function buildSearchIndex({ lessons, walkthroughs, formulas, glossary, faultCases }) {
  const records = [];
  for (const id of MODULE_ORDER) {
    const meta = MODULE_META[id];
    if (!meta) continue;
    const lesson = lessons[id];
    const walk = walkthroughs[id];
    let body = (meta.subtitle || '') + ' ';
    if (lesson) {
      body += (lesson.summary || '') + ' ';
      body += (lesson.learningGoals || []).join(' ') + ' ';
      body += (lesson.concepts || []).join(' ') + ' ';
      body += (lesson.engineeringMeaning || []).join(' ') + ' ';
      body += (lesson.stm32Guide || []).join(' ') + ' ';
      body += (lesson.commonMistakes || []).join(' ') + ' ';
    }
    if (walk) body += walk.bigPicture + ' ' + walk.successCriteria.join(' ');
    records.push({
      kind: '模块',
      title: `${meta.stage} ${meta.title}`,
      url: `module/${id}.html`,
      body: firstParagraph(body),
    });
    if (walk) {
      // 每个 step 单独索引一条
      for (const step of walk.steps) {
        records.push({
          kind: 'Walkthrough Step',
          title: `${meta.title} · ${step.title}`,
          url: `walkthrough/${id}.html`,
          body: firstParagraph([step.goal, step.action, step.observe, step.whyMatters].join(' ')),
        });
      }
    }
  }
  for (const g of glossary) {
    records.push({
      kind: '术语',
      title: g.term,
      url: 'glossary.html',
      body: firstParagraph(g.definition),
    });
  }
  for (const f of formulas) {
    records.push({
      kind: '公式',
      title: f.name,
      url: 'formulas.html',
      body: firstParagraph(f.expression),
    });
  }
  for (const fc of Object.values(faultCases || {})) {
    records.push({
      kind: '故障',
      title: fc.title,
      url: 'faults.html',
      body: firstParagraph(
        [fc.phenomenon, (fc.causes || []).join(' '), (fc.steps || []).join(' '), fc.stm32].join(' ')
      ),
    });
  }
  return records;
}

// ============================================================================
// 5. 目录大小统计
// ============================================================================

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else { files++; bytes += st.size; }
    }
  }
  walk(dir);
  return { files, bytes };
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

// ============================================================================
// 6. 主入口
// ============================================================================

async function main() {
  const t0 = Date.now();
  console.log('[docsite] 加载内容...');
  const data = await loadContent();
  const lessonsCount = Object.keys(data.lessons).length;
  const walkCount = Object.keys(data.walkthroughs).length;
  console.log(`[docsite] 加载完毕：lessons=${lessonsCount} walkthroughs=${walkCount} formulas=${data.formulas.length} glossary=${data.glossary.length} faults=${Object.keys(data.faultCases).length}`);

  // 重建输出目录
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, 'module'), { recursive: true });
  mkdirSync(join(OUT_DIR, 'walkthrough'), { recursive: true });

  console.log('[docsite] 生成 index / glossary / formulas / faults / search...');
  writeFileSync(join(OUT_DIR, 'index.html'), renderIndex(data), 'utf8');
  writeFileSync(join(OUT_DIR, 'glossary.html'), renderGlossaryPage(data.glossary), 'utf8');
  writeFileSync(join(OUT_DIR, 'formulas.html'), renderFormulasPage(data.formulas), 'utf8');
  writeFileSync(join(OUT_DIR, 'faults.html'), renderFaultsPage(data.faultCases), 'utf8');
  writeFileSync(join(OUT_DIR, 'search.html'), renderSearchPage(), 'utf8');

  const index = buildSearchIndex(data);
  writeFileSync(join(OUT_DIR, 'search.json'), JSON.stringify(index), 'utf8');

  console.log(`[docsite] 生成 ${MODULE_ORDER.length} 个模块页...`);
  for (const id of MODULE_ORDER) {
    const html = renderModulePage(id, data);
    writeFileSync(join(OUT_DIR, 'module', `${id}.html`), html, 'utf8');
  }

  console.log(`[docsite] 生成 ${Object.keys(data.walkthroughs).length} 个 walkthrough 详情页...`);
  for (const [id, walk] of Object.entries(data.walkthroughs)) {
    const html = renderWalkthroughPage(id, walk);
    writeFileSync(join(OUT_DIR, 'walkthrough', `${id}.html`), html, 'utf8');
  }

  const stats = dirStats(OUT_DIR);
  const dur = Date.now() - t0;
  console.log('');
  console.log(`[docsite] DONE  files=${stats.files}  size=${fmtBytes(stats.bytes)}  duration=${dur}ms  out=${relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error('[docsite] FAILED:', err);
  process.exit(1);
});
