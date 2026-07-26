import { clampError } from './limits';
import type { StartupParams, StartupState } from '../engine/types';

/**
 * 压缩机启动状态机时域仿真。
 *
 * 状态序列（双向）：
 *   idle → precharge → align → open-loop → hfi → bemf ↔ fieldweak
 *
 * 新增：
 *   - 故障态（fault）：任意状态检测到异常时转入，模拟停机保护
 *   - fieldweak → bemf 下转换：转速回落时自动退出弱磁
 */
export interface StartupSample {
  t: number;
  state: StartupState;
  rpm: number;
  rpmRef: number;
  iqA: number;
  inFieldWeak: boolean;
  /** 非空时表示处于故障状态 */
  faultReason?: string | undefined;
}

const TOTAL_SEC = 8.0;
const DT = 0.005;

export function simulateStartup(params: StartupParams): StartupSample[] {
  const samples: StartupSample[] = [];
  let state: StartupState = 'idle';
  let stateEnterTime = 0;
  let rpm = 0;
  let rpmRef = 0;
  let faultReason: string | undefined;
  const totalSteps = Math.round(TOTAL_SEC / DT);

  // 参数 NaN 防护
  const targetRpm = clampError(params.targetRpm, 0, 100000);
  const accelRamp = clampError(params.accelRampRpmS, 10, 50000);
  const alignDuration = clampError(params.alignDurationMs, 10, 10000);
  const hfiHandoff = clampError(params.hfiHandoffRpm, 0, targetRpm);
  const bemfHandoff = clampError(params.bemfHandoffRpm, 0, targetRpm);
  const fieldweakRpm = clampError(params.fieldweakRpm, 0, targetRpm + 10000);
  const loadTorque = clampError(params.loadTorque ?? 0, 0, 100);

  for (let step = 0; step <= totalSteps; step++) {
    const t = step * DT;
    const stateAge = (t - stateEnterTime) * 1000;

    // === 故障检测（所有状态下生效）===
    if (state !== 'idle' && state !== 'precharge' && state !== 'fault') {
      // 过电流检测（iqA > 20A 或 rpmRef >> rpm 时）
      const iqA_tmp = calcIqA(state, rpm, rpmRef, targetRpm, loadTorque);
      if (iqA_tmp > 20 && !['idle', 'precharge', 'fault'].includes(state)) {
        faultReason = '过电流 (Iq > 20A)';
      } else if (state !== 'align' && rpm < 10 && t > 1) {
        faultReason = '转子堵转 / 失速 (RPM < 10 超过 1s)';
      } else if (rpm > targetRpm * 1.3 && targetRpm > 100) {
        faultReason = `超速 (${Math.round(rpm)} > ${Math.round(targetRpm * 1.3)})`;
      }
    }

    // === 状态机（故障时锁在 fault）===
    if (faultReason && state !== 'fault' && state !== 'idle') {
      state = 'fault';
      stateEnterTime = t;
    }

    switch (state) {
      case 'idle': {
        if (t >= 0.05) { state = 'precharge'; stateEnterTime = t; }
        break;
      }
      case 'precharge': {
        if (stateAge >= 200) { state = 'align'; stateEnterTime = t; }
        break;
      }
      case 'align': {
        if (stateAge >= alignDuration) { state = 'open-loop'; stateEnterTime = t; rpmRef = 0; }
        break;
      }
      case 'open-loop': {
        rpmRef = Math.min(hfiHandoff, rpmRef + accelRamp * DT);
        if (rpm >= hfiHandoff * 0.95) { state = 'hfi'; stateEnterTime = t; }
        break;
      }
      case 'hfi': {
        rpmRef = Math.min(bemfHandoff, rpmRef + accelRamp * DT);
        if (rpm >= bemfHandoff * 0.95) { state = 'bemf'; stateEnterTime = t; }
        break;
      }
      case 'bemf': {
        rpmRef = Math.min(targetRpm, rpmRef + accelRamp * DT);
        if (rpm >= fieldweakRpm * 0.95 && targetRpm > fieldweakRpm) {
          state = 'fieldweak'; stateEnterTime = t;
        }
        // 下转换：转速跌落超过 fieldweakRpm 的 5% 时退出弱磁
        if (state === 'bemf' && rpm < fieldweakRpm * 0.85 && targetRpm < fieldweakRpm) {
          // bemf 不直接回到 fieldweak
        }
        break;
      }
      case 'fieldweak': {
        rpmRef = Math.min(targetRpm, rpmRef + accelRamp * DT);
        // 双向：转速跌到 fieldweakRpm 的 85% 以下时退出弱磁回 bemf
        if (rpm < fieldweakRpm * 0.85) {
          state = 'bemf'; stateEnterTime = t;
        }
        break;
      }
      case 'fault': {
        // 故障态：rpm 快速下降，模拟停机
        rpmRef = Math.max(0, rpmRef - accelRamp * DT * 2);
        break;
      }
    }

    // === 一阶电机响应 ===
    const tau = state === 'fault' ? 0.05 : 0.15;
    rpm += (rpmRef - rpm) * (DT / tau);
    rpm = Math.max(0, rpm);

    const iqA = calcIqA(state, rpm, rpmRef, targetRpm, loadTorque);

    if (step % 2 === 0) {
      samples.push({
        t: t * 1000,
        state,
        rpm,
        rpmRef,
        iqA,
        inFieldWeak: state === 'fieldweak',
        faultReason,
      });
    }
  }
  return samples;
}

/** 简化的输出电流计算 */
function calcIqA(state: StartupState, rpm: number, rpmRef: number, targetRpm: number, loadTorque: number): number {
  const iqBase = state === 'align' ? 4 : state === 'fault' ? 0 : 0;
  const iqDynamic = (rpmRef - rpm) * 0.02;
  const iqLoad = 0.5 + (rpm / Math.max(targetRpm, 1)) * 6 + loadTorque * 2;
  return Math.max(0, iqBase + iqDynamic + iqLoad);
}

export const STATE_DESCRIPTIONS: Record<StartupState, { name: string; brief: string; color: string }> = {
  idle:        { name: '待机',     brief: '上电前；输出关',                color: '#5d7793' },
  precharge:   { name: '母线预充电', brief: '限流电阻给母线电容缓充 ~200ms', color: '#ffb84d' },
  align:       { name: '转子对齐',  brief: '给 d 轴施加直流电压让转子停在零位', color: '#34d6ff' },
  'open-loop': { name: 'V/f 开环',  brief: '强制斜坡升速到 ~100rpm，转子被磁场拖动', color: '#a3e635' },
  hfi:         { name: 'HFI 接管',  brief: '高频注入解调出角度，BEMF 还不够大',   color: '#22d3ee' },
  bemf:        { name: 'BEMF 闭环', brief: '反电动势观测器精度足够，正常 FOC 运行', color: '#43f7b5' },
  fieldweak:   { name: '弱磁运行',  brief: '高速时电压撞限，注入负 Id 削弱磁链',    color: '#fb7185' },
  fault:       { name: '故障停机',  brief: '检测到异常，PWM 关断',               color: '#ef4444' },
};
