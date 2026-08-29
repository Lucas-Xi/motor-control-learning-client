import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：单步 PI + 输出限幅 + clamping 抗积分饱和（PID 控制模块）。
 *
 * 测试向量按题面规则（Ts = 1 ms、limit = ±10、饱和同向冻结）由独立参考
 * 脚本冻结生成。src/simulation/math/pid.ts 的完整实现另提供
 * back-calculation 抗饱和与微分滤波，本题只取其单步 PI 的核心骨架，
 * 题面规则自洽、判题与运行期实现解耦。
 */
export const piStepChallenge: CodeChallenge = {
  id: 'pi-step',
  moduleId: 'pid-control',
  functionName: 'piStep',
  difficulty: 2,
  title: e('编程挑战：单步 PI 与 clamping 抗饱和', 'Code Lab: single-step PI with clamping anti-windup'),
  statement: e(
    '实现电流环的单步 PI 控制器：piStep(err, kp, ki, stateIn)。stateIn 是上一拍的积分器状态——' +
      '完整实现里它是状态向量 [integralPrev]，本题只有一个分量，判题器直接传该标量。规则：' +
      '① 未限幅输出 v = kp*err + integralPrev；② out = clamp(v, -10, 10)；' +
      '③ 若 v 未饱和、或饱和方向与 err 符号相反（v > 10 且 err < 0，或 v < -10 且 err > 0），' +
      '积分器更新 integralNew = integralPrev + ki*err*Ts（Ts = 0.001 s 固定），' +
      '否则冻结 integralNew = integralPrev（clamping 抗积分饱和）。' +
      '返回 [out, integralNew]，把新状态回传给调用方，函数本身不持有状态。',
    'Implement one step of the current-loop PI controller: piStep(err, kp, ki, stateIn). ' +
      'stateIn is the previous integrator state — the state vector [integralPrev] in a full implementation; ' +
      'here it has a single component and the judge passes it as a plain number. Rules: ' +
      '(1) unsaturated output v = kp*err + integralPrev; (2) out = clamp(v, -10, 10); ' +
      '(3) if v is not saturated, or the saturation opposes the error sign (v > 10 with err < 0, or v < -10 with err > 0), ' +
      'update integralNew = integralPrev + ki*err*Ts with Ts = 0.001 s fixed; ' +
      'otherwise freeze integralNew = integralPrev (clamping anti-windup). ' +
      'Return [out, integralNew] so the caller owns the state — the function keeps none.',
  ),
  starter: `// TODO: 返回 [out, integralNew]
// 常量：TS = 0.001 s，LIMIT = 10；stateIn 即上一拍的 integralPrev
function piStep(err, kp, ki, stateIn) {
  const integralPrev = stateIn;
  const out = 0;
  const integralNew = integralPrev;
  return [out, integralNew];
}
return piStep;`,
  starterEn: `// TODO: return [out, integralNew]
// Constants: TS = 0.001 s, LIMIT = 10; stateIn is integralPrev from the previous cycle
function piStep(err, kp, ki, stateIn) {
  const integralPrev = stateIn;
  const out = 0;
  const integralNew = integralPrev;
  return [out, integralNew];
}
return piStep;`,
  cases: [
    { label: 'err=0, kp=2, ki=5, I=0（零输入）', args: [0, 2, 5, 0], expected: [0, 0] },
    { label: 'err=1, kp=2, ki=5, I=0.5（未饱和）', args: [1, 2, 5, 0.5], expected: [2.5, 0.505] },
    { label: 'err=3, kp=4, ki=10, I=8（正饱和→冻结）', args: [3, 4, 10, 8], expected: [10, 8] },
    { label: 'err=-2, kp=5, ki=8, I=-7（负饱和→冻结）', args: [-2, 5, 8, -7], expected: [-10, -7] },
    { label: 'err=-0.2, kp=30, ki=6, I=17（正饱和但误差反向→仍积累）', args: [-0.2, 30, 6, 17], expected: [10, 16.9988] },
    { label: 'err=1, kp=8, ki=5, I=2（v 恰好 = 10 边界）', args: [1, 8, 5, 2], expected: [10, 2.005] },
  ],
  hints: [
    e('先算未限幅值 v 再夹紧：v 是否越过 ±10 同时决定输出和积分器的命运，把两件事放在同一处判断。', 'Compute the unsaturated v first, then clamp: whether v crosses ±10 decides both the output and the fate of the integrator — judge them in the same place.'),
    e('冻结只发生在"饱和且同向"：v > 10 且 err > 0，或 v < -10 且 err < 0。误差反向时即使饱和也要继续积累，否则退饱和会迟滞好几拍。', 'Freeze only on "saturated and same-direction": v > 10 with err > 0, or v < -10 with err < 0. When the error opposes the saturation, keep integrating — otherwise unwinding lags several samples.'),
    e('STM32 上状态放进调用方持有的结构体逐拍回写（见 C 参考），TS、LIMIT 为编译期常量，ISR 里没有除法。', 'On STM32 the state lives in a caller-owned struct rewritten each cycle (see the C reference); TS and LIMIT are compile-time constants and the ISR does no division.'),
  ],
  cReference: `/* STM32 C 参考：单步 PI + clamping 抗饱和（无状态：状态由调用方持有回写） */
typedef struct { float integral; } pi_state_t;

static inline float pi_step(float err, float kp, float ki,
                            pi_state_t *st, float *out)
{
    const float TS = 0.001f;        /* 1 kHz 电流环 */
    const float LIMIT = 10.0f;      /* 输出限幅 */
    float v = kp * err + st->integral;              /* 未限幅输出 */
    float u = v > LIMIT ? LIMIT : (v < -LIMIT ? -LIMIT : v);
    int frozen = (v > LIMIT && err > 0.0f) ||       /* 正饱和且误差同向 */
                 (v < -LIMIT && err < 0.0f);        /* 负饱和且误差同向 */
    if (!frozen)                                    /* 未饱和或反向才积累 */
        st->integral += ki * err * TS;
    *out = u;
    return st->integral;                            /* 新状态回传调用方 */
}`,
};

export const piStepSolution: string = `function piStep(err, kp, ki, stateIn) {
  const TS = 0.001;
  const LIMIT = 10;
  const integralPrev = stateIn;
  const v = kp * err + integralPrev;
  const out = Math.max(-LIMIT, Math.min(LIMIT, v));
  const sameDir = (v > LIMIT && err > 0) || (v < -LIMIT && err < 0);
  const integralNew = sameDir ? integralPrev : integralPrev + ki * err * TS;
  return [out, integralNew];
}
return piStep;`;
