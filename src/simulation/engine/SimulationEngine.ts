import { clarkeTransform, generateThreePhaseCurrent, parkTransform } from '../math/transforms';
import { calculateSvpwm } from '../math/svpwm';
import type { ClarkeParams, ParkParams, ThreePhaseParams } from './types';

export class SimulationEngine {
  static threePhaseSnapshot(params: ThreePhaseParams, time: number) {
    const abc = generateThreePhaseCurrent({ ...params, time });
    const alphaBeta = clarkeTransform(abc);
    return { abc, alphaBeta, magnitude: Math.hypot(alphaBeta.alpha, alphaBeta.beta) };
  }

  static clarkeSnapshot(params: ClarkeParams) {
    const abc = params.balanced
      ? {
          ia: params.amplitude * Math.sin((params.phaseDeg * Math.PI) / 180),
          ib: params.amplitude * Math.sin((params.phaseDeg * Math.PI) / 180 - (2 * Math.PI) / 3),
          ic: params.amplitude * Math.sin((params.phaseDeg * Math.PI) / 180 + (2 * Math.PI) / 3),
        }
      : { ia: params.ia, ib: params.ib, ic: params.ic };
    return { abc, alphaBeta: clarkeTransform(abc) };
  }

  static parkSnapshot(params: ParkParams) {
    const alphaBeta = { alpha: params.iAlpha, beta: params.iBeta };
    const theta = (params.thetaDeg * Math.PI) / 180;
    return { alphaBeta, dq: parkTransform(alphaBeta, theta), theta };
  }

  static svpwmSnapshot(uAlpha: number, uBeta: number, uDc: number) {
    return calculateSvpwm({ uAlpha, uBeta, uDc });
  }
}
