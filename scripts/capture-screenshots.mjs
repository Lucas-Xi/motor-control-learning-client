import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.QA_SCREENSHOT_DIR || 'output/screenshots';
const distDir = join(root, 'dist');
const modules = [
  ['01', 'motor-basics', '电机基础'],
  ['02', 'three-phase', '三相正弦波与旋转磁场'],
  ['03', 'clarke-transform', 'Clarke 变换'],
  ['04', 'park-transform', 'Park 变换'],
  ['05', 'pid-control', 'PID 控制'],
  ['06', 'foc-flow', 'FOC 总体流程'],
  ['07', 'svpwm', 'SVPWM'],
  ['08', 'inverter', '三相逆变器'],
  ['09', 'control-loops', '电流环 / 速度环 / 位置环'],
  ['10', 'sensorless-foc', '无感 FOC / 观测器'],
  ['11', 'field-weakening', '弱磁控制'],
  ['12', 'faults-debugging', '故障与调试'],
  ['13', 'hfi-sensorless', 'HFI 高频注入低速无感'],
  ['14', 'startup-statemachine', '压缩机启动状态机'],
  ['15', 'apf-frontend', 'APF 前级 PFC'],
  ['16', 'refrigeration-bench', '制冷系统台架'],
];
const viewports = [
  ['desktop', { width: 1440, height: 960 }],
  ['mobile', { width: 390, height: 844 }],
];

function isIgnoredConsoleWarning(text) {
  return text.includes('GL Driver Message') && text.includes('ReadPixels');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function extensionOf(pathname) {
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : '.html';
}

async function pathExists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch {
    return false;
  }
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReady()) return null;

  if (!(await pathExists(join(distDir, 'index.html')))) {
    throw new Error('dist/index.html not found. Run `npm run build` before `npm run qa:screenshots`.');
  }

  const url = new URL(baseUrl);
  const hostname = url.hostname || '127.0.0.1';
  const port = Number(url.port || 4173);

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', baseUrl);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (relativePath.includes('..')) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      const requestedFile = join(distDir, relativePath);
      const filePath = (await pathExists(requestedFile)) ? requestedFile : join(distDir, 'index.html');
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': contentTypes[extensionOf(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : 'Static server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, resolve);
  });

  for (let i = 0; i < 20; i += 1) {
    if (await isServerReady()) return server;
    await sleep(250);
  }
  await new Promise((resolve) => server.close(resolve));
  throw new Error(`Static QA server did not become ready at ${baseUrl}`);
}

async function pauseSimulation(page) {
  const pause = page.getByRole('button', { name: /暂停/ });
  if (await pause.count()) {
    await pause.first().click();
  }
}

async function openModule(page, stage) {
  await page.locator('aside button').filter({ hasText: `${stage} ·` }).click();
  // 等待 lazy 模块完成加载（Suspense fallback "模块加载中…" 消失）
  await page.locator('text=模块加载中').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(450);
}

const server = await ensureServer();
await mkdir(join(root, outDir), { recursive: true });
const browser = await chromium.launch();
const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  screenshots: [],
  consoleErrors: [],
  consoleWarnings: [],
  ignoredConsoleWarnings: [],
};

try {
  for (const [viewportName, viewport] of viewports) {
    const page = await browser.newPage({ viewport });
    page.on('console', (message) => {
      if (message.type() === 'error') manifest.consoleErrors.push(message.text());
      if (message.type() === 'warning') {
        const text = message.text();
        if (isIgnoredConsoleWarning(text)) {
          manifest.ignoredConsoleWarnings.push(text);
        } else {
          manifest.consoleWarnings.push(text);
        }
      }
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await pauseSimulation(page);

    for (const [stage, slug, title] of modules) {
      await openModule(page, stage);
      await page.getByRole('heading', { name: title }).first().waitFor({ state: 'visible' });
      const filename = `${viewportName}-${stage}-${slug}.png`;
      const path = join(root, outDir, filename);
      await page.screenshot({ path, fullPage: true, animations: 'disabled' });
      manifest.screenshots.push({ viewport: viewportName, module: slug, title, path: `${outDir}/${filename}` });
      console.log(`captured ${outDir}/${filename}`);
    }
    await page.close();
  }

  await writeFile(join(root, outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Screenshot manifest written to ${outDir}/manifest.json`);

  if (manifest.consoleErrors.length || manifest.consoleWarnings.length) {
    console.log('Console diagnostics:');
    for (const error of manifest.consoleErrors) console.log(`  error: ${error}`);
    for (const warning of manifest.consoleWarnings) console.log(`  warning: ${warning}`);
    throw new Error(`Console was not clean: ${manifest.consoleErrors.length} errors, ${manifest.consoleWarnings.length} warnings`);
  }
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
