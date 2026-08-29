import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab #00：机械角→电角度换算（01 号模块 motor-basics）。
 *
 * 公式与 src/simulation/math/transforms.ts 的 electricalAngle 一致：
 *   θe = mod(p·θm, 2π) —— mod 用减 floor 实现（解释器无 % 语义时的标准写法）：
 *   mod(x, 2π) = x − floor(x/2π)·2π，结果天然落在 [0, 2π)。
 * 期望值由该公式冻结生成（10 位小数）。
 */
export const elecAngleChallenge: CodeChallenge = {
  id: 'elec-angle',
  moduleId: 'motor-basics',
  functionName: 'elecAngle',
  difficulty: 1,
  title: e('编程挑战：机械角换算电角度', 'Code Lab: mechanical to electrical angle'),
  statement: e(
    '转子上转一圈，定子绕组看到的磁场已经转了 p 圈（p = 极对数）。' +
      '实现 elecAngle(mechRad, polePairs)，把机械角 θm（rad）换算成电角度 θe 并折到 [0, 2π)，返回 [elecRad]。' +
      '公式：θe = mod(p·θm, 2π)。取模用减 floor 实现：elec = raw − Math.floor(raw / (2·Math.PI))·2π——' +
      '这样负角、多圈角都落在 [0, 2π) 内。驱动 FOC 的 Park 变换用的是 θe，不是 θm。',
    'One mechanical revolution spins the stator field p times over (p = pole pairs). ' +
      'Implement elecAngle(mechRad, polePairs) to convert the mechanical angle θm (rad) into the electrical angle θe wrapped into [0, 2π), returning [elecRad]. ' +
      'Formula: θe = mod(p·θm, 2π). Build the modulo with a subtraction and floor: elec = raw − Math.floor(raw / (2·Math.PI))·2π — ' +
      'that maps negative and multi-turn angles into [0, 2π). The Park transform in FOC consumes θe, never θm.',
  ),
  starter: `// TODO: 返回 [elecRad]（电角度，已折到 [0, 2π)）
// 提示：raw = polePairs * mechRad；elec = raw - Math.floor(raw / (2 * Math.PI)) * (2 * Math.PI)
function elecAngle(mechRad, polePairs) {
  const elecRad = 0;
  return [elecRad];
}
return elecAngle;`,
  starterEn: `// TODO: return [elecRad] (electrical angle, wrapped into [0, 2*pi))
// Hint: raw = polePairs * mechRad; elec = raw - Math.floor(raw / (2 * Math.PI)) * (2 * Math.PI)
function elecAngle(mechRad, polePairs) {
  const elecRad = 0;
  return [elecRad];
}
return elecAngle;`,
  cases: [
    { label: 'θm=0, p=4（零机械角）', args: [0, 4], expected: [0] },
    { label: 'θm=π/2, p=1（单对极：电角=机械角）', args: [1.5707963267948966, 1], expected: [1.5707963268] },
    { label: 'θm=π/2, p=4（90°×4=整圈电角度→0）', args: [1.5707963267948966, 4], expected: [0] },
    { label: 'θm=1, p=3（p·θm=3 rad < 2π，不折）', args: [1, 3], expected: [3] },
    { label: 'θm=2.5, p=4（10 rad 折去一圈）', args: [2.5, 4], expected: [3.7168146928] },
    { label: 'θm=7, p=1（机械角自身超一圈）', args: [7, 1], expected: [0.7168146928] },
  ],
  hints: [
    e('先算 raw = polePairs * mechRad——别在取模里重复乘，先存下来再折。', 'Compute raw = polePairs * mechRad first — store it once, then wrap; do not multiply twice.'),
    e('没有 mod 运算符也能取模：elec = raw − Math.floor(raw / (2·Math.PI))·2π。floor 对正数就是"数圈数"，减掉整数圈剩下的就是圈内的电角度。', 'No modulo operator needed: elec = raw − Math.floor(raw / (2·Math.PI))·2π. For positive inputs floor counts whole turns; subtracting them leaves the in-turn electrical angle.'),
    e('STM32 上 16 位编码器计数 0..65535 天然对应 0..2π：电角度 = (uint16_t)(mech_cnt × p) 就自动回卷取模，一次乘法零除法。', 'On STM32 a 16-bit encoder count 0..65535 maps directly to 0..2π: the electrical angle = (uint16_t)(mech_cnt × p) wraps for free — one multiply, zero divides.'),
  ],
  cReference: `/* STM32 C 参考：机械角→电角度（q15 乘法 + 归一化，编码器 0..65535 ↔ 0..2π） */
#define ENC_FULL  65536u        /* 编码器一圈计数 = 电角度整圈 */

static inline uint16_t elec_angle_q15(uint16_t mech_cnt, uint32_t pole_pairs)
{
    /* p·θm：极对数为整数，直接整数乘；uint16 回卷天然完成 mod 2π 归一化 */
    uint32_t prod = (uint32_t)mech_cnt * pole_pairs;
    return (uint16_t)(prod % ENC_FULL);
}

/* 归一化到 Q15 per-unit（0..32767 ↔ 0..π，供 sin/cos 查表直接取下标） */
static inline int16_t elec_angle_norm(uint16_t elec_cnt)
{
    return (int16_t)(elec_cnt >> 1);          /* 右移一位即 ÷2 */
}

/* 浮点版（角度以弧度在控制环内流转时）：
   raw = p * theta_m; theta_e = raw - floorf(raw / TWO_PI) * TWO_PI; */`,
};

/** 官方答案（朴素风格，注册进 solutions.ts）。 */
export const elecAngleSolution: string = `function elecAngle(mechRad, polePairs) {
  const twoPi = 2 * Math.PI;
  const raw = polePairs * mechRad;
  const elecRad = raw - Math.floor(raw / twoPi) * twoPi;
  return [elecRad];
}
return elecAngle;`;
