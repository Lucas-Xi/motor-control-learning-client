import type { ModuleId } from '../simulation/engine/types';

export interface GuidedStep {
  id: string;
  title: string;
  action: string;
  observe: string;
  expected: string;
  presetId?: string;
}

export interface GuidedExperiment {
  moduleId: ModuleId;
  title: string;
  focus: string;
  steps: GuidedStep[];
}

const sharedFallbackSteps: GuidedStep[] = [
  {
    id: 'baseline',
    title: '建立基线',
    action: '先使用默认参数运行 3 秒，观察波形和矢量是否稳定。',
    observe: '看关键变量是否处于绿色/蓝色安全区。',
    expected: '得到一个可对比的正常工作状态。',
  },
  {
    id: 'stress',
    title: '施加扰动',
    action: '逐步增大右侧一个关键参数，不要一次拖到极限。',
    observe: '观察图表、3D 方向和现象提示是否同步变化。',
    expected: '理解该参数对控制链路的主导影响。',
  },
  {
    id: 'recover',
    title: '恢复与总结',
    action: '点击重置或加载正常预设，对比恢复前后的差异。',
    observe: '记录哪个信号先异常，哪个信号后异常。',
    expected: '建立真实调试中的排查顺序。',
  },
];

export const guidedExperiments: GuidedExperiment[] = [
  {
    moduleId: 'three-phase',
    title: '旋转磁场三步观察',
    focus: '幅值决定磁场半径，频率决定旋转速度，不平衡/谐波会让轨迹变脏。',
    steps: [
      {
        id: 'three-phase-clean',
        title: '纯净三相',
        action: '加载 6A / 50Hz / 平衡三相，先观察圆形旋转磁场。',
        observe: '看 3D 定子磁场、αβ 矢量和三相波形是否同步转动。',
        expected: '合成磁场幅值稳定，Ia+Ib+Ic 接近 0。',
        presetId: 'rotating-field',
      },
      {
        id: 'three-phase-speed',
        title: '提升频率',
        action: '把频率提高到 120Hz，同时保持幅值不变。',
        observe: '矢量角速度加快，但幅值半径基本不变。',
        expected: '频率影响磁场转速，不直接改变磁场强度。',
        presetId: 'three-phase-fast',
      },
      {
        id: 'three-phase-distort',
        title: '注入畸变',
        action: '加入三相不平衡、5 次谐波和采样噪声。',
        observe: '波形出现毛刺，αβ 轨迹从圆变成椭圆/抖动。',
        expected: '真实采样偏置、相阻不一致和谐波会直接污染 FOC 输入。',
        presetId: 'three-phase-distort',
      },
    ],
  },
  {
    moduleId: 'clarke-transform',
    title: 'abc 投影到 αβ',
    focus: 'Clarke 的价值不是“公式变换”，而是把三相电流压缩成可控的二维矢量。',
    steps: [
      {
        id: 'clarke-balanced',
        title: '平衡输入',
        action: '使用平衡三相电流，观察零序分量 I0。',
        observe: 'I0 应接近 0，αβ 矢量长度稳定。',
        expected: '平衡三相只需要两个自由度表示。',
        presetId: 'clarke-balanced',
      },
      {
        id: 'clarke-manual',
        title: '手动破坏平衡',
        action: '切换到手动 Ia/Ib/Ic，并让三相和不为 0。',
        observe: 'I0 变大，提示采样偏置或缺相风险。',
        expected: '零序分量是判断三相异常的重要线索。',
        presetId: 'clarke-manual',
      },
      {
        id: 'clarke-rotate',
        title: '改变相位',
        action: '回到平衡三相并改变相位。',
        observe: 'αβ 矢量在平面内旋转。',
        expected: 'abc 正弦交流量被转换成静止平面中的旋转矢量。',
        presetId: 'clarke-phase',
      },
    ],
  },
  {
    moduleId: 'park-transform',
    title: '交流量变直流量',
    focus: 'Park 变换能否成功，关键在于电角度 θ 是否与转子磁链同步。',
    steps: [
      {
        id: 'park-align',
        title: '对准磁链',
        action: '设置中等转速和合理 θ，让 dq 轴跟随转子。',
        observe: 'Id/Iq 投影稳定，q 轴代表转矩方向。',
        expected: '同步旋转坐标中，控制器看到的是近似直流量。',
        presetId: 'park-align',
      },
      {
        id: 'park-angle-error',
        title: '制造角度误差',
        action: '改变 θ，让 dq 轴偏离真实电流矢量。',
        observe: 'Id/Iq 互相串扰，Id 不再接近目标。',
        expected: '角度错误会让磁链电流和转矩电流互相污染。',
        presetId: 'park-angle-error',
      },
      {
        id: 'park-torque',
        title: '提高 Iq',
        action: '提高 Iq 参考，保持 Id 接近 0。',
        observe: '转矩方向矢量变强，磁链方向保持稳定。',
        expected: 'PMSM 常规 FOC 中 Id 管磁链、Iq 管转矩。',
        presetId: 'park-torque',
      },
    ],
  },
  {
    moduleId: 'pid-control',
    title: 'PID 调参手感训练',
    focus: '先调 P 得响应，再加 I 消误差，最后只在必要时加 D 抑制趋势。',
    steps: [
      {
        id: 'pid-slow-guide',
        title: '慢响应',
        action: '加载低 Kp / Ki，观察阶跃响应。',
        observe: '上升时间长，稳态误差消除慢。',
        expected: '参数过小不会炸机，但动态跟随能力差。',
        presetId: 'pi-slow',
      },
      {
        id: 'pid-osc-guide',
        title: '过高增益',
        action: '加载高 Kp / Ki，关闭或降低抗积分饱和效果。',
        observe: '超调和振荡明显，输出更容易撞限幅。',
        expected: '采样延迟和执行器限幅会把高增益变成振荡源。',
        presetId: 'pi-oscillate',
      },
      {
        id: 'pid-balanced-guide',
        title: '折中整定',
        action: '启用抗积分饱和，回到中等 Kp/Ki。',
        observe: '上升速度、超调和稳态误差达到折中。',
        expected: '工程调参通常追求稳定裕量，不追求最快单次响应。',
        presetId: 'pi-balanced',
      },
    ],
  },
  {
    moduleId: 'svpwm',
    title: '扇区与占空比联动',
    focus: 'SVPWM 的交互重点是：矢量角度决定扇区，幅值/母线决定是否饱和。',
    steps: [
      {
        id: 'svpwm-sector-guide',
        title: '扇区切换',
        action: '旋转电角度，让电压矢量穿过 60° 边界。',
        observe: '高亮扇区、T1/T2 分配和三相 duty 同步跳变。',
        expected: '扇区判断是 SVPWM 时序排列的入口。',
        presetId: 'svpwm-sector',
      },
      {
        id: 'svpwm-high-mod',
        title: '接近线性边界',
        action: '提高调制比到 0.95 附近。',
        observe: 'T0 缩短，母线利用率接近极限。',
        expected: '线性区末端可用电压更高，但控制裕量变小。',
        presetId: 'svpwm-high-mod',
      },
      {
        id: 'svpwm-saturation',
        title: '进入过调制',
        action: '降低 Udc 或提高调制比到 1 以上。',
        observe: '现象提示显示饱和，duty 更贴近 0/1 边界。',
        expected: '电压饱和会让电流环输出“给不出来”。',
        presetId: 'svpwm-saturation',
      },
    ],
  },
  {
    moduleId: 'sensorless-foc',
    title: '无感 PLL 锁相观察',
    focus: '无感不是没有反馈，而是把电压/电流里的反电动势当作角度反馈。',
    steps: [
      {
        id: 'sensorless-lock',
        title: '中速锁相',
        action: '设置 900rpm 左右，噪声较低。',
        observe: '真实角度、估算角度逐步贴合，误差减小。',
        expected: '反电动势足够大时 PLL 可以稳定锁相。',
        presetId: 'sensorless-lock',
      },
      {
        id: 'sensorless-low-speed',
        title: '低速失败',
        action: '降到 80rpm，并加入噪声。',
        observe: '角度误差放大，估算角度抖动。',
        expected: '低速反电势太小，是无感启动困难的根因。',
        presetId: 'sensorless-low-speed',
      },
      {
        id: 'sensorless-gain',
        title: '调整 PLL 增益',
        action: '提高 PLL Kp/Ki 后观察跟踪速度和噪声放大。',
        observe: '锁相变快，但估算角更容易抖。',
        expected: '观测器调参本质是带宽和抗噪的折中。',
        presetId: 'sensorless-gain',
      },
    ],
  },
  {
    moduleId: 'field-weakening',
    title: '弱磁极限圆实验',
    focus: '弱磁不是单纯追高速，而是在电流圆和电压圆交集里找还能工作的点。',
    steps: [
      {
        id: 'weak-normal',
        title: '恒转矩区',
        action: '中等转速下保持 Id 接近 0。',
        observe: '工作点在电流圆内，电压仍有余量。',
        expected: '低中速通常不需要负 Id。',
        presetId: 'weak-normal',
      },
      {
        id: 'weak-saturation',
        title: '制造电压饱和',
        action: '提高转速或降低母线电压。',
        observe: '电压极限提示变红，工作点被电压圆挤压。',
        expected: '高速反电动势吃掉母线电压，电流环失去余量。',
        presetId: 'weak-saturation',
      },
      {
        id: 'weak-negative-id',
        title: '注入负 Id',
        action: '给定负 Id，同时保留一定 Iq。',
        observe: '工作点向负 d 轴移动，电压余量恢复但转矩下降。',
        expected: '弱磁用转矩换高速，适合压缩机等高速场景。',
        presetId: 'weak-negative-id',
      },
    ],
  },
  {
    moduleId: 'motor-basics',
    title: '电角度与机械角实验',
    focus: '极对数越多，同样一圈机械旋转对应的电角度循环次数越多。',
    steps: [
      {
        id: 'motor-angle',
        title: '角度映射',
        action: '设定 4 极对，把机械角从 0° 拖到 360°。',
        observe: '电角度会循环 4 圈，而机械角只走 1 圈。',
        expected: 'FOC 使用电角度，不是机械角度。',
        presetId: 'motor-angle',
      },
      {
        id: 'motor-pole-pairs',
        title: '改变极对数',
        action: '把极对数提高到 6 或 8。',
        observe: '同样机械角下，电角度变化更快。',
        expected: '极对数错误会直接导致 dq 轴不同步。',
        presetId: 'motor-poles',
      },
      {
        id: 'motor-rated',
        title: '额定边界',
        action: '提高转速和额定电流，观察机械/电气指标。',
        observe: '参数卡片会显示更高的运行区间。',
        expected: '额定值决定调试安全边界。',
        presetId: 'motor-rated',
      },
    ],
  },
  {
    moduleId: 'foc-flow',
    title: 'FOC 中断流水线单步',
    focus: 'FOC 的每个 PWM 周期都是采样、变换、PI、电压合成、逆变器输出的闭环流水线。',
    steps: [
      {
        id: 'foc-sample',
        title: '采样入口',
        action: '暂停运行后单步执行，先看三相电流输入。',
        observe: '参数探针从采样端开始变化。',
        expected: '采样偏置会污染后面所有变换。',
        presetId: 'foc-sample',
      },
      {
        id: 'foc-current-loop',
        title: '电流 PI',
        action: '观察 Id/Iq 误差进入两个 PI 控制器。',
        observe: 'PI 输出变成 Vd/Vq，再经过反 Park。',
        expected: 'FOC 本质上是把交流电流变成直流电流来控。',
        presetId: 'foc-current-loop',
      },
      {
        id: 'foc-output',
        title: 'PWM 输出',
        action: '连续运行，观察数据流走到 SVPWM 与逆变器。',
        observe: '流程轨道高亮从左到右循环。',
        expected: '角度反馈会在下一个周期重新进入 Park。',
        presetId: 'foc-output',
      },
    ],
  },
  {
    moduleId: 'inverter',
    title: '逆变器死区与占空比',
    focus: '逆变器交互要看桥臂状态、占空比和死区畸变三者是否同步。',
    steps: [
      {
        id: 'inverter-clean',
        title: '正常 PWM',
        action: '使用 48V 母线和中等占空比。',
        observe: '三相相电压/线电压保持对称。',
        expected: '互补导通是三相桥的基本安全规则。',
        presetId: 'inverter-clean',
      },
      {
        id: 'inverter-deadtime',
        title: '增大死区',
        action: '把死区提高到 3us 以上。',
        observe: '死区畸变提示增强，低速电流更容易变形。',
        expected: '死区保护开关管，但会带来电压误差。',
        presetId: 'inverter-deadtime',
      },
      {
        id: 'inverter-overmod',
        title: '极限占空比',
        action: '把 A/B/C 占空比拉到接近边界。',
        observe: '桥臂开关时间变窄，波形更容易削顶。',
        expected: '过调制和采样窗口不足都可能带来异常。',
        presetId: 'inverter-overmod',
      },
    ],
  },
  {
    moduleId: 'control-loops',
    title: '三闭环带宽层级',
    focus: '内环必须快，外环必须慢；速度环追着电流环跑就会振。',
    steps: [
      {
        id: 'loops-stable',
        title: '稳定层级',
        action: '加载温和的电流环、速度环、位置环参数。',
        observe: '电流先收敛，转速随后收敛，位置最后收敛。',
        expected: '三环带宽应该由内到外逐级降低。',
        presetId: 'loops-stable',
      },
      {
        id: 'loops-slow',
        title: '响应过慢',
        action: '降低速度环 PI。',
        observe: '转速跟踪慢但通常不振荡。',
        expected: '慢不是最优，但比失稳安全。',
        presetId: 'loops-slow',
      },
      {
        id: 'loops-osc',
        title: '速度振荡',
        action: '加载过高速度环增益。',
        observe: '速度曲线来回摆动，转矩响应被放大。',
        expected: '外环过快会把内环当作理想执行器，最终失稳。',
        presetId: 'speed-loop-osc',
      },
    ],
  },
  {
    moduleId: 'faults-debugging',
    title: '故障现象到根因定位',
    focus: '调试不要先猜参数，先看波形现象，再按相序、采样、母线、电流环逐项排除。',
    steps: [
      {
        id: 'fault-current',
        title: '过流尖峰',
        action: '加载过流故障，观察电流尖峰和保护触发。',
        observe: '波形会出现突变，现象卡片给出排查路径。',
        expected: '先确认采样、死区、限流和负载冲击。',
        presetId: 'fault-over-current',
      },
      {
        id: 'fault-phase',
        title: '缺相/相序',
        action: '切换缺相或相序错误。',
        observe: '三相波形不再对称，旋转方向或幅值异常。',
        expected: '相序错误会导致反转，缺相会导致转矩脉动。',
        presetId: 'phase-order-error',
      },
      {
        id: 'fault-offset',
        title: '采样偏置',
        action: '加载电流采样偏置。',
        observe: 'Id/Iq 出现固定偏差，零序分量异常。',
        expected: '上电零点校准和 ADC 偏置补偿是必查项。',
        presetId: 'current-offset',
      },
    ],
  },
  {
    moduleId: 'hfi-sensorless',
    title: 'HFI 低速无感三步',
    focus: 'IPM 凸极注入 → 解调 → PLL，全过程低速 / 零速可用。',
    steps: [
      { id: 'hfi-default', title: 'IPM 凸极典型', action: '默认参数：凸极比 2.18，转速 50 rpm。', observe: '估算角度快速锁相到真实角。', expected: '压缩机零启动可行。' },
      { id: 'hfi-flat-rotor', title: '表贴式失效', action: '把凸极比拖到 1.05。', observe: '估算角度噪声放大、无法锁相。', expected: 'HFI 只对 IPM 有效。' },
      { id: 'hfi-low-freq', title: '注入频率太低', action: '把注入频率降到 200Hz。', observe: '解调输出被低频噪声污染。', expected: '注入频率必须远高于电机基频。' },
    ],
  },
  {
    moduleId: 'startup-statemachine',
    title: '压缩机启动状态机三步',
    focus: 'idle → precharge → align → V/f → HFI → BEMF → 弱磁，每段都有进入/退出条件。',
    steps: [
      { id: 'startup-default', title: '正常启动序列', action: '默认 3000 rpm 目标，斜坡 600 rpm/s。', observe: '7 个状态依次激活，转速平滑爬升。', expected: '总耗时约 6 秒。' },
      { id: 'startup-aggressive', title: '过激斜坡', action: '把斜坡拉到 2500 rpm/s。', observe: 'Iq 电流瞬间突变，启动应力大。', expected: '反液击是压缩机启动的硬约束。' },
      { id: 'startup-fieldweak', title: '高速进入弱磁', action: '把目标转速拉到 8000 rpm。', observe: '状态机最后切到弱磁状态。', expected: '弱磁是 BEMF 状态的高速延伸。' },
    ],
  },
  {
    moduleId: 'apf-frontend',
    title: 'PFC 前级三步观察',
    focus: '电网电压 + 电感电流跟踪 + 母线稳定 — 高 PF 低 THD 的工作机制。',
    steps: [
      { id: 'apf-default', title: '正常工作点', action: '默认 220V/380V/4A 负载。', observe: '输入电流和电压几乎同相同形，PF > 0.99。', expected: 'Boost PFC 标准工作状态。' },
      { id: 'apf-low-bus', title: '降低母线目标', action: '把 Udc 目标从 380 拉到 250V。', observe: 'PF 下降、THD 上升。', expected: '不升压时电流跟踪能力差，谐波恶化。' },
      { id: 'apf-heavy-load', title: '负载突增', action: '负载电流从 4A 拉到 12A。', observe: '母线短时下沉、电流参考幅值上调。', expected: '电压环负反馈过程。' },
    ],
  },
];

export function getGuidedExperiment(moduleId: ModuleId): GuidedExperiment {
  return guidedExperiments.find((item) => item.moduleId === moduleId) ?? {
    moduleId,
    title: '通用实验路径',
    focus: '先建立正常波形，再施加单一变量扰动，最后恢复并总结。',
    steps: sharedFallbackSteps,
  };
}

export function getFlowSteps(moduleId: ModuleId): string[] {
  const flows: Partial<Record<ModuleId, string[]>> = {
    'three-phase': ['Ia/Ib/Ic', 'Clarke 投影', '磁场合成', '3D 旋转'],
    'clarke-transform': ['abc 采样', '零序检查', 'αβ 投影', '矢量验证'],
    'park-transform': ['αβ 输入', 'θ 同步', 'dq 投影', 'Id/Iq 解耦'],
    'pid-control': ['目标值', '误差', 'PID 输出', '对象响应'],
    'foc-flow': ['采样', 'Clarke', 'Park', 'PI', 'SVPWM', '逆变器', '电机'],
    svpwm: ['Uαβ', '扇区', 'T1/T2/T0', 'Duty', 'PWM'],
    inverter: ['Udc', '桥臂', '死区', '相电压', '线电压'],
    'control-loops': ['位置环', '速度环', '电流环', '转矩', '机械响应'],
    'sensorless-foc': ['V/I', '反电势', '观测器', 'PLL', '估算角'],
    'field-weakening': ['转速', '电压圆', '电流圆', '负 Id', '恒功率'],
    'faults-debugging': ['故障注入', '波形现象', '原因定位', '排查步骤', '修复建议'],
    'motor-basics': ['机械角', '极对数', '电角度', '磁链', '转矩'],
  };
  return flows[moduleId] ?? ['输入', '算法', '现象', '结论'];
}
