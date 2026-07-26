// Verifies KCL and key shape invariants for createFaultWaveform across all 14 fault types.
// Run: node scripts/verify-fault-waves.mjs
//
// NOTE: 该脚本需要先执行 npm run build（把 src/ 编译到 dist/），然后通过动态
// import() 加载编译后的 createFaultWaveform 函数。这消除了内联副本与源文件不同步的风险。

import { createRequire } from 'node:module';

/**
 * 从 dist 动态导入 createFaultWaveform。
 * @returns {import('../src/simulation/math/faultWaveforms.mjs')['createFaultWaveform']}
 */
async function loadFaultWaveform() {
  // 优先尝试从 dist 加载（编译产物）
  const require = createRequire(import.meta.url);
  try {
    const distPath = require.resolve('../dist/assets/faultWaveforms.js');
    const mod = await import(distPath);
    return mod.createFaultWaveform;
  } catch {
    // fallback: 直接从源文件通过 ts-node 或 esbuild 加载
    // 但为了简单，这里提示用户先 build
    throw new Error(
      '无法从 dist/ 加载 createFaultWaveform。请确保先执行 npm run build 编译项目。\n' +
      '或者手动运行: node --experimental-vm-modules --loader ts-node/esm scripts/verify-fault-waves.mjs',
    );
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
