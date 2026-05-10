import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';

const root = process.cwd();
const baseUrl = (process.env.OPENAI_BASE_URL || 'https://codex.ciii.club').replace(/\/$/, '');
const apiKey = process.env.OPENAI_API_KEY;
const input = process.argv.includes('--input')
  ? process.argv[process.argv.indexOf('--input') + 1]
  : 'tmp/imagegen/motor-control-prompts.jsonl';
const outDir = process.argv.includes('--out-dir')
  ? process.argv[process.argv.indexOf('--out-dir') + 1]
  : 'output/imagegen';
const publicDir = process.argv.includes('--public-dir')
  ? process.argv[process.argv.indexOf('--public-dir') + 1]
  : 'public/assets/generated';
const force = process.argv.includes('--force');
const maxRetries = process.argv.includes('--retries')
  ? Number(process.argv[process.argv.indexOf('--retries') + 1])
  : 4;

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not set.');
}

function resolveUrl(path) {
  if (baseUrl.endsWith('/v1')) return `${baseUrl}${path}`;
  return `${baseUrl}/v1${path}`;
}

function normalizeSize(size) {
  // The current OpenAI JS/Python SDK in this workspace is old; this raw caller
  // uses conservative image sizes most OpenAI-compatible gateways support.
  if (size === '1536x1024') return '1536x1024';
  return size || '1536x1024';
}

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function generate(job, index, total) {
  const outPath = join(root, outDir, `${job.id}.png`);
  const publicPath = join(root, publicDir, `${job.id}.png`);
  if (!force && (await fileExists(publicPath))) {
    console.log(`[${index}/${total}] skip existing ${job.id}`);
    return;
  }

  const payload = {
    model: 'gpt-image-2',
    prompt: job.prompt,
    size: normalizeSize(job.size),
    quality: job.quality || 'medium',
    n: 1,
  };

  let response;
  let text = '';
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    console.log(`[${index}/${total}] generate ${job.id} (attempt ${attempt}/${maxRetries})`);
    response = await fetch(resolveUrl('/images/generations'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    text = await response.text();
    if (response.ok) break;
    if (!isRetryableStatus(response.status) || attempt === maxRetries) {
      throw new Error(`image generation failed for ${job.id}: HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    const delayMs = Math.min(120_000, 20_000 * attempt + 15_000);
    console.warn(`[${index}/${total}] retry ${job.id} after HTTP ${response.status}; waiting ${Math.round(delayMs / 1000)}s`);
    await wait(delayMs);
  }

  const json = JSON.parse(text);
  const first = json.data?.[0];
  const b64 = first?.b64_json || first?.image_base64 || first?.image;
  const url = first?.url;
  let bytes;
  if (b64) {
    bytes = Buffer.from(b64, 'base64');
  } else if (url) {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      throw new Error(`download failed for ${job.id}: HTTP ${imageResponse.status}`);
    }
    bytes = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error(`image generation response for ${job.id} did not contain b64_json or url.`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  await mkdir(dirname(publicPath), { recursive: true });
  await writeFile(outPath, bytes);
  await copyFile(outPath, publicPath);
  console.log(`[${index}/${total}] saved ${publicPath}`);
}

const lines = (await readFile(join(root, input), 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const jobs = lines.map((line) => JSON.parse(line));

await mkdir(join(root, outDir), { recursive: true });
await mkdir(join(root, publicDir), { recursive: true });

const failures = [];
for (let i = 0; i < jobs.length; i += 1) {
  try {
    await generate(jobs[i], i + 1, jobs.length);
  } catch (error) {
    failures.push(error);
    console.error(error.message);
  }
}

if (failures.length) {
  process.exitCode = 1;
}
