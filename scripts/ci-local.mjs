#!/usr/bin/env node
/**
 * ci-local.mjs
 *
 * 本机模拟 .github/workflows/pr.yml 的步骤序列，方便提 PR 前在本机完整预跑一遍。
 * 与 PR CI 的等价映射：
 *   1. npm ci                       (CI step: Install deps)
 *   2. npm run verify               (CI step: Verify project layout)
 *   3. node scripts/verify-fault-waves.mjs  (CI step: Verify fault waves)
 *   4. npx tsc -b --noEmit          (CI step: TypeScript type-check)
 *   5. npx vitest run               (CI step: Unit tests)
 *   6. npm run build                (CI step: Build)
 *
 * 默认会跳过 `npm ci`（太慢，且本机一般已 install）。加 --with-install 才会跑。
 * 加 --fail-fast 时任一步失败立刻退出（默认就是 fail-fast；保留 flag 兼容）。
 *
 * 用法：
 *   node scripts/ci-local.mjs
 *   node scripts/ci-local.mjs --with-install
 *   npm run ci:local
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const withInstall = args.has('--with-install');
const isWin = process.platform === 'win32';

const root = process.cwd();
if (!existsSync(join(root, 'package.json'))) {
  console.error('[ci:local] 未在项目根目录运行（找不到 package.json）。');
  process.exit(2);
}

/**
 * @typedef {Object} Step
 * @property {string} label    短标识，用于打印
 * @property {string} title    中文 + 英文描述（与 workflow 中 step name 对齐）
 * @property {string} command  实际执行的命令字符串
 * @property {boolean} [skip]  是否跳过
 */

/** @type {Step[]} */
const steps = [
  {
    label: 'install',
    title: 'Install deps / 安装依赖 (npm ci)',
    command: 'npm ci',
    skip: !withInstall,
  },
  {
    label: 'verify',
    title: 'Verify project layout / 项目结构静态校验',
    command: 'npm run verify',
  },
  {
    label: 'fault-waves',
    title: 'Verify fault waves / 故障波形回归',
    command: 'node scripts/verify-fault-waves.mjs',
  },
  {
    label: 'tsc',
    title: 'TypeScript type-check / TS 类型检查',
    command: 'npx tsc -b --noEmit',
  },
  {
    label: 'vitest',
    title: 'Unit tests / 单元测试 (vitest)',
    command: 'npx vitest run',
  },
  {
    label: 'build',
    title: 'Build / 生产构建 (vite build)',
    command: 'npm run build',
  },
];

const startedAt = Date.now();
const results = [];

for (const step of steps) {
  if (step.skip) {
    console.log(`\n--- [ci:local] skip ${step.label}: ${step.title} (use --with-install to enable) ---`);
    results.push({ label: step.label, status: 'skipped', duration: 0 });
    continue;
  }

  console.log(`\n=== [ci:local] ${step.label}: ${step.title} ===`);
  console.log(`$ ${step.command}`);
  const stepStart = Date.now();
  const cmd = isWin ? 'cmd.exe' : 'sh';
  const cmdArgs = isWin ? ['/d', '/s', '/c', step.command] : ['-lc', step.command];
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: false });
  const dur = ((Date.now() - stepStart) / 1000).toFixed(1);

  if (res.status !== 0) {
    console.error(`\n[ci:local] FAILED at "${step.label}" (exit ${res.status}, ${dur}s)`);
    results.push({ label: step.label, status: 'failed', duration: dur });
    printSummary(results, startedAt);
    process.exit(res.status ?? 1);
  }
  results.push({ label: step.label, status: 'passed', duration: dur });
}

printSummary(results, startedAt);
console.log('\n[ci:local] 全部通过 / all steps passed. (本机 CI 等价校验完成)');

function printSummary(rows, started) {
  const total = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n[ci:local] summary');
  for (const r of rows) {
    const tag = r.status === 'passed' ? 'OK  ' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
    console.log(`  ${tag}  ${r.label.padEnd(12)}  ${r.duration}s`);
  }
  console.log(`  total: ${total}s`);
}
