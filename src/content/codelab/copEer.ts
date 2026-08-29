import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：制冷性能系数 COP 与 EER（16 号模块 · 制冷试验台）。
 *
 * 题面公式：
 *   cop = pCoolingKw / pElecKw（无量纲，W/W）；
 *   eerBtu = cop × 3.412（W/W → Btu/h·Btu^-1，即美制 EER 数值）；
 *   pElec = 0（停机/计量失效）时返回 [0, 0]，防除零。
 * 测试向量按上式冻结生成（10 位小数，运行期零依赖）。
 */
export const copEerChallenge: CodeChallenge = {
  id: 'cop-eer',
  moduleId: 'refrigeration-bench',
  functionName: 'copEer',
  difficulty: 1,
  title: e('编程挑战：计算 COP 与 EER', 'Code Lab: compute COP and EER'),
  statement: e(
    '制冷试验台的两个能效指标其实是一回事的两种写法：COP = 制冷量 / 电功率（W/W，无量纲）；' +
      '美制 EER 把单位换成 Btu/h 每 W，数值上恰为 COP × 3.412。' +
      '实现 copEer(pCoolingKw, pElecKw) 返回 [cop, eerBtu]：cop = pCoolingKw / pElecKw，eerBtu = cop × 3.412。' +
      '若 pElecKw = 0（停机或计量失效），分母失去意义，直接返回 [0, 0]（防除零，题面规定）。',
    'The two efficiency figures on a refrigeration bench are the same thing written two ways: COP = cooling power / electric power (W/W, dimensionless); the US EER switches to Btu/h per W, which numerically is just COP × 3.412. ' +
      'Implement copEer(pCoolingKw, pElecKw) returning [cop, eerBtu]: cop = pCoolingKw / pElecKw and eerBtu = cop × 3.412. ' +
      'If pElecKw = 0 (unit off or metering failure) the denominator is meaningless: return [0, 0] in that case (divide-by-zero guard, as specified).',
  ),
  starter: `// TODO: 返回 [cop, eerBtu]
// 提示：cop = pCoolingKw / pElecKw；eerBtu = cop * 3.412；pElecKw = 0 时返回 [0, 0]
function copEer(pCoolingKw, pElecKw) {
  const cop = 0;
  const eerBtu = 0;
  return [cop, eerBtu];
}
return copEer;`,
  cases: [
    { label: '制冷 3.5kW / 电 1.0kW（典型空调，COP=3.5）', args: [3.5, 1.0], expected: [3.5000000000, 11.9420000000] },
    { label: '电功率 0（停机/计量失效，防除零）', args: [3.5, 0], expected: [0, 0] },
    { label: '制冷 10kW / 电 2.5kW（高工况）', args: [10, 2.5], expected: [4.0000000000, 13.6480000000] },
    { label: '制冷 0.8kW / 电 0.5kW（低负载）', args: [0.8, 0.5], expected: [1.6000000000, 5.4592000000] },
    { label: '制冷 2.6kW / 电 0.8kW（1 匹机标称附近）', args: [2.6, 0.8], expected: [3.2500000000, 11.0890000000] },
    { label: '制冷 7.1kW / 电 2.2kW（3 匹机满载）', args: [7.1, 2.2], expected: [3.2272727273, 11.0114545455] },
  ],
  hints: [
    e(
      '一次除法、一次乘法就够了：先算 cop，再 eerBtu = cop * 3.412。别把 3.412 又乘回除法里，容易弄丢精度。',
      'One divide, one multiply: compute cop first, then eerBtu = cop * 3.412. Folding 3.412 back into the division loses accuracy for no gain.',
    ),
    e(
      '先判 pElecKw === 0 并 return [0, 0]——除以 0 会得 Infinity，判题判 nonfinite。',
      'Check pElecKw === 0 and return [0, 0] first — dividing by zero yields Infinity and the judge flags nonfinite.',
    ),
    e(
      '换算来源：1 W/W = 3.412 Btu·h⁻¹·W⁻¹（1 Btu = 1055.06 J，1 h = 3600 s，3600/1055.06 ≈ 3.412）。能效标识上中国标 COP（W/W）、美版标 EER，数值就差这一倍率。',
      'Where 3.412 comes from: 1 W/W = 3.412 Btu·h⁻¹·W⁻¹ (1 Btu = 1055.06 J, 1 h = 3600 s, 3600/1055.06 ≈ 3.412). Chinese energy labels quote COP (W/W) while US ones quote EER — the figures differ by exactly this factor.',
    ),
  ],
  cReference: `/* STM32 C 参考：计量芯片寄存器换算出 COP/EER（HLW8032/ATT7053 类） */
typedef struct { uint32_t p_cool_raw; uint32_t p_elec_raw; } meter_regs_t;
#define METER_LSB_W     0.001f      /* 寄存器 1 LSB = 1 mW，标定后 */
#define W_PER_W_BTU     3.412f      /* 1 W/W = 3.412 Btu/h/W */

static inline float cop_from_regs(const meter_regs_t *r)
{
    float p_elec = (float)r->p_elec_raw * METER_LSB_W / 1000.0f;  /* → kW */
    if (p_elec <= 0.0f) {
        return 0.0f;                /* 停机/计量失效：报 0 而非除零 */
    }
    float p_cool = (float)r->p_cool_raw * METER_LSB_W / 1000.0f;  /* → kW */
    return p_cool / p_elec;
}

static inline float eer_from_cop(float cop)
{
    return cop * W_PER_W_BTU;       /* 显示层再乘 3.412 得美制 EER */
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与题面公式一致）。 */
export const copEerSolution: string = `function copEer(pCoolingKw, pElecKw) {
  if (pElecKw === 0) return [0, 0];
  const cop = pCoolingKw / pElecKw;
  const eerBtu = cop * 3.412;
  return [cop, eerBtu];
}
return copEer;`;
