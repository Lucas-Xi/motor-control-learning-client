// Verifies KCL and key shape invariants for createFaultWaveform across all 14 fault types.
// Run: node scripts/verify-fault-waves.mjs
//
// We re-import the compiled JS from dist via a small transpile dance — but
// since the function is pure and has no external deps, we just inline it here
// (kept in sync with src/simulation/math/faultWaveforms.ts). This script's
// purpose is to spot regressions; if it ever drifts, fix the source first.

function createFaultWaveform(type, severity, points = 180) {
  const sev = Math.max(0, Math.min(1, severity));
  const Ibase = 4;
  const speedNom = 1200;
  const udcNom = 310;
  const TWO_PI_THIRDS = (Math.PI * 2) / 3;
  const lerp = (a, b, k) => a + (b - a) * k;

  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const omega = t * Math.PI * 8;
    const phaseA = Math.sin(omega);
    const phaseB = Math.sin(omega - TWO_PI_THIRDS);
    const phaseC = Math.sin(omega + TWO_PI_THIRDS);

    let ia = phaseA * Ibase;
    let ib = phaseB * Ibase;
    let ic = phaseC * Ibase;
    let speed = speedNom;
    let voltage = udcNom;

    switch (type) {
      case 'over-current': {
        if (sev > 0) {
          if (t >= 0.30 && t < 0.45) {
            const ramp = (t - 0.30) / 0.15;
            const k = 1 + sev * 1.8 * ramp;
            ia *= k; ib *= k; ic *= k;
          } else if (t >= 0.45 && t < 0.55) {
            const cut = Math.max(0, 1 - (t - 0.45) / 0.10);
            const peak = 1 + sev * 1.8;
            ia = phaseA * Ibase * peak * cut;
            ib = phaseB * Ibase * peak * cut;
            ic = phaseC * Ibase * peak * cut;
          } else if (t >= 0.55) {
            ia = ib = ic = 0;
            speed = speedNom * (1 - sev * 0.5);
          }
        }
        break;
      }
      case 'phase-loss': {
        if (t >= 0.30) {
          const ramp = Math.min(1, (t - 0.30) / 0.05) * sev;
          const ialost = phaseA * Ibase * 1.732;
          const iblost = 0;
          const iclost = -ialost;
          ia = lerp(ia, ialost, ramp);
          ib = lerp(ib, iblost, ramp);
          ic = lerp(ic, iclost, ramp);
          speed = lerp(speed, speedNom * 0.55, ramp);
        }
        break;
      }
      case 'locked-rotor': {
        const k = 1 + sev * 4;
        ia *= k; ib *= k; ic *= k;
        const remainder = (1 - sev) * (1 - sev);
        const decay = Math.min(1, t / 0.05);
        const lockSpeedFactor = 1 - decay * (1 - remainder);
        speed = speedNom * lockSpeedFactor;
        break;
      }
      case 'phase-order': {
        const iaSwap = ic;
        const icSwap = ia;
        ia = lerp(ia, iaSwap, sev);
        ic = lerp(ic, icSwap, sev);
        speed = lerp(speedNom, speedNom * (-0.4) + Math.sin(t * Math.PI * 6) * 200, sev);
        break;
      }
      case 'liquid-slugging': {
        const env = Math.exp(-Math.pow((t - 0.25) / 0.025, 2)) * sev * 5;
        ia = phaseA * (Ibase + env);
        ib = phaseB * (Ibase + env);
        ic = phaseC * (Ibase + env);
        if (t > 0.21 && t < 0.27) voltage += sev * 25 * Math.exp(-Math.pow((t - 0.24) / 0.02, 2));
        else if (t >= 0.27 && t < 0.42) voltage -= sev * 18 * Math.exp(-Math.pow((t - 0.30) / 0.04, 2));
        speed = speedNom - Math.exp(-Math.pow((t - 0.27) / 0.05, 2)) * sev * 350;
        break;
      }
      case 'oil-low': break;
      case 'current-offset': {
        ia += sev * 1.8;
        ib -= sev * 0.9;
        ic -= sev * 0.9;
        speed = speedNom + Math.sin(omega) * sev * 80;
        break;
      }
      case 'encoder-angle': {
        const k = 1 + sev * 0.6;
        const phi = sev * 0.8;
        ia = Math.sin(omega + phi) * Ibase * k;
        ib = Math.sin(omega + phi - TWO_PI_THIRDS) * Ibase * k;
        ic = Math.sin(omega + phi + TWO_PI_THIRDS) * Ibase * k;
        speed = speedNom * (1 - sev * 0.2) + Math.sin(t * Math.PI * 18) * sev * 60;
        break;
      }
      case 'speed-oscillation': {
        const env = 1 + Math.sin(t * Math.PI * 14) * sev * 0.35;
        ia *= env; ib *= env; ic *= env;
        speed = speedNom + Math.sin(t * Math.PI * 14) * sev * 420;
        break;
      }
      case 'voltage-saturation': {
        const reductionK = 1 - sev * 0.4;
        const h5 = sev * 0.18;
        const h7 = sev * 0.08;
        const a5 = Math.sin(omega * 5);
        const b5 = Math.sin(omega * 5 + TWO_PI_THIRDS);
        const c5 = Math.sin(omega * 5 - TWO_PI_THIRDS);
        const a7 = Math.sin(omega * 7);
        const b7 = Math.sin(omega * 7 - TWO_PI_THIRDS);
        const c7 = Math.sin(omega * 7 + TWO_PI_THIRDS);
        ia = (phaseA + a5 * h5 + a7 * h7) * Ibase * reductionK;
        ib = (phaseB + b5 * h5 + b7 * h7) * Ibase * reductionK;
        ic = (phaseC + c5 * h5 + c7 * h7) * Ibase * reductionK;
        speed = speedNom * (1 - sev * 0.15);
        break;
      }
      case 'startup-fail': {
        if (t < 0.55) {
          const wob = Math.sin(t * Math.PI * 42) * sev * 1.5;
          ia = phaseA * Ibase + wob;
          ib = phaseB * Ibase - wob * 0.5;
          ic = phaseC * Ibase - wob * 0.5;
          speed = speedNom * (1 - sev * 0.7) + Math.sin(t * Math.PI * 30) * sev * 100;
        } else {
          const cut = (1 - sev) * (1 - sev);
          ia *= cut; ib *= cut; ic *= cut;
          speed = speedNom * cut;
        }
        break;
      }
      case 'dc-undervolt': {
        voltage = udcNom - sev * 90 - (t > 0.5 ? sev * 30 : 0);
        const k = 1 + sev * 0.5;
        const distort = t > 0.5 ? Math.sin(t * Math.PI * 40) * sev * 1.0 : 0;
        ia = phaseA * Ibase * k + distort;
        ib = phaseB * Ibase * k - distort * 0.5;
        ic = phaseC * Ibase * k - distort * 0.5;
        speed = speedNom * (1 - sev * 0.4 * Math.max(0, t - 0.3));
        break;
      }
      case 'over-temp': {
        const k = 1 - sev * t * 0.5;
        ia *= k; ib *= k; ic *= k;
        speed = speedNom * k;
        break;
      }
      case 'vibration': {
        const env = 1 + Math.sin(t * Math.PI * 28) * sev * 0.3;
        ia *= env; ib *= env; ic *= env;
        speed = speedNom + Math.sin(t * Math.PI * 28) * sev * 180;
        break;
      }
    }
    return { t: t * 100, ia, ib, ic, speed, voltage };
  });
}

const types = [
  'over-current', 'phase-loss', 'current-offset', 'phase-order',
  'encoder-angle', 'speed-oscillation', 'voltage-saturation', 'startup-fail',
  'liquid-slugging', 'locked-rotor', 'dc-undervolt', 'over-temp',
  'vibration', 'oil-low',
];

const KCL_TOL = 1e-6;

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
