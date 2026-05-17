import type { ModuleWalkthrough } from './types';

/**
 * 04 Park 变换 —— 让"αβ 交流量在 dq 上变直流量"这件事真正可见。
 *
 * 教学路径：先建立旋转坐标几何直觉 → 在 θ=0 / θ=90° 两个静态截面验证矩阵 →
 * 让 θ 跟住转子看直流量浮现 → 体感 Δθ 串扰 → 走通 STM32 上的 sin/cos 查表 +
 * 定点实现 + 编码器 Z 信号对齐 + 高速 dq 交叉解耦五个工业落地坑。
 *
 * 工业绑定：空调/冰箱 PMSM 压缩机，5-8 极对、24-310 V 母线、PWM 8-16 kHz、
 * 用 Cortex-M3 Q15 实现 ISR 内 Park 是国内主流方案；M4F/FPU 才有奢侈用浮点。
 */
export const parkTransformWalkthrough: ModuleWalkthrough = {
  moduleId: 'park-transform',
  bigPicture: '跳到转子上看 αβ → AC 变 DC：给 PI 创造工作前提的旋转变换，所有 dq 串扰、过零抖、低分编码器异响都在这里发生。',
  successCriteria: [
    '能口算 Id = Iα·cosθ + Iβ·sinθ、Iq = −Iα·sinθ + Iβ·cosθ 两条公式，并说明矩阵对应"αβ 顺时针旋转 −θ"',
    '能解释 d 轴沿永磁体 N 极、q 轴领先 90°，为什么 Iq 才是"转矩电流"且 Id=0 时铜损最低',
    '理解 θ 必须是电角度且与转子磁链方向对齐，Δθ 错 15° 会让纯 Iq 命令漏 26% 到 Id',
    '能在 STM32 Q15 实现里避开 sin/cos 表插值、_smmla 累加、防溢出三个坑',
    '能说出为什么压缩机 6000 rpm+ 必须叠加 dq 交叉解耦前馈 (ω·Lq·iq、ω·Ld·id+ω·ψf)',
  ],
  steps: [
    {
      id: 'see-axes',
      title: '看坐标',
      goal: '建立"αβ 是焊死的地面、dq 是焊在转子上的旋转转盘"几何直觉',
      action: '观察主图：蓝色箭头 = αβ 电流矢量（默认 Iα=5、Iβ=0）；中间转子贴 N/S 永磁体；绿色 d 轴沿 N 极；红色 q 轴领先 d 轴 90°（电角度）。',
      observe: '右侧 VectorPlane 显示同一份数据另一种画法：αβ 网格不动，d/q 轴在网格上随 θ 旋转。',
      whyMatters: 'αβ = 焊在定子上的静止坐标，跟编码器、ADC、PWM 三相端子有固定几何对应。dq = 焊在转子上的旋转坐标，跟随转子永磁体走。FOC 所有 PI 工作发生在 dq 域。家用空调压缩机 6 极对，机械转 1000 rpm = 电角度 100 Hz；电流环 ISR 里 Park 每 50-100 μs 调一次，是 STM32 上调用频率最高的纯函数之一。',
    },
    {
      id: 'theta-zero',
      title: 'θ=0 投影',
      goal: '在 d 轴和 α 轴对齐时验证 Park 公式（单元测试零点）',
      action: '把"电角度 θ"滑块拖到 0°，保持 Iα=5、Iβ=0。',
      observe: '主图绿色 Id 线段 ≈ 5A，红色 Iq 线段 ≈ 0A；右下数值卡片 Id≈5、Iq≈0。',
      whyMatters: 'θ=0 时 cos=1、sin=0，Park 矩阵退化为单位阵，Id=Iα、Iq=Iβ。这是 STM32 上验证你的 sin/cos 写对没有的最简单零点检查——单元测试固化为 ASSERT_NEAR(park(5, 0, 0).id, 5, 1e-4)。生产工程里 sin/cos 通常不调 math.h（μs 级别太慢），而是 256/512/1024 点表查 + 线性插值；表生成时 θ=0 那一格直接写 (1, 0) 跳过插值，避免 0.999/0.001 这种典型查表精度问题。',
      presetId: 'park-dc',
      quiz: {
        q: 'θ=0、Iα=5、Iβ=0。按 Park 公式 Id = Iα·cosθ + Iβ·sinθ，Id 应等于？',
        options: ['0（θ 是 0 没有投影）', '5（cos(0)=1、sin(0)=0，Id=Iα）', '5·cos(45°) ≈ 3.5（45° 投影）', '需要先知道转速 ω'],
        correct: 1,
        hint: 'cos(0)=1、sin(0)=0，Id=5·1+0·0=5。Park 在 θ=0 时不做任何事。选项 A 把"投影 0°"误解成"投影量 0"；选项 C 误以为 sin/cos 在不同步时算同一角度；选项 D 把 Park（纯几何变换）与速度环混淆了——Park 不需要 ω，只需要 θ。',
      },
    },
    {
      id: 'theta-90',
      title: 'θ=90° 投影',
      goal: '看到"同一个 αβ 矢量、不同 θ 投出完全不同的 Id/Iq"',
      action: '保持 Iα=5、Iβ=0 不动，把 θ 从 0° 慢慢拖到 90°。',
      observe: 'Id 从 5A 一路掉到 0A；Iq 从 0A 一路涨到 −5A（θ=90° 时 −Iα·sin(90°)=−5）。√(Id²+Iq²) 始终 ≈ 5。',
      whyMatters: '"同一束 αβ 在不同 θ 下投影不同"——这是 FOC 必须实时拿到准确 θ 的几何根。Park 不改电流"大小"，只改"用哪两根轴表达"。STM32 实现里 θ 通常用 q31 表示一整圈（0~2³¹ = 0~2π），整数溢出 = 自动归一，省掉 fmodf。但要注意：q31 累加 ω·Ts 时一旦 ω 或 Ts 用错单位（如 mech vs elec、Hz vs rad/s），整圈周期就完全错——这种 bug 一上电不转或反转，逐级 printf 是查不到的，要用示波器看实际 θ 增长速率。',
    },
    {
      id: 'rotate-theta',
      title: 'θ 旋转一圈',
      goal: '看到旋转坐标下 αβ 的 AC 量变成 DC 量（动态版）',
      action: '维持 Iα=5、Iβ=0，把 θ 从 0° 缓慢扫到 360°，观察 Id/Iq 数字变化轨迹。',
      observe: 'Id 沿 +cos 曲线起伏：5 → 0 → −5 → 0 → 5；Iq 沿 −sin 曲线：0 → −5 → 0 → 5 → 0。',
      whyMatters: '反过来想：电机正在转，αβ 是旋转箭头，控制器算的 θ 让它"跟住转子"——那么 dq 坐标里看到的就是不动的两根棍子（DC 量）。PI 控直流，零稳态误差由此而来。这是 FOC 相比标量 V/f 控制带宽高一个数量级的根本原因。',
      quiz: {
        q: '电机恒电频率运行，αβ 是 50 Hz 旋转正弦量。若控制器的 θ 恰好跟转子电角度同步（θ_PLL = θ_real），Id/Iq 在示波器上的形状是？',
        options: [
          '50 Hz 正弦（θ 没消掉 AC）',
          '直流（同步旋转 = αβ 在 dq 视角里"不动"）',
          '100 Hz 正弦（θ 把基波倍频）',
          '直流叠加 100 Hz 纹波（θ 抖动残留）',
        ],
        correct: 1,
        hint: '同步旋转 = αβ 在 dq 视角里"不动了"。选项 D 是"θ 估算带噪声"的真实情况，但题目假设 θ_PLL 恰好同步；选项 C 是常见的过零谐波担忧但与 Park 几何无关。',
      },
    },
    {
      id: 'pure-iq-q15',
      title: '纯转矩 + Q15 实现',
      goal: '理解"为什么 FOC 默认 Id=0"，并体验 Cortex-M3 Q15 定点 Park 落地',
      action: '拖 Iα、Iβ 让 αβ 矢量与 q 轴对齐（θ=0 时 Iα=0、Iβ=5）。再阅读下方 STM32 代码片段。',
      observe: 'Id≈0、Iq≈5。Iq 一安每安换成转矩，Id 只产生铜损不产生转矩（表贴式 PMSM 场景）。',
      whyMatters: 'd 轴沿永磁体磁链方向，加 Id 只是给磁链"加塞"，对 SPM 不产生转矩还白白耗 I²Rs。Iq 与磁链正交，每安培都换成 Te=1.5·p·ψf·Iq。Cortex-M3 Q15 实现参考（电流单位为 q15，θ 用 0~32767 表示 0~2π，sin_tab 是 1024 点 q15 查表）：' +
        ' int16_t sin_q15 = sin_tab[theta_q15 >> 5];' +
        ' int16_t cos_q15 = sin_tab[((theta_q15 >> 5) + 256) & 0x3FF];' +
        ' /* id = (i_alpha*cos + i_beta*sin) >> 15 — 注意先 int32 中间值防溢出 */' +
        ' int32_t id32 = (int32_t)i_alpha*cos_q15 + (int32_t)i_beta*sin_q15;' +
        ' int32_t iq32 = (int32_t)-i_alpha*sin_q15 + (int32_t)i_beta*cos_q15;' +
        ' int16_t id_q15 = (int16_t)(id32 >> 15);' +
        ' int16_t iq_q15 = (int16_t)(iq32 >> 15); — 这就是国内中低端压缩机 MCU 的标准模板，10 个时钟周期完成一次 Park。',
    },
    {
      id: 'theta-error',
      title: 'Δθ 串扰',
      goal: '看到"角度误差 → dq 串扰"这条最常见的现场坑',
      action: '设 Iα=0、Iβ=5（理想纯 Iq）；把 θ 从 0° 拖到 15°。',
      observe: 'Id 不再是 0，浮起约 −5·sin(15°) ≈ −1.29A；Iq 缩到 5·cos(15°) ≈ 4.83A。',
      whyMatters: '编码器零位没对齐 / 无感观测器有偏差，θ 就有恒定误差 Δθ。Park 把"本该全是 Iq"按 sin(Δθ) 漏到 Id：1° 漏 1.7%，5° 漏 8.7%，15° 漏 26%——这是 STM32 联调中"电流大转矩小"的几何根。同时还有"Id 控不到 0"的次生现象：你给 Id*=0 但实测 Id≈−1.3A，电流环 PI 拼命输出负 Vd 抵消，结果 Vd/Vq 命令偏离最优点，效率掉 5-10%。生产排障口诀：iq*=正、id*=0、实测 id 非零 → 先查 Park 的 θ，不是 PI。',
      quiz: {
        q: '现场调试给 Iq*=5A、Id*=0，但 Iq 实测 4.85A、Id 实测 −1.3A。最优先该改什么？',
        options: [
          '加大电流采样滤波器抑制偏置',
          '减小电流环 Kp 让 Id 慢慢被压回 0',
          '重做编码器零位对齐：sin(Δθ) ≈ 1.3/5 = 0.26 → Δθ ≈ 15°',
          '增加母线电压让 PI 有更多余量',
        ],
        correct: 2,
        hint: 'sin(15°)·5 ≈ 1.29、cos(15°)·5 ≈ 4.83，几何上正好是 Park 角度误差。Park 是纯几何变换不带动态——选 A/B/D 都是把"几何错位"当成"动态问题"处置，越改越乱。修法：上电先做 d 轴对齐（Id 直流 + Iq=0 锁轴 → 把当前 encoder 计数当 θe=0）；或加增量编码器 Z 信号每圈校一次。',
      },
    },
    {
      id: 'encoder-z-sync',
      title: '编码器 Z 信号校准',
      goal: '掌握"每圈一次硬件 Z 信号"对 Park 角度长期稳定性的作用',
      action: '想象一台 2500 PPR 的增量编码器接到 STM32 TIM2 32 位计数器；A/B 正交 4 倍频后单圈 10000 计数。Z 信号每圈一次脉冲，接 TIM2_CH3 + 输入捕获中断。',
      observe: '理想情况下电机转 N 圈后计数器读数应为 N·10000；若中间漏了一次 A 边沿，每漏 1 个计数 θe 就永久偏 0.036°·polePairs。漏 4 个就累计 0.15°·polePairs，对 6 极对压缩机 = 0.9° 电角度漂移。',
      whyMatters: 'A/B 计数会因 EMI / 软件中断抢占 / 编码器线接触不良漏脉冲，长时间运行后 θm 漂移；θe = θm·polePairs 把漂移放大 polePairs 倍。Z 信号是硬件复位锚点：HAL_TIM_IC_CaptureCallback 里把 TIM2->CNT 直接写成"已知 Z 位置对应的计数值"（比如 0 或 5000），把累积漂移一次性清零。压缩机这种 24/7 运行场景，没有 Z 校准的 FOC 跑 8 小时后效率会肉眼可见下降 1-2%。无 Z 编码器（如磁编码器）必须配合 BEMF 观测器做长期校准。',
      quiz: {
        q: '2500 PPR 增量编码器 + 6 极对 PMSM，A/B 信号在 EMI 干扰下平均每分钟漏 10 个计数边沿。运行 1 小时后 θe 累积偏差大约？',
        options: [
          '0°（4 倍频后冗余可以容错）',
          '约 0.36°（仅机械角度漂）',
          '约 2.16°（机械漂 × 极对数）',
          '约 21.6°（计数器溢出）',
        ],
        correct: 2,
        hint: '60 分钟 × 10 = 600 个漏脉冲；每个对应 360°/10000 = 0.036° 机械；600·0.036° = 21.6° 机械；× 6 极对 = 129° 电角度——已经完全不能控了。但 Z 每圈复位一次只会累积"当圈内"的漏数，所以实际偏差 ≈ 10 漏/分 ÷ 转速 × 0.036° × 6 ≈ 2.16° 电角度（按 3000 rpm 估算）。选项 D 是不加 Z 信号 1 小时的真实灾难。',
      },
    },
    {
      id: 'decoupling-feedforward',
      title: '高速 dq 解耦前馈',
      goal: '理解为什么 6000 rpm+ 必须给 Park 后的 Vd/Vq 加交叉项前馈',
      action: '回顾 PMSM dq 电压方程：Vd = Rs·Id + Ld·dId/dt − ωe·Lq·Iq；Vq = Rs·Iq + Lq·dIq/dt + ωe·(Ld·Id + ψf)。其中 ωe·Lq·Iq 和 ωe·Ld·Id 是"交叉项"，ωe·ψf 是 BEMF。',
      observe: '低速（ωe 小）时交叉项 < 1V，可忽略；高速（ωe = 2π·100Hz = 628 rad/s）时 ωe·Lq·Iq = 628·0.001·10 = 6.28V，已占母线 10%；6000 rpm 6 极对时 ωe = 3770 rad/s，交叉项 38V 占满量程。',
      whyMatters: '不加解耦的纯 PI 在高速下会"拼命对抗交叉扰动"——PI 输出几乎全花在抵消 ωe·L·I，留给动态响应的余量很少，表现为高速段电流环带宽崩塌、Iq 命令跟踪误差变大、转矩纹波 + 噪声。前馈实现：vd_cmd = pi_d_out − omega_e * Lq * iq；vq_cmd = pi_q_out + omega_e * (Ld * id + psi_f);  其中 omega_e 用速度环估算值，Ld/Lq/ψf 是离线辨识参数。STM32 上前馈是 ISR 内 4 次乘加（~1 μs），但能让电流环带宽在高速段不下降 50% 以上。压缩机 4000 rpm 以上必加，否则爬升时听得到"嗡"的电流噪声。',
      quiz: {
        q: 'PMSM 极对数 6、Lq = 1.5 mH、Iq = 8A、转速 5000 rpm，q 轴交叉耦合电压 ωe·Lq·Iq 大约？',
        options: ['0.6V（基本可忽略）', '6V（10% 母线）', '38V（占满 1/3 母线）', '380V（远超母线）'],
        correct: 2,
        hint: 'ωe = 2π·(5000/60)·6 ≈ 3142 rad/s；ωe·Lq·Iq = 3142·0.0015·8 ≈ 38V。310V 母线下已占 12% — 不加前馈，PI 输出端干这一项就要 38V 余量，剩下控动态的余量大大压缩。这就是"低速好好的高速一加载就抖"的常见根因。',
      },
    },
    {
      id: 'inverse-park-pipeline',
      title: '反 Park 与全流水线',
      goal: '把 Park / 反 Park 接回完整 FOC ISR',
      action: '回想 PWM 周期内 FOC ISR 完整流水线：ADC 触发 → 读 Ia/Ib 重构 Ic → Clarke → Park → 电流 PI → 解耦前馈 → 反 Park → SVPWM → 写 CCR。',
      observe: 'Park 在前端把"测的 αβ 电流"变 dq 给 PI；反 Park 用同一个 θ（矩阵转置 = 旋转 −θ）把"PI 算的 Vdq"变回 αβ 给 SVPWM。一个 θ 错了，两次都错。',
      whyMatters: 'Park / 反 Park 是 FOC 流水线里唯一与转子角度强耦合的两段——θ 抖动会同时在采样侧污染 Id/Iq、在输出侧污染 Vα/Vβ。"角度质量"决定 FOC 上限：编码器分辨率、Z 信号校准、PLL 噪声、Park 计算精度（q15 vs float）一层层叠加。压缩机 PWM 16 kHz 下，Park 必须 < 5 μs 完成（含 sin/cos 查表 + 4 次乘加 + 2 次右移归一），否则 ISR 预算超支 → 速度环挤不进 1 kHz 任务 → 整个调度崩。',
    },
  ],
  pitfalls: [
    {
      id: 'mechanical-theta',
      label: '试错：用机械角度代替电角度（漏乘 polePairs）',
      symptom: 'Park 矩阵旋转速率慢 polePairs 倍，dq 量仍以电频率波动；Iq 阶跃响应 = 同频纹波 ± 直流',
      why: 'θe 必须 = θm × polePairs。压缩机 4-6 极对时漏乘几乎一定上电不转或反转。常见踩坑情境：① 直接用 encoder 计数器值（机械单位）当 θe；② 把"4 极电机"误填成 4 而不是 2；③ 双编码器系统（一个机械、一个电机）变量名搞混。修复：在 update_theta_e() 里强制 theta_e_q15 = (uint16_t)((int32_t)theta_m_q15 * POLE_PAIRS) — 用宏 POLE_PAIRS 而非散落的字面量。',
    },
    {
      id: 'wrong-direction',
      label: '试错：θ 方向取反（encoder 计数方向 vs 电机机械正转不匹配）',
      symptom: 'Iq*=+5A，电机反方向转或卡死抖动；电流幅值正常但转矩方向反',
      why: '编码器 A/B 信号接线方向 vs 电机机械正转定义如果不一致，θ 增长方向就反了。Park 把"按你以为的 q 轴方向"投到了反向 q 轴 → PI 给出反向 Vq → 反向 Iq → 反向转矩 → 闭环发散。第一次上电必须低压（1/3 母线）+ 开环 V/f 慢拖（10 rpm）验证 θ 增长方向；不匹配时 swap encoder A/B 接线或软件取反 TIM_EncoderMode_TI1。这是新机型量产前必做检测。',
    },
    {
      id: 'q15-overflow',
      label: '试错：Q15 Park 直接 (int16) * (int16) 不升 int32',
      symptom: '电流幅值超过 0.7·Imax 时 Id/Iq 出现"折返"或"夹断"，波形顶部削平',
      why: 'Q15 范围 [-1, 1) 对应 int16 [-32768, 32767]。两个 Q15 相乘等价于 (a/2¹⁵)·(b/2¹⁵) = ab/2³⁰，但中间值 ab 已是 int32（最大 ~2³⁰）。如果代码写成 int16 result = (int16)(i_alpha * cos_q15)，乘法在 16 位寄存器里就溢出截断了，结果完全错。修复：所有 q15 乘法中间必须升 int32，最后 >> 15 再降回 int16；ARM Cortex-M 的 __SMMLA / __SMMUL 内联汇编是为这件事专门设计的，比 C 写法快 2 倍。',
    },
    {
      id: 'theta-discontinuous',
      label: '试错：θ 用 float 累加不做 2π 归一化',
      symptom: 'θ 累加到 |θ| > 1e4 rad 时 sinf/cosf 精度断崖式下降；电流环莫名抖动且无法复现',
      why: 'float 单精度尾数 23 位，|θ| > 8192 时相邻浮点数间距 > 0.001，sin/cos 误差到 0.1%；|θ| > 1e6 时几乎无精度。每次进 Park 前必须把 θ 模 2π（或用 q31 自然溢出）。STM32 上 fmodf 比 while(theta>2π) theta-=2π 更稳（后者在 |theta|>>2π 时会卡很久）。最佳实践：θ 用 q31 整数表示（0..2³¹ 映射 0..2π），溢出 = 自动归一，省 fmodf，且 sin/cos 查表索引直接 theta_q31 >> (31-LOG2_TABLE_SIZE) 一行搞定。',
    },
  ],
  nextModuleHook: 'Park 把 αβ 变成了"PI 能控的直流量"，并且你已经知道 Q15 实现、Z 信号校准、解耦前馈三道工业坎。下一模块（05 PID）就拿这两根直流量来真正闭环——Kp = ω_bw·L 起步、抗积分饱和怎么写、采样周期 Ts 改了为什么 Ki 跟着改。',
};
