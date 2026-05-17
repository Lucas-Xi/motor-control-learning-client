import type { ModuleWalkthrough } from './types';

/**
 * 05 PID 控制 —— 把 P / I / D + 限幅 + 抗积分饱和 + 采样周期六件事全部串成可上 STM32 的代码。
 *
 * 教学路径：健康基线 → Kp 推到振荡看 Nyquist → Ki windup 灾难 →
 *           抗饱和打开（Back-Calc 公式 + C 实现）→ Ts 改后 Ki 跟着改 → 增量式 vs 位置式 →
 *           多环嵌套带宽 5-10 倍约束 → CORDIC / DSP 指令加速 ISR 内 PID。
 *
 * 工业绑定：空调压缩机电流环（PWM 16k、带宽 1-1.5 kHz）、洗衣机滚筒速度环、
 *           伺服关节位置环、APF 直流母线电压环、PFC 内电流环。
 */
export const pidControlWalkthrough: ModuleWalkthrough = {
  moduleId: 'pid-control',
  bigPicture: 'P / I / D + 限幅 + 抗积分饱和 + 采样周期 —— 把这六件事拧成一个能上 STM32 ISR 的闭环。',
  successCriteria: [
    '能用一句话说清 P / I / D 各自解决什么（响应速度 / 稳态误差 / 变化率抑制）',
    '能识别 4 类典型病症：响应慢、超调、稳态误差、积分饱和大超调',
    '理解输出限幅 + 抗积分饱和必须成对出现，并能写出 Back-Calc 的 C 代码（Kt = Ki/Kp）',
    '知道 Ts 是 PID 参数的"刻度尺"——改 PWM 频率必须重算 Ki/Kd 或换增量式',
    '能说出"内环带宽 ≥ 外环带宽 × 5~10"和实测如何整定（先内后外、Ziegler-Nichols 临界）',
    '会用 ARM CMSIS-DSP arm_pid_f32 / STM32 CORDIC 加速 ISR 内 PID 计算',
  ],
  steps: [
    {
      id: 'baseline',
      title: '健康基线',
      goal: '记住"健康阶跃响应"的样子',
      action: '默认参数（Kp≈2.2、Ki≈18、Kd=0、目标 1.0、限幅 24 V、抗饱和开），点运行。',
      observe: '输出平滑爬到 1.0，超调 < 10%，上升时间百毫秒级，稳态误差 ≈ 0。指标卡片全 mint。',
      whyMatters: '所有调参都是在已知基线上做扰动观察。先记住这张曲线——后面失败模式都是它的变形。这是空调电流环典型期望：1 ms 进入 5% 误差带、无超调、稳态零误差。',
    },
    {
      id: 'kp-to-nyquist',
      title: 'Kp 推到 Nyquist 边界',
      goal: '看 Kp 推大到 Nyquist 临界振荡',
      action: 'Kp 从 2.2 慢慢推到 8，记下开始持续等幅振荡的 Kp_critical。',
      observe: '振荡越大→ Kp_critical ≈ 6-7 时进入等幅振荡（既不发散也不衰减），超调跳红。',
      whyMatters: 'Kp 决定"对当前误差有多敏感"。STM32 电流环理论起点 Kp = ω_bw·L —— 1 kHz 带宽、L=1 mH → Kp = 6.28。但实际 PWM 中点采样 + CCR 下周期生效 + 滤波 = 总延迟 1.5 个 PWM 周期，相位裕度缩水，实际取 0.5-0.7 倍解析值才稳。这就是"算得出来 ≠ 调得出来"的核心。',
      quiz: {
        q: 'Kp 推到 Kp_critical 后系统进入等幅振荡（不衰减），物理上意味着？',
        options: [
          'CPU 算力不够',
          '反馈环路在某频率总相移到 −180°、增益又 = 1，临界稳定边界（Nyquist）',
          'Ki 太小',
          '电源不稳',
        ],
        correct: 1,
        hint: '经典 Nyquist 稳定边界。Ziegler-Nichols 临界比例法的用法：Kp_critical 找到后取 0.4-0.6 倍作为工作点 Kp，再加 Ki = 1.2·Kp/Tu（Tu 是振荡周期）。这套方法对一阶 + 延迟的对象很灵——电流环、温度环都适用。',
      },
    },
    {
      id: 'windup-disaster',
      title: 'Windup 灾难',
      goal: '看关掉抗饱和 + 大目标的积分 windup',
      action: '目标拖到 2.5（接近限幅）、Ki 推到 60、关掉"抗积分饱和"开关，运行。',
      observe: '输出撞限 24 V 后被卡住；积分仍偷偷累加；实际值开始追上目标时，积分已攒成"虚假需求" → 输出冲过目标产生大超调，要花数倍稳态时间消化完。',
      whyMatters: '这是电机过流保护被频繁触发的头号原因。物理上：限幅期间误差仍非零、Ki·Ts·Σe 仍在累加；解除限幅时 PI 还以为"还差很多"，于是死撑最大输出。压缩机变频空调"刚启动一下子电流冲到限幅然后过流保护"几乎都是这种 bug——Ki 开了但抗饱和忘开。',
    },
    {
      id: 'antiwindup-backcalc',
      title: '抗饱和 Back-Calc 落地',
      goal: '把"撞限期间冻结 / 反算积分"翻成 C 代码',
      action: '保持上一步大目标 + 大 Ki，打开"抗饱和"。观察超调被压下来。',
      observe: '撞限期间输出仍贴 24 V，但积分不再无限累加；释放后超调大幅缩水，收敛时间明显变短。',
      whyMatters: 'STM32 标准 PID + Back-Calc 抗饱和 C 实现（每次 ISR 里调用）：' +
        ' typedef struct {' +
        '   float kp, ki, kd, ts;' +
        '   float i_term, prev_err;' +
        '   float u_min, u_max;' +
        '   float kt;  /* Back-Calc 系数，典型 = ki/kp */' +
        ' } PID_t;' +
        ' static inline float pid_update(PID_t *p, float ref, float meas) {' +
        '   float err = ref - meas;' +
        '   float p_term = p->kp * err;' +
        '   p->i_term += p->ki * err * p->ts;' +
        '   float d_term = p->kd * (err - p->prev_err) / p->ts;' +
        '   p->prev_err = err;' +
        '   float u_unsat = p_term + p->i_term + d_term;' +
        '   float u_sat = u_unsat > p->u_max ? p->u_max :' +
        '                 u_unsat < p->u_min ? p->u_min : u_unsat;' +
        '   /* Back-Calculation: 若饱和，把超出部分反算回积分项消掉 */' +
        '   p->i_term += p->kt * (u_sat - u_unsat) * p->ts;' +
        '   return u_sat;' +
        ' }' +
        ' Kt 选 ki/kp（典型经验值）— 让积分以"还原时间常数 = kp/ki"被反推。对比另一种简单做法 "Conditional Integration"（撞限就停止累加），Back-Calc 释放后恢复更快、不会出现"卡死在限幅"的现象。生产代码里 Back-Calc 是首选。',
      quiz: {
        q: 'Back-Calc 抗饱和的 Kt 系数选 ki/kp，物理含义是？',
        options: [
          '让积分按时间常数 kp/ki 衰减回来',
          '随便选的经验值',
          '让积分立刻清零',
          '保护硬件',
        ],
        correct: 0,
        hint: 'Kt = ki/kp 让积分的"反推速度"等于 PID 的开环时间常数 ki/kp —— 撞限时积分慢慢被反算消掉，释放限幅时积分残值正好和当前需求匹配。Kt 太小：恢复慢、释放后仍有超调；Kt 太大：积分反推过头、稳态误差被冲掉但易振。',
      },
    },
    {
      id: 'sample-rate-shift',
      title: 'Ts 改了 Ki/Kd 跟着改',
      goal: '理解 Ts 是位置式 PID 的隐性"刻度尺"',
      action: '把 Kp/Ki 调回基线，单独把"采样周期"从 1 ms 改到 4 ms（PWM 从 1 kHz 降到 250 Hz）。',
      observe: '响应明显变拖；可能从稳定切换到持续振荡。',
      whyMatters: '位置式 I 项 = ki·Ts·Σe，Ts 变 → 等效积分增益跟着变；D 项 = kd·Δe/Ts，Ts 减半 D 强度翻倍。"代码移植到更高 PWM 频率后 PID 必须重调"就这个理。压缩机控制器 PWM 从 16 k 升到 20 k 一定要重整定。一劳永逸方案：用增量式 PID（Δu = kp·Δe + ki·Ts·e + kd/Ts·(Δe − Δe_prev)），把 Ts 解析嵌入公式——但增量式有积分初值不可控的问题，工程上用得不多。',
      quiz: {
        q: '把 STM32 电流环 PWM 从 16 kHz 升到 20 kHz（Ts 从 62.5 μs 缩到 50 μs），位置式 PI 的 Ki 该怎么动？',
        options: [
          '不变',
          'Ki 等比例放大 25%（Ki_new = Ki_old × (Ts_old/Ts_new) 保持 Ki·Ts 等效）',
          'Ki 等比例缩小 25%',
          '只动 Kp',
        ],
        correct: 1,
        hint: '位置式积分等效增益 ∝ Ki·Ts。Ts 缩到 0.8 倍，要保持等效就把 Ki 放大 1/0.8 = 1.25 倍。或者干脆用增量式 PID 摆脱 Ts 依赖。注意 Kd 反向：Ts 缩 → Kd 应缩同比例（Kd/Ts 保持）。',
      },
    },
    {
      id: 'nesting-bandwidth',
      title: '多环嵌套带宽',
      goal: '理解"内环带宽 ≥ 外环 × 5-10"为什么是铁律',
      action: '回顾：FOC 电流环（最内）→ 速度环 → 位置环（最外）。典型带宽：电流环 1-5 kHz、速度环 50-500 Hz、位置环 5-50 Hz。',
      observe: '带宽逐层降 5-10 倍。',
      whyMatters: '外环带宽 > 内环 / 5 时，外环命令变化太快、内环跟不上 → 互相打架进入振荡。这是"调单环没问题、合起来就抖"的核心原因。整定顺序永远"先内后外"。工程数字：空调压缩机电流环 1.5 kHz / 速度环 100 Hz / 位置环 10 Hz；伺服关节电流环 4 kHz / 速度环 400 Hz / 位置环 50 Hz。',
      quiz: {
        q: '速度环 Kp 调到比电流环响应还快（速度环带宽 = 电流环带宽 × 2），会发生？',
        options: [
          '响应更快、性能更好',
          '速度命令变化快于电流环跟踪能力 → 电流环来不及响应 → 两层互相追逐振荡',
          '只是 CPU 占用变高',
          '弱磁失效',
        ],
        correct: 1,
        hint: '内环必须"看起来像瞬时执行器"才能让外环把它当作纯增益模块去设计。外快内慢 = 内环看到的命令本身在抖 → 内环输出抖 → 反馈给外环 → 形成自激。压缩机调试时"单跑电流环 OK、加速度环立刻嗡嗡叫" 99% 是这个问题。',
      },
    },
    {
      id: 'd-on-current-noise',
      title: '电流环不要加 D',
      goal: '理解为什么电流环用 PI 而不是 PID',
      action: '把 Kd 从 0 加到 0.05，看响应。',
      observe: '阶跃响应顶部出现高频毛刺；噪声被放大；严重时听见啸叫。',
      whyMatters: 'D 项 = Kd·Δe/Ts，把 ADC 量化噪声的 Δe 放大 Kd/Ts 倍。电流环 Ts 短（62.5 μs）→ Kd/Ts 极大，噪声直接打到电压指令上 → SVPWM 占空比抖 → 电流再噪化，正反馈式恶化。修复：电流环用 PI 即可（电流系统是一阶，PI 给一个零点 + 极点解析整定足够）。位置环静态条件下才考虑加 D（且必须配截止 50 Hz 左右的低通）。',
    },
    {
      id: 'cmsis-dsp-cordic',
      title: 'CMSIS-DSP / CORDIC 加速',
      goal: '把 PID 真正放进 ISR 里看时序预算',
      action: '回顾 STM32 上 PI 计算约 5 个 float 乘加，FPU 单周期，约 0.3 μs；ISR 总预算 62.5 μs 里完全够用。',
      observe: 'PI 占 0.5 μs，Park / 反 Park 各 0.5 μs（用 CMSIS arm_sin_cos_f32 或 STM32 G4/H7 内置 CORDIC 加速），SVPWM 1 μs，加 ADC 读取 + 各种判断 < 6 μs，CPU 占用 < 10%。',
      whyMatters: 'STM32 G4 / H7 上 CORDIC 协处理器可以硬件算 sin/cos / atan2 / 模 / 平方根，比 CMSIS-DSP 软实现快 5-10 倍。配置示例：' +
        ' /* G4 CORDIC 算 sin/cos for Park */' +
        ' LL_CORDIC_Config(CORDIC, LL_CORDIC_FUNCTION_COSINE,' +
        '   LL_CORDIC_PRECISION_6CYCLES, LL_CORDIC_SCALE_0,' +
        '   LL_CORDIC_NBWRITE_1, LL_CORDIC_NBREAD_2,' +
        '   LL_CORDIC_INSIZE_32BITS, LL_CORDIC_OUTSIZE_32BITS);' +
        ' LL_CORDIC_WriteData(CORDIC, theta_q31);  /* 写入电角度 q31 */' +
        ' uint32_t cos_q31 = LL_CORDIC_ReadData(CORDIC);' +
        ' uint32_t sin_q31 = LL_CORDIC_ReadData(CORDIC);' +
        ' /* 6 周期完成，168 MHz 下约 36 ns */' +
        ' 对比软 sin/cos 表查找 + 插值约 0.4 μs——CORDIC 让 ISR 时序更宽松。压缩机 PWM 升到 20 kHz 时这点余量决定能不能塞下 HFI 解调 + BEMF PLL。',
    },
  ],
  pitfalls: [
    {
      id: 'no-antiwindup',
      label: '试错：开 Ki 但关抗积分饱和',
      symptom: '阶跃后大超调、长时间收不住、频繁触发过流保护跳闸',
      why: '限幅期间积分仍累加 → 攒成虚假需求；撞限解除后 PI 死撑最大输出直到积分被反向消化——这段时间就是过流爆表窗口。修复：用 Back-Calc（Kt=ki/kp）反算积分；或者最简单的 Conditional Integration（撞限就 i_term 不变）。任何 Ki>0 的环路 + 有限幅 = 抗饱和不开 = 定时炸弹。',
    },
    {
      id: 'd-on-current',
      label: '试错：电流环加 Kd',
      symptom: '明显啸叫、波形顶部毛刺、温度上升后更不稳',
      why: 'D 项 ∝ Δe/Ts，把 ADC 量化噪声放大 Kd/Ts 倍。电流环 Ts ~62.5 μs → Kd/Ts 极大；噪声进 Vd/Vq 后又通过 SVPWM 回到电流 → 正反馈恶化。电流系统本身是一阶，PI 给零点对消足够。位置环静态条件可考虑 D（配 50 Hz 低通），速度环极少加 D。',
    },
    {
      id: 'same-bandwidth-nesting',
      label: '试错：速度环带宽 = 电流环带宽',
      symptom: '单跑电流环 OK，加速度环立刻嗡嗡叫；转速振荡频率约等于电流环带宽',
      why: '外环命令变化频率接近内环带宽 → 内环跟不上、外环又改命令 → 两层互相追逐自激。规则：内环带宽 ≥ 外环带宽 × 5-10。整定顺序：① 先把电流环阶跃响应调到 10% 超调以内 ② 再调速度环 Kp 从电流环带宽 / 10 起步 ③ 最后调位置环。生产里"内外环带宽比" 是控制器健康度的核心指标。',
    },
    {
      id: 'ts-mismatch-after-rebuild',
      label: '试错：PWM 频率改了忘了重算 Ki / Kd',
      symptom: '原本健康的曲线突然变成振荡或拖沓；代码也没动只改了 TIM1 ARR',
      why: '位置式 I = Ki·Ts·Σe、D = Kd·Δe/Ts，Ts 是参数的"刻度尺"。16 k → 20 k Ki 必须 ×1.25、Kd 必须 ×0.8。修复路径：① 把 Ts 作为 PID_t 结构体字段，初始化时计算并存 ② 升级到增量式 PID（Δu = kp·Δe + ki·Ts·e + kd/Ts·(Δe − Δe_prev)）让 Ts 嵌进公式 ③ 单元测试里加 Ts 变化下行为不变的回归。',
    },
  ],
  nextModuleHook: 'PI 单环已能跑稳。下一模块（06 FOC 流水线）把 PI 装到 dq 电流环里，处理真实 PMSM 的 R/L/ω 耦合，看 Kp = ω_bw·L、Ki = ω_bw·R 这套解析整定怎么真正落地，以及 ADC 中点采样 + 1 周期 CCR 延迟怎么吃掉相位裕度。',
};
