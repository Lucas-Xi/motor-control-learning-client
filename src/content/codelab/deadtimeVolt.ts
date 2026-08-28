import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：死区平均误差电压（08 号模块 · 逆变器）。
 *
 * 测试向量由 src/simulation/math/deadtime.ts 的参考实现冻结生成：
 *   dv = sign(iLoad) · Vdc · Td/Tsw，其中 Td/Tsw = dtSec·fsw
 */
export const deadtimeVoltChallenge: CodeChallenge = {
  id: 'deadtime-volt',
  moduleId: 'inverter',
  functionName: 'deadtimeVolt',
  difficulty: 2,
  title: e('编程挑战：计算死区平均误差电压', 'Code Lab: compute the dead-time average error voltage'),
  statement: e(
    '桥臂死区期间上下管同时关断，相电流只能经续流二极管流向母线，输出端被强行钳在 Vdc 或 0——' +
      '平均下来每个开关周期损失占空比 Td·fsw，折成电压就是 Vdc·Td·fsw。实现 deadtimeVolt(iLoad, dtSec, fsw, vdc) 返回 [dv]：' +
      'iLoad > 0（A+ 方向流出桥臂）时该相电压被拉低，补偿前馈 dv = +Vdc·Td·fsw；iLoad < 0 时符号翻转；iLoad = 0 时极性未定，dv = 0。规则与上方死区补偿卡一致。',
    'During dead time both gate signals are off and the phase current freewheels through the diodes into the bus, clamping the phase terminal to Vdc or 0 — ' +
      'averaged over a switching period the duty loss is Td·fsw, i.e. a voltage error of Vdc·Td·fsw. Implement deadtimeVolt(iLoad, dtSec, fsw, vdc) and return [dv]: ' +
      'with iLoad > 0 (flowing out of the bridge, A+ direction) the phase voltage sags, so the feed-forward is dv = +Vdc·Td·fsw; with iLoad < 0 the sign flips; at exactly zero current the polarity is undefined and dv = 0. These rules match the dead-time card above.',
  ),
  starter: `// TODO: 返回 [dv]（死区平均误差电压，V）
// 提示：幅值 = vdc * dtSec * fsw；符号 = iLoad 的极性（iLoad=0 → dv=0）
function deadtimeVolt(iLoad, dtSec, fsw, vdc) {
  const dv = 0;
  return [dv];
}
return deadtimeVolt;`,
  cases: [
    { label: 'i=+8A, Td=2μs, fsw=10kHz, Vdc=48V（正电流）', args: [8, 2e-6, 10e3, 48], expected: [0.9600000000] },
    { label: 'i=-8A, Td=2μs, fsw=10kHz, Vdc=48V（负电流反号）', args: [-8, 2e-6, 10e3, 48], expected: [-0.9600000000] },
    { label: 'i=+5A, Td=1.5μs, fsw=20kHz, Vdc=310V（高压母线）', args: [5, 1.5e-6, 20e3, 310], expected: [9.3000000000] },
    { label: 'i=-12A, Td=3μs, fsw=10kHz, Vdc=24V（低压母线）', args: [-12, 3e-6, 10e3, 24], expected: [-0.7200000000] },
    { label: 'i=0A（零电流，极性未定）', args: [0, 2e-6, 10e3, 48], expected: [0] },
    { label: 'Td=0（极限：无死区）', args: [10, 0, 20e3, 310], expected: [0] },
  ],
  hints: [
    e(
      '占空比损失是 Td·fsw（死区占开关周期的比例），平均电压误差幅值再乘上 Vdc。量纲自检：s · 1/s · V = V。',
      'The duty loss is Td·fsw (dead time as a fraction of the switching period); multiply by Vdc for the average voltage-error magnitude. Dimension check: s · 1/s · V = V.',
    ),
    e(
      '符号只看电流方向：i>0 补 +，i<0 补 −，i=0 返回 0。过零附近工程上会加滞环保留上一拍符号，本题从简。',
      'The sign follows current polarity only: + for i>0, − for i<0, and 0 for exactly zero current. Real firmware adds hysteresis near zero crossings to hold the previous sign; keep it simple here.',
    ),
    e(
      'STM32 上把 Vdc·Td·fsw 预计算成单个常数，ISR 里只剩符号判断加一次乘法；母线电压波动时按拍的 Vdc 采样刷新它。',
      'On STM32 precompute Vdc·Td·fsw into a single constant so the ISR only does a sign check plus one multiply; refresh it from per-cycle bus-voltage sampling when Vdc drifts.',
    ),
  ],
  cReference: `/* STM32 C 参考：死区平均误差电压（符号函数 + 预计算幅值，前馈补偿用） */
typedef struct { float v_dc; float dt_sec; float f_sw; } dt_cfg_t;

/* 初始化时算一次：dv_mag = Vdc * Td * fsw（母线电压变化时刷新） */
static inline float dt_volt_mag(const dt_cfg_t *c)
{
    return c->v_dc * c->dt_sec * c->f_sw;
}

static inline int8_t i_sign(float i)
{
    if (i > 0.0f) return  1;   /* 电流流出桥臂：相电压被拉低，补 +|dv| */
    if (i < 0.0f) return -1;   /* 电流流入桥臂：补偿量反号 */
    return 0;                  /* 过零：工程上查表滞环，保持上一拍符号 */
}

static inline float deadtime_volt(float i_load, const dt_cfg_t *c)
{
    return (float)i_sign(i_load) * dt_volt_mag(c);
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与参考实现一致）。 */
export const deadtimeVoltSolution: string = `function deadtimeVolt(iLoad, dtSec, fsw, vdc) {
  const sign = iLoad > 0 ? 1 : iLoad < 0 ? -1 : 0;
  const dv = sign * vdc * dtSec * fsw;
  return [dv];
}
return deadtimeVolt;`;
