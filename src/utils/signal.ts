import { clarkeTransform, generateThreePhaseCurrent, parkTransform, type ABC, type ThreePhaseOptions } from '../simulation/math/transforms';

export interface WaveSample extends ABC {
  t: number;
  alpha: number;
  beta: number;
  id: number;
  iq: number;
}

export function generateThreePhaseSamples(options: Omit<ThreePhaseOptions, 'time'>, duration = 0.08, points = 160): WaveSample[] {
  const samples: WaveSample[] = [];
  for (let i = 0; i < points; i += 1) {
    const t = (duration * i) / Math.max(1, points - 1);
    const abc = generateThreePhaseCurrent({ ...options, time: t });
    const ab = clarkeTransform(abc);
    const dq = parkTransform(ab, 2 * Math.PI * options.frequency * t + (options.phaseDeg * Math.PI) / 180);
    samples.push({ t: t * 1000, ...abc, alpha: ab.alpha, beta: ab.beta, id: dq.d, iq: dq.q });
  }
  return samples;
}

export function stepSeries(target: number, tau: number, points = 120): Array<{ t: number; value: number; target: number }> {
  return Array.from({ length: points }, (_, i) => {
    const t = i / 20;
    return { t, value: target * (1 - Math.exp(-t / tau)), target };
  });
}
