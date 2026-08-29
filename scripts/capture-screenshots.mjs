import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const root = process.cwd();
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
// QA_LOCALE=en → 英文界面截图（注入 localStorage locale，等待英文标题），输出到 output/screenshots-en/
const localeMode = (process.env.QA_LOCALE || 'zh').toLowerCase();
const isEn = localeMode === 'en';
const outDir = process.env.QA_SCREENSHOT_DIR || (isEn ? 'output/screenshots-en' : 'output/screenshots');
const distDir = join(root, 'dist');
const modules = [
  ['01', 'motor-basics', '电机基础', 'Motor Basics'],
  ['02', 'three-phase', '三相正弦波与旋转磁场', 'Three-Phase Sine & Rotating Field'],
  ['03', 'clarke-transform', 'Clarke 变换', 'Clarke Transform'],
  ['04', 'park-transform', 'Park 变换', 'Park Transform'],
  ['05', 'pid-control', 'PID 控制', 'PID Control'],
  ['06', 'foc-flow', 'FOC 总体流程', 'FOC Pipeline'],
  ['07', 'svpwm', 'SVPWM', 'SVPWM'],
  ['08', 'inverter', '三相逆变器', 'Three-Phase Inverter'],
  ['09', 'control-loops', '电流环 / 速度环 / 位置环', 'Current / Speed / Position Loops'],
  ['10', 'sensorless-foc', '无感 FOC / 观测器', 'Sensorless FOC / Observers'],
  ['11', 'field-weakening', '弱磁控制', 'Field Weakening'],
  ['12', 'faults-debugging', '故障与调试', 'Faults & Debugging'],
  ['13', 'hfi-sensorless', 'HFI 高频注入低速无感', 'HFI Low-Speed Sensorless'],
  ['14', 'startup-statemachine', '压缩机启动状态机', 'Compressor Startup State Machine'],
  ['15', 'apf-frontend', 'APF 前级 PFC', 'APF Front-End PFC'],
  ['16', 'refrigeration-bench', '制冷系统台架', 'Refrigeration Bench'],
];
const assemblyModule = ['17', 'assembly-workshop', '整机搭建工作台'];
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
  const pause = page.getByRole('button', { name: isEn ? /Pause/ : /暂停/ });
  if (await pause.count()) {
    await pause.first().click();
  }
}

async function openModule(page, stage) {
  await page.locator('aside button').filter({ hasText: `${stage} ·` }).click();
  // 等待 lazy 模块完成加载（Suspense fallback 消失；EN 模式等待英文 fallback）
  await page.getByText(isEn ? 'Loading module' : '模块加载中').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function openAssemblyWorkshop(page) {
  await page.getByRole('button', { name: /课程主线|学习路径|课程/ }).first().click();
  await page.getByRole('button', { name: /B\. 压缩机变频器一条龙/ }).click();

  const row = page.getByRole('listitem').filter({ hasText: '整机搭建工作台' }).first();
  await row.scrollIntoViewIfNeeded();
  await row.getByRole('button', { name: /assembly-workshop/ }).click();
  await page.locator('text=模块加载中').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.getByRole('button', { name: /虚拟搭建/ }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('img', { name: /三维电机装配视图/ }).waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(650);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  const channelsByColorType = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type: ${colorType}`);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    current.set(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) current[x] = (current[x] + left) & 0xff;
      else if (filter === 2) current[x] = (current[x] + up) & 0xff;
      else if (filter === 3) current[x] = (current[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) current[x] = (current[x] + paethPredictor(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
    }

    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (colorType === 0) {
        rgba[dst] = current[src];
        rgba[dst + 1] = current[src];
        rgba[dst + 2] = current[src];
        rgba[dst + 3] = 255;
      } else if (colorType === 2) {
        rgba[dst] = current[src];
        rgba[dst + 1] = current[src + 1];
        rgba[dst + 2] = current[src + 2];
        rgba[dst + 3] = 255;
      } else if (colorType === 4) {
        rgba[dst] = current[src];
        rgba[dst + 1] = current[src];
        rgba[dst + 2] = current[src];
        rgba[dst + 3] = current[src + 1];
      } else {
        rgba[dst] = current[src];
        rgba[dst + 1] = current[src + 1];
        rgba[dst + 2] = current[src + 2];
        rgba[dst + 3] = current[src + 3];
      }
    }
    previous.set(current);
  }

  return { width, height, rgba };
}

function summarizePngPixels(buffer, viewportName, moduleSlug, canvas) {
  const { width, height, rgba } = decodePngRgba(buffer);
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(totalPixels / 12000));
  const histogram = new Map();
  let sampledPixels = 0;
  let visiblePixels = 0;

  for (let pixel = 0; pixel < totalPixels; pixel += stride) {
    const offset = pixel * 4;
    const a = rgba[offset + 3];
    if (a === 0) continue;
    sampledPixels += 1;
    visiblePixels += 1;
    const r = rgba[offset] >> 4;
    const g = rgba[offset + 1] >> 4;
    const b = rgba[offset + 2] >> 4;
    const key = `${r},${g},${b}`;
    histogram.set(key, (histogram.get(key) || 0) + 1);
  }

  const counts = Array.from(histogram.values()).sort((a, b) => b - a);
  const dominant = counts[0] || 0;
  const dominantRatio = sampledPixels ? dominant / sampledPixels : 1;
  const uniqueColors = histogram.size;
  const ok = visiblePixels > 0 && uniqueColors >= 6 && dominantRatio < 0.985;

  return {
    viewport: viewportName,
    module: moduleSlug,
    canvas,
    ok,
    reason: ok ? 'ok' : 'low-pixel-variance',
    width,
    height,
    sampledPixels,
    uniqueColors,
    dominantRatio: Number(dominantRatio.toFixed(4)),
  };
}

async function collectCanvasChecks(page, viewportName, moduleSlug) {
  const canvases = await page.locator('canvas').all();
  const checks = [];
  for (let index = 0; index < canvases.length; index += 1) {
    const canvas = canvases[index];
    const box = await canvas.boundingBox();
    if (!box || box.width < 32 || box.height < 32) {
      checks.push({
        viewport: viewportName,
        module: moduleSlug,
        canvas: index,
        ok: false,
        reason: 'canvas-too-small',
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
        sampledPixels: 0,
        uniqueColors: 0,
        dominantRatio: 1,
      });
      continue;
    }
    const buffer = await canvas.screenshot({ animations: 'disabled' });
    checks.push(summarizePngPixels(buffer, viewportName, moduleSlug, index));
  }
  return checks;
}

async function captureModule(page, viewportName, stage, slug, title) {
  const filename = `${viewportName}-${stage}-${slug}.png`;
  const path = join(root, outDir, filename);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  const canvasChecks = await collectCanvasChecks(page, viewportName, slug);
  manifest.screenshots.push({ viewport: viewportName, module: slug, title, path: `${outDir}/${filename}` });
  manifest.canvasChecks.push(...canvasChecks);
  console.log(`captured ${outDir}/${filename}`);
}

const server = await ensureServer();
await mkdir(join(root, outDir), { recursive: true });
const browser = await chromium.launch();
const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  locale: isEn ? 'en-US' : 'zh-CN',
  screenshots: [],
  canvasChecks: [],
  consoleErrors: [],
  consoleWarnings: [],
  ignoredConsoleWarnings: [],
};

try {
  for (const [viewportName, viewport] of viewports) {
    const page = await browser.newPage({ viewport });
    if (isEn) {
      // 英文界面截图：zustand persist 的 localStorage 形状是 {state:{locale},version}
      await page.addInitScript(() => {
        localStorage.setItem('compressor-bench-locale', '{"state":{"locale":"en-US"},"version":1}');
      });
    }
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

    for (const [stage, slug, , titleEn] of modules) {
      const headingName = isEn ? titleEn : modules.find((m) => m[0] === stage)[2];
      await openModule(page, stage);
      await page.getByRole('heading', { name: headingName }).first().waitFor({ state: 'visible' });
      await captureModule(page, viewportName, stage, slug, headingName);
    }

    // 装配车间入口走中文课程主线导航，EN 模式暂不采集该页
    if (!isEn) {
      const [assemblyStage, assemblySlug, assemblyTitle] = assemblyModule;
      await openAssemblyWorkshop(page);
      await captureModule(page, viewportName, assemblyStage, assemblySlug, assemblyTitle);
    }
    await page.close();
  }

  await writeFile(join(root, outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Screenshot manifest written to ${outDir}/manifest.json`);

  const failedCanvasChecks = manifest.canvasChecks.filter((check) => !check.ok);
  if (failedCanvasChecks.length) {
    console.log('Canvas diagnostics:');
    for (const check of failedCanvasChecks) {
      console.log(
        `  ${check.viewport}/${check.module} canvas ${check.canvas}: ${check.reason}, ${check.width}x${check.height}, `
        + `uniqueColors=${check.uniqueColors}, dominantRatio=${check.dominantRatio}`,
      );
    }
    throw new Error(`Canvas was blank or low variance: ${failedCanvasChecks.length} failed checks`);
  }

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
