import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
// 输出目录：本地默认 tmp/showcase-site；CI 传 docs/site/showcase
const out = process.argv[2] ? join(root, process.argv[2]) : join(root, 'tmp', 'showcase-site');
mkdirSync(join(out, 'img'), { recursive: true });

// 收集展示图：showcase 4 张 + zh 桌面基线 16 张 + en 桌面基线 16 张
const zhFiles = readdirSync(join(root, 'output/screenshots'))
  .filter((f) => f.startsWith('desktop-')).sort();
const enFiles = readdirSync(join(root, 'output/screenshots-en'))
  .filter((f) => f.startsWith('desktop-')).sort();
const showcaseFiles = readdirSync(join(root, 'output/showcase')).sort();

const copy = (from, toName) => { copyFileSync(from, join(out, 'img', toName)); return toName; };
const showcase = showcaseFiles.map((f) => copy(join(root, 'output/showcase', f), `show-${f}`));
const zh = zhFiles.map((f) => copy(join(root, 'output/screenshots', f), `zh-${f}`));
const en = enFiles.map((f) => copy(join(root, 'output/screenshots-en', f), `en-${f}`));

const grid = (files, label) => files.map((f) =>
  `<figure><a href="img/${f}" target="_blank"><img loading="lazy" src="img/${f}" alt="${label} ${f}"></a><figcaption>${label} · ${f.replace(/^(zh|en|show)-|^desktop-/, '').replace('.png', '')}</figcaption></figure>`
).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>电机控制学习客户端 · 界面展示 / UI Showcase</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #060d18; color: #eaf3ff;
         font: 14px/1.6 "Microsoft YaHei UI", system-ui, sans-serif; }
  header { max-width: 1200px; margin: 0 auto; padding: 48px 24px 8px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h1 span { color: #3ec8ff; }
  p.sub { color: #9db4cc; max-width: 760px; }
  nav.toc { max-width: 1200px; margin: 16px auto 0; padding: 0 24px; display: flex; gap: 12px; flex-wrap: wrap; }
  nav.toc a { color: #3ec8ff; text-decoration: none; border: 1px solid #2a3c5c; border-radius: 999px; padding: 4px 14px; font-size: 12px; }
  section { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
  h2 { font-size: 18px; border-left: 3px solid #3ec8ff; padding-left: 10px; }
  figure { margin: 0; }
  figure img { width: 100%; border: 1px solid #1b2740; border-radius: 12px; background: #0c1524; }
  figcaption { color: #7c96b2; font-size: 12px; margin-top: 6px; }
  .one { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .note { color: #7c96b2; font-size: 12px; }
  footer { max-width: 1200px; margin: 0 auto; padding: 24px; color: #7c96b2; font-size: 12px; }
  footer a { color: #3ec8ff; }
</style>
</head>
<body>
<header>
  <h1>电机控制学习客户端 <span>· UI Showcase</span></h1>
  <p class="sub">v0.2 双栏沉浸界面：76px 图标栏 + 粘性模块头 + 卡片锚点导航 + Ctrl+K 命令面板 + 参数坞 + 可折叠波形区。全部教学界面中英双语，16 模块。</p>
  <nav class="toc">
    <a href="#showcase">交互状态实拍</a>
    <a href="#zh">中文 · 16 模块</a>
    <a href="#en">English · 16 modules</a>
  </nav>
</header>

<section id="showcase">
  <h2>交互状态实拍（桌面 1440px / 移动 390px）</h2>
  <div class="one">
    ${grid(showcase, '实拍')}
  </div>
  <p class="note">1 参数坞展开 · 2 命令面板过滤 · 3 首访新手引导 · 4 英文移动端</p>
</section>

<section id="zh">
  <h2>中文界面 · 桌面 16 模块基线</h2>
  <div class="grid">${grid(zh, '中文')}</div>
</section>

<section id="en">
  <h2>English · Desktop baselines</h2>
  <div class="grid">${grid(en, 'EN')}</div>
</section>

<footer>
  源码：<a href="https://github.com/Lucas-Xi/motor-control-learning-client">github.com/Lucas-Xi/motor-control-learning-client</a> · 点击任意图放大原图
</footer>
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), html, 'utf8');
console.log(`showcase site built: ${showcase.length + zh.length + en.length} images`);
