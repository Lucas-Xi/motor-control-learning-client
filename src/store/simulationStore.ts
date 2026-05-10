import { create } from 'zustand';
import {
  apfDefault,
  clarkeDefault,
  faultDefault,
  focDefault,
  hfiDefault,
  inverterDefault,
  motorBasicsDefault,
  parkDefault,
  pidDefault,
  refrigerationDefault,
  sensorlessDefault,
  startupDefault,
  svpwmDefault,
  threePhaseDefault,
  weakFieldDefault,
  controlLoopDefault,
} from '../simulation/engine/presets';
import type {
  APFParams,
  ClarkeParams,
  ControlLoopParams,
  FaultParams,
  FOCParams,
  HFIParams,
  InverterParams,
  ModuleId,
  MotorBasicsParams,
  ParkParams,
  PIDParams,
  RefrigerationParams,
  SensorlessParams,
  StartupParams,
  SvpwmParams,
  ThreePhaseParams,
  WeakFieldParams,
} from '../simulation/engine/types';

interface SimulationStore {
  activeModule: ModuleId;
  mode: 'teach' | 'lab';
  running: boolean;
  fullScreen: boolean;
  time: number;
  motorBasics: MotorBasicsParams;
  threePhase: ThreePhaseParams;
  clarke: ClarkeParams;
  park: ParkParams;
  pid: PIDParams;
  svpwm: SvpwmParams;
  inverter: InverterParams;
  sensorless: SensorlessParams;
  weakField: WeakFieldParams;
  fault: FaultParams;
  controlLoop: ControlLoopParams;
  foc: FOCParams;
  hfi: HFIParams;
  startup: StartupParams;
  apf: APFParams;
  refrigeration: RefrigerationParams;
  setActiveModule: (moduleId: ModuleId) => void;
  setMode: (mode: 'teach' | 'lab') => void;
  setRunning: (running: boolean) => void;
  toggleFullScreen: () => void;
  step: (dt?: number) => void;
  resetTime: () => void;
  updateMotorBasics: (patch: Partial<MotorBasicsParams>) => void;
  updateThreePhase: (patch: Partial<ThreePhaseParams>) => void;
  updateClarke: (patch: Partial<ClarkeParams>) => void;
  updatePark: (patch: Partial<ParkParams>) => void;
  updatePid: (patch: Partial<PIDParams>) => void;
  updateSvpwm: (patch: Partial<SvpwmParams>) => void;
  updateInverter: (patch: Partial<InverterParams>) => void;
  updateSensorless: (patch: Partial<SensorlessParams>) => void;
  updateWeakField: (patch: Partial<WeakFieldParams>) => void;
  updateFault: (patch: Partial<FaultParams>) => void;
  updateControlLoop: (patch: Partial<ControlLoopParams>) => void;
  updateFoc: (patch: Partial<FOCParams>) => void;
  updateHfi: (patch: Partial<HFIParams>) => void;
  updateStartup: (patch: Partial<StartupParams>) => void;
  updateApf: (patch: Partial<APFParams>) => void;
  updateRefrigeration: (patch: Partial<RefrigerationParams>) => void;
  resetActiveParams: () => void;
  applyExperimentPreset: (presetId: string) => void;
  guideStepIndex: number;
  setGuideStepIndex: (guideStepIndex: number) => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  activeModule: 'three-phase',
  mode: 'teach',
  running: true,
  fullScreen: false,
  time: 0,
  motorBasics: motorBasicsDefault,
  threePhase: threePhaseDefault,
  clarke: clarkeDefault,
  park: parkDefault,
  pid: pidDefault,
  svpwm: svpwmDefault,
  inverter: inverterDefault,
  sensorless: sensorlessDefault,
  weakField: weakFieldDefault,
  fault: faultDefault,
  controlLoop: controlLoopDefault,
  foc: focDefault,
  hfi: hfiDefault,
  startup: startupDefault,
  apf: apfDefault,
  refrigeration: refrigerationDefault,
  guideStepIndex: 0,
  setActiveModule: (activeModule) => set({ activeModule }),
  setMode: (mode) => set({ mode }),
  setRunning: (running) => set({ running }),
  toggleFullScreen: () => set((state) => ({ fullScreen: !state.fullScreen })),
  step: (dt = 0.016) => set((state) => ({ time: state.time + dt })),
  resetTime: () => set({ time: 0 }),
  setGuideStepIndex: (guideStepIndex) => set({ guideStepIndex }),
  updateMotorBasics: (patch) => set((state) => {
    const next = { ...state.motorBasics, ...patch };
    // 自动把电机模型参数同步给依赖它们的下游模块（Rs / Ld / Lq / ψf / J / B）
    const sensorlessSync: Partial<SensorlessParams> = {};
    if (patch.rs !== undefined) sensorlessSync.rs = next.rs;
    if (patch.ldMh !== undefined || patch.lqMh !== undefined) sensorlessSync.lsMh = (next.ldMh + next.lqMh) / 2;
    if (patch.flux !== undefined || patch.polePairs !== undefined) {
      // Ke ≈ ψf · p（简化关系，常用估算）
      sensorlessSync.ke = next.flux;
    }
    const weakFieldSync: Partial<WeakFieldParams> = {};
    if (patch.ldMh !== undefined) weakFieldSync.ldMh = next.ldMh;
    if (patch.lqMh !== undefined) weakFieldSync.lqMh = next.lqMh;
    if (patch.flux !== undefined) weakFieldSync.flux = next.flux;
    if (patch.ratedCurrent !== undefined) weakFieldSync.currentLimit = next.ratedCurrent;
    const controlLoopSync: Partial<ControlLoopParams> = {};
    if (patch.inertiaUm !== undefined) controlLoopSync.inertia = next.inertiaUm * 1e-6;
    if (patch.dampingUm !== undefined) controlLoopSync.damping = next.dampingUm * 1e-6;
    return {
      motorBasics: next,
      sensorless: Object.keys(sensorlessSync).length ? { ...state.sensorless, ...sensorlessSync } : state.sensorless,
      weakField: Object.keys(weakFieldSync).length ? { ...state.weakField, ...weakFieldSync } : state.weakField,
      controlLoop: Object.keys(controlLoopSync).length ? { ...state.controlLoop, ...controlLoopSync } : state.controlLoop,
    };
  }),
  updateThreePhase: (patch) => set((state) => ({ threePhase: { ...state.threePhase, ...patch } })),
  updateClarke: (patch) => set((state) => ({ clarke: { ...state.clarke, ...patch } })),
  updatePark: (patch) => set((state) => ({ park: { ...state.park, ...patch } })),
  updatePid: (patch) => set((state) => ({ pid: { ...state.pid, ...patch } })),
  updateSvpwm: (patch) => set((state) => ({ svpwm: { ...state.svpwm, ...patch } })),
  updateInverter: (patch) => set((state) => ({ inverter: { ...state.inverter, ...patch } })),
  updateSensorless: (patch) => set((state) => ({ sensorless: { ...state.sensorless, ...patch } })),
  updateWeakField: (patch) => set((state) => ({ weakField: { ...state.weakField, ...patch } })),
  updateFault: (patch) => set((state) => ({ fault: { ...state.fault, ...patch } })),
  updateControlLoop: (patch) => set((state) => ({ controlLoop: { ...state.controlLoop, ...patch } })),
  updateFoc: (patch) => set((state) => ({ foc: { ...state.foc, ...patch } })),
  updateHfi: (patch) => set((state) => ({ hfi: { ...state.hfi, ...patch } })),
  updateStartup: (patch) => set((state) => ({ startup: { ...state.startup, ...patch } })),
  updateApf: (patch) => set((state) => ({ apf: { ...state.apf, ...patch } })),
  updateRefrigeration: (patch) => set((state) => ({ refrigeration: { ...state.refrigeration, ...patch } })),
  resetActiveParams: () => {
    const active = get().activeModule;
    if (active === 'motor-basics') set({ motorBasics: motorBasicsDefault });
    if (active === 'three-phase') set({ threePhase: threePhaseDefault });
    if (active === 'clarke-transform') set({ clarke: clarkeDefault });
    if (active === 'park-transform') set({ park: parkDefault });
    if (active === 'pid-control') set({ pid: pidDefault });
    if (active === 'svpwm') set({ svpwm: svpwmDefault });
    if (active === 'inverter') set({ inverter: inverterDefault });
    if (active === 'sensorless-foc') set({ sensorless: sensorlessDefault });
    if (active === 'field-weakening') set({ weakField: weakFieldDefault });
    if (active === 'faults-debugging') set({ fault: faultDefault });
    if (active === 'control-loops') set({ controlLoop: controlLoopDefault });
    if (active === 'foc-flow') set({ foc: focDefault });
    if (active === 'hfi-sensorless') set({ hfi: hfiDefault });
    if (active === 'startup-statemachine') set({ startup: startupDefault });
    if (active === 'apf-frontend') set({ apf: apfDefault });
    if (active === 'refrigeration-bench') set({ refrigeration: refrigerationDefault });
  },
  applyExperimentPreset: (presetId) => {
    const presets: Record<string, Partial<SimulationStore>> = {
      'rotating-field': {
        activeModule: 'three-phase',
        running: true,
        guideStepIndex: 0,
        threePhase: { amplitude: 7.5, frequency: 70, phaseDeg: 0, balance: 0, harmonic: 0, noise: 0 },
      },
      'motor-angle': {
        activeModule: 'motor-basics',
        running: true,
        guideStepIndex: 0,
        motorBasics: { ...motorBasicsDefault, polePairs: 4, mechanicalDeg: 90, rpm: 900 },
      },
      'motor-poles': {
        activeModule: 'motor-basics',
        running: true,
        guideStepIndex: 1,
        motorBasics: { ...motorBasicsDefault, polePairs: 6, mechanicalDeg: 120, rpm: 1100 },
      },
      'motor-rated': {
        activeModule: 'motor-basics',
        running: true,
        guideStepIndex: 2,
        motorBasics: { ...motorBasicsDefault, polePairs: 4, mechanicalDeg: 240, rpm: 3600, ratedCurrent: 12, ratedSpeed: 6000 },
      },
      'three-phase-fast': {
        activeModule: 'three-phase',
        running: true,
        guideStepIndex: 1,
        threePhase: { amplitude: 7.5, frequency: 120, phaseDeg: 0, balance: 0, harmonic: 0, noise: 0 },
      },
      'three-phase-distort': {
        activeModule: 'three-phase',
        running: true,
        guideStepIndex: 2,
        threePhase: { amplitude: 6.8, frequency: 55, phaseDeg: 18, balance: 0.18, harmonic: 0.18, noise: 0.35 },
      },
      'clarke-balanced': {
        activeModule: 'clarke-transform',
        running: false,
        guideStepIndex: 0,
        clarke: { ia: 4.2, ib: -2.1, ic: -2.1, amplitude: 5.2, phaseDeg: 0, balanced: true },
      },
      'clarke-manual': {
        activeModule: 'clarke-transform',
        running: false,
        guideStepIndex: 1,
        clarke: { ia: 5.8, ib: -1.9, ic: -3.2, amplitude: 5.2, phaseDeg: 0, balanced: false },
      },
      'clarke-phase': {
        activeModule: 'clarke-transform',
        running: false,
        guideStepIndex: 2,
        clarke: { ia: 3.4, ib: -4.2, ic: 0.8, amplitude: 5.2, phaseDeg: 45, balanced: true },
      },
      'park-align': {
        activeModule: 'park-transform',
        running: true,
        guideStepIndex: 0,
        park: { ...parkDefault, thetaDeg: 42, iAlpha: 3.8, iBeta: 4.1, speedRpm: 1500, idRef: 0, iqRef: 5.2 },
      },
      'park-angle-error': {
        activeModule: 'park-transform',
        running: true,
        guideStepIndex: 1,
        park: { ...parkDefault, thetaDeg: 18, iAlpha: 4.8, iBeta: 2.2, speedRpm: 1500, idRef: 0.4, iqRef: 4.2 },
      },
      'park-torque': {
        activeModule: 'park-transform',
        running: true,
        guideStepIndex: 2,
        park: { ...parkDefault, thetaDeg: 50, iAlpha: 2.5, iBeta: 5.1, speedRpm: 1900, idRef: 0, iqRef: 6.4 },
      },
      'foc-sample': {
        activeModule: 'foc-flow',
        running: false,
        guideStepIndex: 0,
      },
      'foc-current-loop': {
        activeModule: 'foc-flow',
        running: false,
        guideStepIndex: 1,
      },
      'foc-output': {
        activeModule: 'foc-flow',
        running: true,
        guideStepIndex: 2,
      },
      'clarke-projection': {
        activeModule: 'clarke-transform',
        running: false,
        clarke: { ...clarkeDefault, balanced: false, ia: 5.8, ib: -1.9, ic: -3.2 },
      },
      'park-dc': {
        activeModule: 'park-transform',
        running: true,
        park: { ...parkDefault, thetaDeg: 55, iAlpha: 4.2, iBeta: 3.4, speedRpm: 1800, idRef: 0, iqRef: 5.8 },
      },
      'pi-slow': {
        activeModule: 'pid-control',
        running: false,
        guideStepIndex: 0,
        pid: { ...pidDefault, kp: 0.65, ki: 3.2, kd: 0, target: 1.4, loadDisturbance: 0.1, limit: 18, antiWindup: true },
      },
      'pi-oscillate': {
        activeModule: 'pid-control',
        running: false,
        guideStepIndex: 1,
        pid: { ...pidDefault, kp: 7.8, ki: 66, kd: 0.01, target: 1.4, loadDisturbance: 0.18, limit: 24, antiWindup: false },
      },
      'pi-balanced': {
        activeModule: 'pid-control',
        running: false,
        guideStepIndex: 2,
        pid: { ...pidDefault, kp: 2.4, ki: 16, kd: 0.02, target: 1.25, loadDisturbance: 0.12, limit: 24, antiWindup: true },
      },
      'svpwm-sector': {
        activeModule: 'svpwm',
        running: true,
        guideStepIndex: 0,
        svpwm: { ...svpwmDefault, electricalDeg: 78, modulation: 0.82, uAlpha: 8.2, uBeta: 31.9 },
      },
      'svpwm-high-mod': {
        activeModule: 'svpwm',
        running: true,
        guideStepIndex: 1,
        svpwm: { ...svpwmDefault, electricalDeg: 12, modulation: 0.95, uAlpha: 166, uBeta: 35 },
      },
      'svpwm-saturation': {
        activeModule: 'svpwm',
        running: true,
        guideStepIndex: 2,
        svpwm: { ...svpwmDefault, electricalDeg: 12, modulation: 1.08, uAlpha: 171, uBeta: 36, uDc: 280 },
      },
      'inverter-clean': {
        activeModule: 'inverter',
        running: true,
        guideStepIndex: 0,
        inverter: { ...inverterDefault, uDc: 48, deadTimeUs: 0.8, dutyA: 0.62, dutyB: 0.38, dutyC: 0.5, modulationMode: 'svpwm' },
      },
      'inverter-deadtime': {
        activeModule: 'inverter',
        running: true,
        guideStepIndex: 1,
        inverter: { ...inverterDefault, uDc: 48, deadTimeUs: 3.4, dutyA: 0.58, dutyB: 0.42, dutyC: 0.5, modulationMode: 'svpwm' },
      },
      'inverter-overmod': {
        activeModule: 'inverter',
        running: true,
        guideStepIndex: 2,
        inverter: { ...inverterDefault, uDc: 36, deadTimeUs: 1.2, dutyA: 0.9, dutyB: 0.08, dutyC: 0.52, modulationMode: 'spwm' },
      },
      'vbus-drop': {
        activeModule: 'field-weakening',
        running: false,
        guideStepIndex: 1,
        weakField: { ...weakFieldDefault, uDc: 24, targetRpm: 6200, id: 0, iq: 6.2, currentLimit: 8 },
      },
      'negative-id': {
        activeModule: 'field-weakening',
        running: false,
        guideStepIndex: 2,
        weakField: { ...weakFieldDefault, uDc: 48, targetRpm: 7600, id: -5.8, iq: 5.4, currentLimit: 9 },
      },
      'weak-normal': {
        activeModule: 'field-weakening',
        running: false,
        guideStepIndex: 0,
        weakField: { ...weakFieldDefault, uDc: 48, targetRpm: 3600, id: 0, iq: 5.8, currentLimit: 8 },
      },
      'weak-saturation': {
        activeModule: 'field-weakening',
        running: false,
        guideStepIndex: 1,
        weakField: { ...weakFieldDefault, uDc: 24, targetRpm: 8200, id: 0, iq: 6.4, currentLimit: 8 },
      },
      'weak-negative-id': {
        activeModule: 'field-weakening',
        running: false,
        guideStepIndex: 2,
        weakField: { ...weakFieldDefault, uDc: 48, targetRpm: 8600, id: -5.6, iq: 5.0, currentLimit: 9 },
      },
      'speed-loop-osc': {
        activeModule: 'control-loops',
        running: false,
        guideStepIndex: 2,
        controlLoop: { ...controlLoopDefault, speedKp: 0.28, speedKi: 3.8, targetSpeed: 2400, loadTorque: 0.15 },
      },
      'loops-stable': {
        activeModule: 'control-loops',
        running: false,
        guideStepIndex: 0,
        controlLoop: { ...controlLoopDefault, currentKp: 2.4, currentKi: 30, speedKp: 0.08, speedKi: 0.8, positionKp: 3.5, targetSpeed: 1500 },
      },
      'loops-slow': {
        activeModule: 'control-loops',
        running: false,
        guideStepIndex: 1,
        controlLoop: { ...controlLoopDefault, currentKp: 1.8, currentKi: 18, speedKp: 0.025, speedKi: 0.18, positionKp: 1.2, targetSpeed: 1500 },
      },
      'sensorless-lock': {
        activeModule: 'sensorless-foc',
        running: true,
        guideStepIndex: 0,
        sensorless: { ...sensorlessDefault, speedRpm: 900, ke: 0.045, observerGain: 0.8, pllKp: 82, pllKi: 1250, noise: 0.06 },
      },
      'low-speed-sensorless': {
        activeModule: 'sensorless-foc',
        running: true,
        guideStepIndex: 1,
        sensorless: { ...sensorlessDefault, speedRpm: 80, ke: 0.035, observerGain: 0.45, pllKp: 38, pllKi: 280, noise: 0.46 },
      },
      'sensorless-low-speed': {
        activeModule: 'sensorless-foc',
        running: true,
        guideStepIndex: 1,
        sensorless: { ...sensorlessDefault, speedRpm: 80, ke: 0.035, observerGain: 0.45, pllKp: 38, pllKi: 280, noise: 0.46 },
      },
      'sensorless-gain': {
        activeModule: 'sensorless-foc',
        running: true,
        guideStepIndex: 2,
        sensorless: { ...sensorlessDefault, speedRpm: 900, ke: 0.045, observerGain: 1.6, pllKp: 150, pllKi: 2600, noise: 0.22 },
      },
      'fault-over-current': {
        activeModule: 'faults-debugging',
        running: false,
        guideStepIndex: 0,
        fault: { faultType: 'over-current', severity: 0.9 },
      },
      'phase-order-error': {
        activeModule: 'faults-debugging',
        running: false,
        guideStepIndex: 1,
        fault: { faultType: 'phase-order', severity: 0.82 },
      },
      'current-offset': {
        activeModule: 'faults-debugging',
        running: false,
        guideStepIndex: 2,
        fault: { faultType: 'current-offset', severity: 0.72 },
      },
      'fridge-low-load': {
        activeModule: 'refrigeration-bench',
        running: true,
        guideStepIndex: 0,
        refrigeration: { ...refrigerationDefault, refrigerant: 'R32', Te: 12, Tc: 38, superheatK: 5, subcoolK: 4, ambientOutdoorC: 28, ambientIndoorC: 26, eevOpening: 0.55 },
      },
      'fridge-high-load': {
        activeModule: 'refrigeration-bench',
        running: true,
        guideStepIndex: 1,
        refrigeration: { ...refrigerationDefault, refrigerant: 'R410A', Te: 5, Tc: 55, superheatK: 8, subcoolK: 2, ambientOutdoorC: 45, ambientIndoorC: 27, eevOpening: 0.7 },
      },
      'fridge-frozen': {
        activeModule: 'refrigeration-bench',
        running: true,
        guideStepIndex: 2,
        refrigeration: { ...refrigerationDefault, refrigerant: 'R134a', Te: -25, Tc: 40, superheatK: 6, subcoolK: 3, ambientOutdoorC: 25, ambientIndoorC: -18, eevOpening: 0.4, displacementCc: 12 },
      },
    };
    const preset = presets[presetId];
    if (preset) set({ ...preset, time: 0 });
  },
}));
