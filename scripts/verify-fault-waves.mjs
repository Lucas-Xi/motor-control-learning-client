// Verifies KCL and key shape invariants for createFaultWaveform across all 14 fault types.
// Run: node scripts/verify-fault-waves.mjs
//
// 用 esbuild（vite 的自带依赖）把 TS 源码即时打包成 ESM 临时文件再动态 import。
// 直接 import dist/ 产物不可行：Rollup 共享 chunk 的导出名会被混淆。

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 从 src/simulation/math/faultWaveforms.ts 加载 createFaultWaveform。
 * @returns {Promise<import('../src/simulation/math/faultWaveforms.mjs')['createFaultWaveform']>}
 */
async function loadFaultWaveform() {
  const entry = fileURLToPath(new URL('../src/simulation/math/faultWaveforms.ts', import.meta.url));
  const outDir = mkdtempSync(join(tmpdir(), 'faultwaves-'));
  const outFile = join(outDir, 'faultWaveforms.mjs');
  try {
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [entry],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      logLevel: 'silent',
    });
    const mod = await import(pathToFileURL(outFile).href);
    return mod.createFaultWaveform;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

const types = [
  'over-current', 'phase-loss', 'current-offset', 'phase-order',
  'encoder-angle', 'speed-oscillation', 'voltage-saturation', 'startup-fail',
  'liquid-slugging', 'locked-rotor', 'dc-undervolt', 'over-temp',
  'vibration', 'oil-low',
];

const KCL_TOL = 1e-6;

async function main() {
  const createFaultWaveform = await loadFaultWaveform();

  let total = 0, ok = 0, fail = 0;
  const fmt = (n) => n.toFixed(3).padStart(8);

  for (const type of types) {
    total++;
    const samples = createFaultWaveform(type, 0.9, 200);
    // 1) KCL: |Ia+Ib+Ic| ≤ tolerance at all points
    let maxKcl = 0;
    for (const s of samples) {
      const sum = Math.abs(s.ia + s.ib + s.ic);
      if (sum > maxKcl) maxKcl = sum;
    }
    // 2) Severity-zero must equal nominal three-phase
    const sev0 = createFaultWaveform(type, 0, 50);
    let maxDeviationFromNominal = 0;
    for (let i = 0; i < sev0.length; i++) {
      const t = i / (sev0.length - 1);
      const omega = t * Math.PI * 8;
      const expectedTwoPi3 = (Math.PI * 2) / 3;
      const expectedIa = Math.sin(omega) * 4;
      const expectedIb = Math.sin(omega - expectedTwoPi3) * 4;
      const expectedIc = Math.sin(omega + expectedTwoPi3) * 4;
      const dev = Math.max(
        Math.abs(sev0[i].ia - expectedIa),
        Math.abs(sev0[i].ib - expectedIb),
        Math.abs(sev0[i].ic - expectedIc),
        Math.abs(sev0[i].speed - 1200),
      );
      if (dev > maxDeviationFromNominal) maxDeviationFromNominal = dev;
    }

    // 3) Type-specific shape invariants at sev=0.9
    const peakIa = samples.reduce((m, s) => Math.max(m, Math.abs(s.ia)), 0);
    const minSpeed = samples.reduce((m, s) => Math.min(m, s.speed), Infinity);
    const maxSpeed = samples.reduce((m, s) => Math.max(m, s.speed), -Infinity);
    const minVolt = samples.reduce((m, s) => Math.min(m, s.voltage), Infinity);
    const maxVolt = samples.reduce((m, s) => Math.max(m, s.voltage), -Infinity);

    const shapeChecks = [];
    switch (type) {
      case 'over-current':
        shapeChecks.push(['peak Ia > 8', peakIa > 8]);
        shapeChecks.push(['after-trip currents zero', samples.filter((s) => s.t > 60).every((s) => Math.abs(s.ia) < 0.01)]);
        break;
      case 'phase-loss': {
        const post = samples.filter((s) => s.t > 40);
        shapeChecks.push(['Ib drops to near-zero after 30%', post.every((s) => Math.abs(s.ib) < 0.6)]);
        shapeChecks.push(['post Ia ≈ -Ic', post.every((s) => Math.abs(s.ia + s.ic) < 0.6)]);
        break;
      }
      case 'locked-rotor':
        shapeChecks.push(['peak Ia > 15 (5x rated)', peakIa > 15]);
        shapeChecks.push(['min speed < 100 RPM', minSpeed < 100]);
        break;
      case 'phase-order':
        shapeChecks.push(['speed mostly negative', minSpeed < -200]);
        break;
      case 'liquid-slugging':
        shapeChecks.push(['speed dips below 950 RPM', minSpeed < 950]);
        shapeChecks.push(['voltage transient (max>320 or min<300)', maxVolt > 320 || minVolt < 300]);
        break;
      case 'oil-low':
        shapeChecks.push(['no waveform change vs nominal', Math.abs(peakIa - 4) < 0.01]);
        shapeChecks.push(['speed at nominal 1200', Math.abs(maxSpeed - 1200) < 1 && Math.abs(minSpeed - 1200) < 1]);
        break;
      case 'current-offset':
        shapeChecks.push(['DC offset visible (max Ia > 5.5)', samples.reduce((m, s) => Math.max(m, s.ia), -Infinity) > 5.5]);
        break;
      case 'encoder-angle':
        shapeChecks.push(['amplitude inflated', peakIa > 5.5]);
        break;
      case 'speed-oscillation':
        shapeChecks.push(['speed swings > 200 RPM', maxSpeed - minSpeed > 200]);
        break;
      case 'voltage-saturation':
        shapeChecks.push(['top clipped: max < pure sin peak (4)', peakIa < 4.05]);
        break;
      case 'startup-fail':
        shapeChecks.push(['post-cut speed → 0', minSpeed < 50]);
        break;
      case 'dc-undervolt':
        shapeChecks.push(['voltage drops below 250', minVolt < 250]);
        break;
      case 'over-temp':
        shapeChecks.push(['speed derate (final < 90% nominal)', samples[samples.length - 1].speed < 1080]);
        break;
      case 'vibration':
        shapeChecks.push(['speed envelope swings', maxSpeed - minSpeed > 200]);
        break;
    }

    const kclOK = maxKcl < KCL_TOL;
    const sev0OK = maxDeviationFromNominal < 1e-6;
    const allShape = shapeChecks.every(([_, p]) => p);
    const passed = kclOK && sev0OK && allShape;
    if (passed) ok++; else fail++;

    console.log(`${passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${type.padEnd(18)} KCL=${maxKcl.toExponential(2)}  sev0Δ=${maxDeviationFromNominal.toExponential(2)}  kclOK=${kclOK} sev0OK=${sev0OK} shape=${allShape}`);
    for (const [name, pass] of shapeChecks) {
      console.log(`     ${pass ? '✓' : '✗'} ${name}`);
    }
  }

  console.log(`\n${ok}/${total} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
