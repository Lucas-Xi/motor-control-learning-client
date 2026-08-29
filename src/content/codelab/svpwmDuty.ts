import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：SVPWM 扇区判定 + 基本矢量作用时间（SVPWM 模块）。
 *
 * 测试向量由 src/simulation/math/svpwm.ts 的 determineSvpwmSector /
 * calculateSvpwm（carrierPeriod = 1，作用时间归一化）冻结生成：
 *   m = √3·|V|/Vdc；t1 = m·sin(π/3 − φ)；t2 = m·sin(φ)
 */
export const svpwmDutyChallenge: CodeChallenge = {
  id: 'svpwm-core',
  moduleId: 'svpwm',
  functionName: 'svpwmCore',
  difficulty: 3,
  title: e('编程挑战：SVPWM 扇区判定与作用时间', 'Code Lab: SVPWM sector and active-vector times'),
  statement: e(
    '实现 SVPWM 的核心几何：扇区判定与基本矢量作用时间。svpwmCore(valpha, vbeta, vdc) 返回 [sector, t1, t2]。' +
      '规则：① 角度 θ = atan2(vbeta, valpha) 归一到 [0, 2π)，sector = floor(θ / 60°) + 1（1~6，零矢量约定落在扇区 1）；' +
      '② 调制指数 m = √3·|V| / Vdc，其中 |V| = hypot(valpha, vbeta)；' +
      '③ 扇区内角 φ = θ - (sector-1)·60°，归一化作用时间（载波周期取 1）t1 = m·sin(60° - φ)、t2 = m·sin(φ)。' +
      '线性区（m ≤ 1）内 t1 + t2 ≤ 1；零矢量时间 t0 = 1 - t1 - t2 无需返回。',
    'Implement the core geometry of SVPWM: sector identification and active-vector dwell times. ' +
      'svpwmCore(valpha, vbeta, vdc) returns [sector, t1, t2]. Rules: ' +
      '(1) angle θ = atan2(vbeta, valpha) wrapped into [0, 2π), sector = floor(θ / 60°) + 1 (1..6; the zero vector falls in sector 1 by convention); ' +
      '(2) modulation index m = √3·|V| / Vdc with |V| = hypot(valpha, vbeta); ' +
      '(3) in-sector angle φ = θ - (sector-1)·60°, normalized dwell times (carrier period = 1): t1 = m·sin(60° - φ), t2 = m·sin(φ). ' +
      'In the linear region (m ≤ 1) t1 + t2 ≤ 1; the zero-vector time t0 = 1 - t1 - t2 is not returned.',
  ),
  starter: `// TODO: 返回 [sector, t1, t2]（载波周期归一化为 1）
// 提示：m = Math.sqrt(3) * Math.hypot(valpha, vbeta) / vdc
function svpwmCore(valpha, vbeta, vdc) {
  const sector = 1;
  const t1 = 0;
  const t2 = 0;
  return [sector, t1, t2];
}
return svpwmCore;`,
  starterEn: `// TODO: return [sector, t1, t2] (carrier period normalized to 1)
// Hint: m = Math.sqrt(3) * Math.hypot(valpha, vbeta) / vdc
function svpwmCore(valpha, vbeta, vdc) {
  const sector = 1;
  const t1 = 0;
  const t2 = 0;
  return [sector, t1, t2];
}
return svpwmCore;`,
  cases: [
    { label: 'Vα=0, Vβ=0, Vdc=100（零矢量→扇区 1）', args: [0, 0, 100], expected: [1, 0, 0] },
    { label: 'Vα=50, Vβ=10（扇区 1 典型）', args: [50, 10, 100], expected: [1, 0.6633974596, 0.1732050808] },
    { label: 'Vα=20, Vβ=40（扇区 2）', args: [20, 40, 100], expected: [2, 0.6464101615, 0.0464101615] },
    { label: 'Vα=-25, Vβ=-15（扇区 4）', args: [-25, -15, 100], expected: [4, 0.2450961894, 0.2598076211] },
    { label: 'Vα=15, Vβ=-40（扇区 5）', args: [15, -40, 100], expected: [5, 0.1214101615, 0.5714101615] },
    { label: 'Vα=50, Vβ=28.8675137（线性区边界 m=1）', args: [50, 28.8675137, 100], expected: [1, 0.4999999969, 0.5000000031] },
  ],
  hints: [
    e('扇区判定不需要查表：θ = atan2(vbeta, valpha) 加 2π 归一到 [0, 2π)，除以 60°（π/3）向下取整再加一。', 'Sector detection needs no table: wrap θ = atan2(vbeta, valpha) into [0, 2π), divide by 60° (π/3), floor, then add one.'),
    e('t1 走扇区的起始边：φ → 0 时 t2 → 0、t1 → m·sin(60°)；扇区中心（φ = 30°）处必有 t1 = t2，用它自检。', 't1 belongs to the sector entry edge: as φ → 0, t2 → 0 and t1 → m·sin(60°); at the sector center (φ = 30°) t1 must equal t2 — use that as a self-check.'),
    e('生产代码常免 atan2：比较 vbeta 与 ±√3·valpha/2 的符号得 3 位 N 信号查表定扇区，√3 用 Q15 常数 56756 做乘法。', 'Production code often skips atan2: compare the signs of vbeta against ±√3·valpha/2 to build a 3-bit N signal and look the sector up; use the Q15 constant 56756 for √3 multiplies.'),
  ],
  cReference: `/* STM32 C 参考：扇区判定 + 基本矢量作用时间（ts 归一化为 1） */
#define SQRT3_Q15  56756           /* sqrt(3) 的 Q15 表示，乘法替代运行时除法 */
#define PI3        1.0471975512f   /* pi/3 rad = 60° */
#define TWO_PI     6.2831853072f

static const uint8_t sector_lut[6] = { 1, 2, 3, 4, 5, 6 };  /* θ/60° 直查 */

static void svpwm_core(float valpha, float vbeta, float vdc,
                       uint8_t *sector, float *t1, float *t2)
{
    float theta = atan2f(vbeta, valpha);
    if (theta < 0.0f) theta += TWO_PI;             /* 归一到 [0, 2π) */
    uint8_t idx = (uint8_t)(theta / PI3);          /* 0..5，wrap 保证不越界 */
    float phi = theta - idx * PI3;                 /* 扇区内角 */
    float m = ((float)SQRT3_Q15 / 32768.0f)        /* √3 以 Q15 常数进乘法 */
            * hypotf(valpha, vbeta) / vdc;
    *sector = sector_lut[idx];
    *t1 = m * sinf(PI3 - phi);                     /* 靠近扇区下边界时 t2→0 */
    *t2 = m * sinf(phi);
}`,
};

export const svpwmDutySolution: string = `function svpwmCore(valpha, vbeta, vdc) {
  const PI3 = Math.PI / 3;
  let angle = Math.atan2(vbeta, valpha);
  if (angle < 0) angle += 2 * Math.PI;
  const sector = Math.floor(angle / PI3) + 1;
  const m = Math.sqrt(3) * Math.hypot(valpha, vbeta) / vdc;
  const phi = angle - (sector - 1) * PI3;
  const t1 = m * Math.sin(PI3 - phi);
  const t2 = m * Math.sin(phi);
  return [sector, t1, t2];
}
return svpwmCore;`;
