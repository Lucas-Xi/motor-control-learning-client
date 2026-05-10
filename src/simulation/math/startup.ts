import type { StartupParams, StartupState } from '../engine/types';

/**
 * 压缩机启动状态机时域仿真。
 *
 * 状态序列：
 *   idle → precharge → align → open-loop → hfi → bemf → fieldweak (高速)
 *
 * 进入 / 退出条件：
 *   precharge:  上电瞬间，等待母线电压稳定 (200ms)
 *   align:      给 d 轴施加直流电压让转子停在零位 (alignDurationMs)
 *   open-loop:  V/f 强制启动，转速按 accelRampRpmS 斜坡上升
 *   hfi:        转速达到 hfiHandoffRpm 时切换，HFI 接管角度估算
 *   bemf:       转速达到 bemfHandoffRpm 时切换，BEMF 观测器接管
 *   fieldweak:  转速超过 fieldweakRpm 时进入弱磁
 *
 * 反液击：accelRampRpmS 限制升速率（典型 600 rpm/s 以下），避免压缩机液击。
 */
export interface StartupSample {
  t: number;             // ms
  state: StartupState;
  rpm: number;
  rpmRef: number;        // 当前指令转速
  iqA: number;           // 输出电流（演示）
  inFieldWeak: boolean;
}

const TOTAL_SEC = 8.0;     // 8 秒展示完整启动过程
const DT = 0.005;          // 5ms 仿真步

export function simulateStartup(params: StartupParams): StartupSample[] {
  const samples: StartupSample[] = [];
  let state: StartupState = 'idle';
  let stateEnterTime = 0;
  let rpm = 0;
  let rpmRef = 0;
  const totalSteps = Math.round(TOTAL_SEC / DT);

  for (let step = 0; step <= totalSteps; step++) {
    const t = step * DT;
    const stateAge = (t - stateEnterTime) * 1000;     // ms

    // === 状态机 ===
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
        if (stateAge >= params.alignDurationMs) { state = 'open-loop'; stateEnterTime = t; rpmRef = 0; }
        break;
      }
      case 'open-loop': {
        // 斜坡升速直到 hfiHandoffRpm
        rpmRef = Math.min(params.hfiHandoffRpm, rpmRef + params.accelRampRpmS * DT);
        if (rpm >= params.hfiHandoffRpm * 0.95) { state = 'hfi'; stateEnterTime = t; }
        break;
      }
      case 'hfi': {
        // 继续升到 bemfHandoffRpm
        rpmRef = Math.min(params.bemfHandoffRpm, rpmRef + params.accelRampRpmS * DT);
        if (rpm >= params.bemfHandoffRpm * 0.95) { state = 'bemf'; stateEnterTime = t; }
        break;
      }
      case 'bemf': {
        // 加速到目标转速；如果超过 fieldweakRpm 就过渡到弱磁
        rpmRef = Math.min(params.targetRpm, rpmRef + params.accelRampRpmS * DT);
        if (rpm >= params.fieldweakRpm * 0.95 && params.targetRpm > params.fieldweakRpm) {
          state = 'fieldweak'; stateEnterTime = t;
        }
        break;
      }
      case 'fieldweak': {
        rpmRef = Math.min(params.targetRpm, rpmRef + params.accelRampRpmS * DT);
        break;
      }
    }

    // === 一阶电机响应模型（rpm 跟踪 rpmRef） ===
    const tau = 0.15;       // 等效响应时间常数
    rpm += (rpmRef - rpm) * (DT / tau);

    // === 输出电流随负载（简化）===
    const iqBase = state === 'align' ? 4 : 0;
    const iqDynamic = (rpmRef - rpm) * 0.02;     // 加速时多出力
    const iqLoad = 0.5 + (rpm / params.targetRpm) * 6;
    const iqA = Math.max(0, iqBase + iqDynamic + iqLoad);

    if (step % 2 === 0) {
      samples.push({
        t: t * 1000,
        state,
        rpm,
        rpmRef,
        iqA,
        inFieldWeak: state === 'fieldweak',
      });
    }
  }
  return samples;
}

export const STATE_DESCRIPTIONS: Record<StartupState, { name: string; brief: string; color: string }> = {
  idle:        { name: '待机',     brief: '上电前；输出关',                color: '#5d7793' },
  precharge:   { name: '母线预充电', brief: '限流电阻给母线电容缓充 ~200ms', color: '#ffb84d' },
  align:       { name: '转子对齐',  brief: '给 d 轴施加直流电压让转子停在零位', color: '#34d6ff' },
  'open-loop': { name: 'V/f 开环',  brief: '强制斜坡升速到 ~100rpm，转子被磁场拖动', color: '#a3e635' },
  hfi:         { name: 'HFI 接管',  brief: '高频注入解调出角度，BEMF 还不够大',   color: '#22d3ee' },
  bemf:        { name: 'BEMF 闭环', brief: '反电动势观测器精度足够，正常 FOC 运行', color: '#43f7b5' },
  fieldweak:   { name: '弱磁运行',  brief: '高速时电压撞限，注入负 Id 削弱磁链',    color: '#fb7185' },
};
