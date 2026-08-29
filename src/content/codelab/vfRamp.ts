import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：V/f 启动电压指令（15 号模块 startup-statemachine）。
 *
 * 开环 V/f 的电压-频率曲线（恒转矩线性区 + 额定点以上恒压弱磁）：
 *   f ≤ fRated：v = vRated·(f/fRated)（恒 V/Hz，磁链近似恒定）
 *   f > fRated：v = vRated（电压封顶，弱磁区靠反电动势让位）
 *   f < 0：按 0 处理（启动阶段不允许反转指令）
 * 期望值由该规则冻结生成（10 位小数）。
 */
export const vfRampChallenge: CodeChallenge = {
  id: 'vf-ramp',
  moduleId: 'startup-statemachine',
  functionName: 'vfRamp',
  difficulty: 2,
  title: e('编程挑战：V/f 启动电压指令', 'Code Lab: V/f startup voltage command'),
  statement: e(
    '开环 V/f 是无感启动的第一段：转速还没起来、观测器还没信度时，只靠一条电压-频率曲线把电机拖起来。' +
      '实现 vfRamp(fReqHz, fRatedHz, vRated)，返回 [vOut]（V）。规则：' +
      '① 频率指令为负按 0 处理；② f ≤ fRated 时 v = vRated·(f/fRated)——恒 V/Hz 线性区，磁链近似不变；' +
      '③ f > fRated 时钳在 vRated——逆变器电压封顶，进入弱磁区，频率再高电压也不再涨。' +
      '三个分支一条曲线：0 → 原点，额定点 → (fRated, vRated)，之后水平。先夹频率再算电压，别写两遍公式。',
    'Open-loop V/f is the first leg of sensorless startup: before the rotor is moving and before any observer is trustworthy, a single voltage-versus-frequency curve drags the machine up to speed. ' +
      'Implement vfRamp(fReqHz, fRatedHz, vRated) returning [vOut] in volts. Rules: ' +
      '(1) clamp a negative frequency command to 0; (2) for f ≤ fRated, v = vRated·(f/fRated) — the constant-V/Hz linear region, keeping the flux roughly constant; ' +
      '(3) for f > fRated, clamp to vRated — the inverter voltage is capped, the machine enters field weakening, and voltage no longer rises with frequency. ' +
      'Three branches, one curve: through the origin, through the rated point (fRated, vRated), then flat. Clamp the frequency first, then evaluate the voltage once.',
  ),
  starter: `// TODO: 返回 [vOut]（V/f 电压指令，V）
// 提示：先夹频率 f = Math.max(0, Math.min(fReqHz, fRatedHz))，再 vOut = vRated * f / fRatedHz
function vfRamp(fReqHz, fRatedHz, vRated) {
  const vOut = 0;
  return [vOut];
}
return vfRamp;`,
  cases: [
    { label: 'f=0 Hz（静止 → 零压）', args: [0, 50, 310], expected: [0] },
    { label: 'f=25 Hz（半额 → 半压）', args: [25, 50, 310], expected: [155] },
    { label: 'f=50 Hz（额定点 → 满压）', args: [50, 50, 310], expected: [310] },
    { label: 'f=75 Hz（150% 超频 → 钳在 vRated）', args: [75, 50, 310], expected: [310] },
    { label: 'f=-10 Hz（负频率按 0）', args: [-10, 50, 310], expected: [0] },
    { label: 'f=30, fRated=60, vRated=220（另一台额定）', args: [30, 60, 220], expected: [110] },
  ],
  hints: [
    e('把三个分支压成两步：先夹频率 f = max(0, min(fReqHz, fRatedHz))，再 v = vRated·f/fRated——Math.max/min 都在白名单里。', 'Collapse the three branches into two steps: clamp first, f = max(0, min(fReqHz, fRatedHz)), then v = vRated·f/fRated — Math.max/min are both on the whitelist.'),
    e('额定点 f = fRated 要落在两个分支的交点上：夹完后公式自然给出 v = vRated，不用单独 if。', 'The rated point f = fRated sits exactly at the branch junction: after clamping, the single formula yields v = vRated with no special case.'),
    e('实机斜坡在状态机里：每拍朝目标频率走 accel·Ts 一步，再把频率喂给本函数取电压。别在 ISR 里除法——1/fRated 上电预计算成常数。', 'On real hardware the ramp lives in the state machine: each tick steps the frequency by accel·Ts toward the target, then this function maps it to voltage. Keep divisions out of the ISR — precompute 1/fRated once at power-up.'),
  ],
  cReference: `/* STM32 C 参考：V/f 斜坡状态机片段（10ms 控制拍） */
typedef struct { float f_req, f_rated, v_rated, v_out; } vf_t;

static inline float vf_map(float f_req, float f_rated, float v_rated)
{
    if (f_req < 0.0f)    f_req = 0.0f;    /* 启动段禁反转指令 */
    if (f_req > f_rated) f_req = f_rated; /* 弱磁区恒压 */
    return v_rated * f_req / f_rated;     /* 恒 V/Hz 线性区 */
}

/* 每 tick：频率朝目标斜坡逼近，再映射电压 */
static void vf_ramp_tick(vf_t *vf, float f_target, float accel_hz_s, float ts)
{
    float step = accel_hz_s * ts;         /* 反液击：加速度受压缩机限制 */
    if (vf->f_req < f_target)      vf->f_req += step;
    else if (vf->f_req > f_target) vf->f_req -= step;
    vf->v_out = vf_map(vf->f_req, vf->f_rated, vf->v_rated);
}`,
};

/** 官方答案（朴素风格，注册进 solutions.ts）。 */
export const vfRampSolution: string = `function vfRamp(fReqHz, fRatedHz, vRated) {
  const f = Math.max(0, Math.min(fReqHz, fRatedHz));
  const vOut = vRated * f / fRatedHz;
  return [vOut];
}
return vfRamp;`;
