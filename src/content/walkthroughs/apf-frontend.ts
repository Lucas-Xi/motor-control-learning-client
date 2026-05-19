import type { ModuleWalkthrough } from './types';

/**
 * 15 APF 前级 PFC —— 把"电网取来的杂乱电流"整成跟电压同相的纯正弦，顺便升压到 380V。
 *
 * 工程语境：直流变频空调、商用冰柜、洗烘一体机等所有有"压缩机变频"的家电，入网前都
 * 必须过 IEC 61000-3-2 / GB/T 17625.1 谐波限值。无 PFC 的全桥整流 + 母线大电容方案，
 * 输入电流接近"窄脉冲"，THD 轻松超过 100%、PF 只有 0.6 左右——3C 认证直接挂掉，
 * 工厂退货 / 监管罚款都是真金白银。这一层接好了，后级 FOC 才有 380V 高母线可用。
 *
 * 教学深度：电流环 1-5 kHz 必须用 |sin| 模板做前馈跟踪、电压环 50-200 Hz 必须用 notch
 * 滤掉 100 Hz 母线纹波、电感选型要看饱和电流不是额定电流、母线电容 ΔU=I/(2·ω·C) 算清楚、
 * STM32 上 TIM1 + ADC 同步采样 + DMA 双缓冲完整骨架。
 */
export const apfFrontendWalkthrough: ModuleWalkthrough = {
  moduleId: 'apf-frontend',
  bigPicture: 'Boost PFC 双环：外环稳 380V 母线，内环让输入电流跟电压同形——PF→1、THD→低、过认证 + 给后级 FOC 留弱磁余量。',
  bigPictureEn: 'Boost PFC, two loops: the outer loop regulates the 380 V DC link; the inner loop shapes the input current to match the voltage — PF → 1, low THD, certification passes, and field-weakening headroom for the downstream FOC.',
  successCriteria: [
    '能讲清 Boost PFC 的四大件（升压电感、MOSFET、二极管、母线电容）各自的工程作用 + 选型公式',
    '能解释"为什么是双环、为什么外环慢内环快"，并说出典型带宽（电压环 50-200 Hz / 电流环 1-5 kHz）',
    '知道 PF / THD / 母线纹波三个指标的工程目标值（家电 PF>0.95 / 商用 PF>0.99 / THD<10%）',
    '能识别"电流环带宽不够 / 电感饱和 / 母线电容不足 / 双环带宽颠倒"四类典型现场坑',
    '理解为什么压缩机变频器必须先升压到 380V 才好做弱磁（弱磁电压余量 = 母线 − BEMF）',
    '能算电容选型：ΔU = I_load / (2·ω_line·C)，配合纹波 % 目标反推 C',
    '会写 STM32 TIM1 + ADC + DMA 双缓冲的 PFC 同步采样骨架（电网过零 + |sin| 模板 + 电感电流采样）',
  ],
  successCriteriaEn: [
    'Explain the engineering roles + selection formulas of the four Boost PFC components (boost inductor, MOSFET, diode, DC-link capacitor).',
    'Explain why two loops with outer slow / inner fast, and give typical bandwidths (voltage 50–200 Hz / current 1–5 kHz).',
    'Know the engineering targets for PF / THD / DC-link ripple (home appliances PF > 0.95 / commercial PF > 0.99 / THD < 10%).',
    'Identify four typical pitfalls: current-loop bandwidth too low / inductor saturation / under-sized capacitor / inverted inner-outer bandwidths.',
    'Understand why a compressor drive must boost to 380 V for proper field weakening (FW headroom = bus − BEMF).',
    'Size the capacitor: ΔU = I_load / (2·ω_line·C), and back-solve C from a ripple % target.',
    'Write the STM32 TIM1 + ADC + DMA double-buffered PFC synchronous-sampling skeleton (grid zero-cross + |sin| template + inductor-current sampling).',
  ],
  steps: [
    {
      id: 'pfc-why',
      title: '为啥要 PFC',
      goal: '建立"没 PFC 就是认证不过 + 后级弱磁没余量"的双重工程直觉',
      action: '默认 380V 母线下先观察主图：电网电压（青色正弦）与输入电流（mint 正弦）几乎重合，右上角 PF≈0.99、THD<10%。',
      observe: '电流波形是干净的正弦、跟电压基本同相位；母线电压稳在 380V 附近。',
      whyMatters: '这就是 PFC 要交付的"成品"。对比一下：没 PFC 的整流桥 + 大电容方案，输入电流只在电压峰值附近导通一小段（约 60° 导通角），THD>100%、PF≈0.6，过不了 GB/T 17625.1——工厂出货前 3C 认证一票否决，整条产线返工。**第二层意义**：没 PFC 时母线就是电网整流后的 |sin| 半波 + 大电容滤波 ≈ 300 V 平均、纹波 ±15 V；有 PFC 升到 380V 稳定，给后级 FOC 弱磁多出 80V 余量 → 压缩机最大转速能从 5500 rpm 推到 7200 rpm（一级能效门槛）。',
    },
    {
      id: 'boost-topology',
      title: '认 Boost 拓扑',
      goal: '把"升压电感 + MOSFET + 二极管 + 母线电容"四大件的作用串起来',
      action: '看右侧"为什么压缩机要 PFC"卡片 + 下方电感电流跟踪图，把整流桥后的 |sin| 半波 → 升压电感 → MOSFET 斩波 → 二极管单向导通 → 母线电容滤波这条链路在脑里走一遍。',
      observe: '电感电流 iL（橙）紧紧跟着参考 |sin|（灰虚线）走；母线电压（mint）在 380V 附近做小幅 100 Hz 纹波。',
      whyMatters: 'Boost 关系 Udc = Vrect / (1 − D)：D=0 时 Udc=电网峰值≈311 V（不升压），D=0.5 时翻倍到 ~620 V。家电典型工作点 D≈0.3-0.5，把 220V AC 推到 380-400V DC——这个 380V 不是随便选的，它正好给后级 PMSM 在 6000-8000 rpm 弱磁运行留出电压余量。各件选型口诀：① 电感 L = Vrect·D·Ts/(2·ΔiL_pp)，典型 1-2 mH / 30A 饱和；② MOSFET 选 600 V / 30 A SJ-MOS 或 SiC（高频低损）；③ 二极管选 SiC SBD 600V/20A（反向恢复电荷 0）；④ 电容 C 见下面"capacitor-ripple"步骤。',
      quiz: {
        q: '220V AC 电网（峰值 ~311V），Boost 占空比 D=0.4，理想稳态 Udc ≈ ?',
        options: ['311 V', '380 V', '520 V', '780 V'],
        correct: 2,
        hint: 'Udc = Vpeak / (1−D) = 311 / 0.6 ≈ 520 V。实际工程会限 D≤0.5 留余量（D 太大电感电流斜率不够，电流环跟不上），并把母线目标设在 380-400 V。如果要 520V 高母线（伺服 / 工业），需要更大电感和更高电流环带宽。',
      },
    },
    {
      id: 'inner-current',
      title: '内环：电流跟 sin',
      goal: '理解"PF=1 等价于电流跟着电压走同形同相"',
      action: '右侧把"母线目标 Udc"从 380V 拉低到 250V（接近不升压区）。盯住主图电网电压 vs 输入电流。',
      observe: '电流波形开始失真——峰值附近被削、过零点附近滞后；PF 从 0.99 跌到 0.8-0.9，THD 上窜到 20%+。',
      whyMatters: '当目标母线低于电网峰值时，Boost 没有"升压裕量"，电流环在电压峰附近饱和、控不住，电流自然就不再是正弦。这告诉你 PFC 工作的前提是 Udc > Vpeak·1.2 左右——这是为什么 220V 系统选 380V、110V 系统选 200V 的工程依据。把 Udc 拉回 380V，再看 PF 恢复到 0.99。**实现细节**：内环参考是 i_ref = i_amp · |sin(ω_line·t)|，其中 i_amp 由外环电压 PI 给出，|sin| 模板从电网电压采样实时计算（PLL 锁电网相位）—— 这就是"前馈跟踪"的核心思想，不是 PI 在追 sin，是直接告诉它"长什么样"。',
    },
    {
      id: 'outer-voltage',
      title: '外环：稳母线 + 100 Hz notch',
      goal: '搞清外环"为什么必须慢 + 为什么必须 notch 滤 100 Hz"',
      action: '保持 Udc=380V，把"负载电流"从 4A 阶跃到 12A（模拟压缩机突然加载），观察"母线电压稳定"图。',
      observe: '母线电压瞬间下沉 5-15V，然后用 50-200 ms 缓慢爬回 380V；电流幅值参考 i_amp_ref 慢慢加大。',
      whyMatters: '外环带宽 50-200 Hz 远小于内环 1-5 kHz，原因有三：① 整流后母线本身有 100 Hz 主纹波（电网 50 Hz 全波整流），外环带宽必须 < 100 Hz/2 才不会把纹波放大成调制误差；② 双环系统外快内慢必振荡（典型反面教材：把电压环 Kp 调到比电流环还高，母线立刻嗡嗡叫）；③ 母线下沉幅度由电容 C 决定：ΔUdc ≈ I_load / (2·ω_line·C)，外环响应快也救不了——救它的是大电容。**进阶**：高端 PFC 在电压反馈通道加 100 Hz notch 滤波器，把纹波打掉再进 PI，这样可以把外环带宽提到 300-500 Hz 而不被纹波激励振荡——但要小心 notch 引入的相位滞后，Q 值要选 0.3-0.5（不要太尖）。',
      quiz: {
        q: '双环 PFC 把电压环带宽调到 2 kHz、电流环 500 Hz（颠倒了）会怎样？',
        options: [
          '响应更快，母线下沉更小',
          '系统振荡，输入电流和母线电压都嗡嗡跳',
          'PF 变成 1',
          '没影响，只是 CPU 占用变高',
        ],
        correct: 1,
        hint: '外环必须远慢于内环——外环给内环下命令，命令变化速度比内环响应还快，内环根本来不及跟，必振荡。这是双环系统设计的铁律。整定顺序永远"先内后外"：先把电流环阶跃响应调到 10% 超调以内，再调外环 Kp 从内环带宽 / 10 起步。',
      },
    },
    {
      id: 'inductor-ripple',
      title: '电感与纹波',
      goal: '理解电感选型对电流纹波和 THD 的直接影响 + 饱和电流的隐藏陷阱',
      action: '把"Boost 电感 L"从默认 1.5 mH 拉低到 0.5 mH，看电感电流跟踪图。',
      observe: '橙色 iL 在 |sin| 参考线两侧的"抖动包络"明显变宽，THD 从 8% 升到 15-25%。',
      whyMatters: 'PWM 一个周期内电感电流的纹波 ΔiL = Vrect·D·Ts / L——L 越小纹波越大；当纹波幅度接近平均电流时，电流环就难以稳定跟踪 |sin| 模板，THD 直接超标。但 L 也不能太大，太大 → 体积成本上去 + 动态响应变慢 + 重载时进入磁饱和（关键陷阱：选电感时只看额定电流不看饱和电流，磁芯一旦超过饱和电流，L 急剧下降到标称 30%，同样占空比下纹波翻 3 倍，电流环失控）。生产中典型选型：1-2 mH 电感量 + 饱和电流 ≥ 1.5 倍峰值工作电流 + 工作温升 40-80 ℃ 留余量。磁芯选 SendDust（铁硅铝）或纳米晶，居里点 > 200 ℃；避免铁氧体（居里点 200 ℃ 但环境高温下磁导率掉很快）。',
    },
    {
      id: 'capacitor-ripple',
      title: '母线电容',
      goal: '量化"母线纹波"的工程含义 + 启动浪涌防护',
      action: '把"母线电容 C"从 470 μF 拉到 100 μF，看"母线电压稳定"图和右上角"母线纹波 %"指标。',
      observe: '母线在 380V 附近的 100 Hz 摆动从 ±2V 放大到 ±10V 以上；纹波 % 从 1% 跳到 5%+。',
      whyMatters: 'ΔUdc ≈ I_load / (2·ω_line·C)：电网 50 Hz 整流后是 100 Hz 主纹波，电容直接决定纹波幅值。后级 FOC 看到的母线如果纹波 >5%，dq 电压前馈解耦会失准、电流环也会被周期性扰动——表现为电机带恒定 100 Hz 嗡嗡声、转矩有 100 Hz 脉动、压缩机阀片疲劳寿命下降。家电压缩机典型选 470-1000 μF 高压电解（450 V 耐压 + 105 ℃ 长寿命系列）；选小了省成本但纹波超标，选大了启动浪涌电流过大要加 NTC 软启动电阻（典型 5-10 Ω 负温度系数热敏，启动后旁路继电器短接）。**注意**：电解电容 ESR 在 -20 ℃ 增大 5-10 倍，北方冬季空调外机启动时纹波会显著恶化，设计要按最坏温度算。',
      quiz: {
        q: '负载 1.5 kW、电网 50 Hz、母线 380V，希望纹波 < 3% (≈11 V)，母线电容至少需要多大？',
        options: ['47 μF', '220 μF', '600 μF', '4700 μF'],
        correct: 2,
        hint: 'I_load ≈ 1500/380 ≈ 4A；C ≥ I/(2·ω·ΔU) = 4 / (2·2π·50·11) ≈ 580 μF。所以选 680 μF 标准件（再上一级是 1000 μF）。这就是家电压缩机变频器母线电容的设计逻辑。考虑 ESR 温飘 + 20% 容值老化余量，BOM 实际选 820-1000 μF 是稳妥做法。',
      },
    },
    {
      id: 'stm32-impl',
      title: 'STM32 实现骨架',
      goal: '把双环 PFC 接到 TIM1 + ADC + DMA 双缓冲的具体寄存器配置',
      action: '想象目标 MCU 是 STM32 G4 / F334（带高分辨率 PWM）。要采样：① 电感电流 iL（每 PWM 周期）② 电网电压 v_grid（每 PWM 周期，用于 |sin| 模板）③ 母线电压 Udc（低频，1 kHz 够）。',
      observe: 'TIM1 中心对齐 50 kHz PWM（PFC 比 FOC 高一档，电流环带宽要 5 kHz）+ ADC1 注入序列 3 通道 + DMA 循环缓冲 → JEOS ISR 跑电流环 + TIM6 1 kHz 中断跑电压环。ISR 总耗时 < 5 μs，CPU 占用 25%。',
      whyMatters: 'STM32 G4 PFC 实现骨架（生产可抄）：' +
        ' /* TIM1 中心对齐 50kHz PWM (PFC 用高频，电流环要 5kHz 带宽) */' +
        ' LL_TIM_SetCounterMode(TIM1, LL_TIM_COUNTERMODE_CENTER_UP_DOWN);' +
        ' LL_TIM_SetAutoReload(TIM1, 1700);  /* 170MHz/(2*50k)=1700 */' +
        ' LL_TIM_SetTriggerOutput(TIM1, LL_TIM_TRGO_UPDATE);' +
        ' /* ADC1 注入序列：CH1=iL, CH2=vgrid, CH3=Udc */' +
        ' LL_ADC_INJ_SetTriggerSource(ADC1, LL_ADC_INJ_TRIG_EXT_TIM1_TRGO);' +
        ' LL_ADC_INJ_SetSequencerLength(ADC1, LL_ADC_INJ_SEQ_SCAN_ENABLE_3RANKS);' +
        ' /* JEOS ISR (50 kHz)：电流环 + |sin| 模板生成 */' +
        ' void ADC1_2_IRQHandler(void) {' +
        '   float iL = (ADC1->JDR1 - g_il_off) * IL_SCALE;' +
        '   float vgrid = (ADC1->JDR2 - g_vg_off) * VG_SCALE;' +
        '   /* 电网过零检测 + PLL 锁相得到 theta_grid */' +
        '   float sin_template = fabsf(sinf(theta_grid));  /* |sin| 模板 */' +
        '   float iL_ref = g_i_amp * sin_template;  /* 内环参考 */' +
        '   /* 电流 PI：带宽 5kHz，Kp = ω_bw·L = 2π·5000·1.5e-3 ≈ 47 */' +
        '   float duty = pi_update(&pi_curr, iL_ref, iL);' +
        '   duty = fmaxf(0.02f, fminf(0.95f, duty));  /* Boost D 上限 0.5-0.95 */' +
        '   TIM1->CCR1 = (uint32_t)(duty * TIM1->ARR);' +
        ' }' +
        ' /* TIM6 1kHz 中断：外环电压 PI + i_amp 输出 */' +
        ' void TIM6_DAC_IRQHandler(void) {' +
        '   float Udc = (ADC1->JDR3 - g_udc_off) * UDC_SCALE;' +
        '   /* 100 Hz notch 先滤掉纹波再喂电压 PI */' +
        '   float Udc_clean = biquad_notch_100hz(Udc);' +
        '   g_i_amp = pi_update(&pi_volt, UDC_REF, Udc_clean);' +
        '   g_i_amp = fmaxf(0.f, fminf(15.f, g_i_amp));' +
        ' }' +
        ' 三个工程数字：① PFC PWM 选 50-100 kHz（比 FOC 16 kHz 高 3-6 倍，让电流环能上 5 kHz 带宽）；② ADC 采样率 ≥ 100 kSPS；③ 电压环 1 kHz 任务周期足够（外环带宽 50-200 Hz）。',
    },
    {
      id: 'pf-thd-metrics',
      title: 'PF / THD 指标 → 售价段',
      goal: '把仿真数据接回认证 / 营销话术',
      action: '把 Udc 拉回 380V、L=1.5 mH、C=470 μF、负载 8A，读取右上角 PF 和 THD。',
      observe: 'PF ≈ 0.99，THD < 10%；两个 badge 都是 mint 绿色（measure 色阶）。',
      whyMatters: '工程目标三档对应不同售价段和 BOM 成本：① **家电入门 PF>0.95 / THD<20%** — 过 GB/T 17625.1 Class A 即可，BOM 电感 1 mH / 电容 470 μF / 电流环 1 kHz；② **商用空调 PF>0.99 / THD<10%** — 进政府采购名录、能效一级、出口欧盟 EN 61000-3-2，BOM 电感 1.5-2 mH / 电容 680 μF / 电流环 5 kHz / notch 100 Hz；③ **高端伺服 PF>0.995 / THD<5%** — 出口欧盟工业现场，BOM 用 SiC MOSFET + 100 kHz PWM + 数字 notch + 自适应 PI。每升一档售价多 30-50%，BOM 多 10-20 元——这是高端家电品牌的核心利润空间。',
    },
    {
      id: 'recap-handoff',
      title: '交棒后级',
      goal: '把 PFC 接进整个压缩机变频器链路',
      action: '回顾全链路：电网 220V AC → 整流桥 |sin| 半波 → Boost PFC（本模块）→ 380V 母线 → 三相逆变器（08）→ FOC SVPWM 驱动 PMSM（06/07）→ 弱磁高速运行（11）→ 制冷循环做功（16）。',
      observe: 'PFC 是整条链路的"电源接口管理员"——对电网负责（PF、THD），对后级负责（稳定 380V）。',
      whyMatters: '从产品视角：你卖的不是一台 FOC 控制器，而是一台"能过认证、能上货架"的家电核心板。少了 PFC，前面所有 FOC 优化都没意义——产品根本上不了市。下一模块 16 制冷台架，把 PFC + FOC + 压缩机 + 蒸气压缩循环串成一个完整的"系统工程"工况看——你会看到压缩机突加大冷量负载时，扰动如何从冷凝器水温 → 排气压力 → 转矩需求 → Iq → 母线电流 → PFC 内环幅值参考 → 电网电流逐级传导，整条链路任何一环响应不够快都会让母线掉电触发欠压保护。',
    },
  ],
  pitfalls: [
    {
      id: 'curr-loop-bw-low',
      label: '试错：电流环带宽不够，PF 拉不上来',
      symptom: '输入电流相对于电压明显滞后 + 形状变胖（不是窄正弦而是接近梯形），PF 卡在 0.85 上不去、THD 15%+',
      why: '电流环带宽必须 ≥ 电网频率 × 20（50Hz 系统至少 1 kHz；高端产品 5 kHz）才能让电流精确跟踪 |sin| 模板。带宽不够时高次谐波分量跟不进，电流形状失真。现场常见原因：① Kp 没调够（解析值 Kp = ω_bw·L = 2π·1000·1.5e-3 ≈ 9.4，实测 × 0.65 ≈ 6 留相位裕度）；② 电流采样滤波过重（RC 截止频率 < 5 kHz 把信号高频成分滤掉了）；③ DSP 周期太长（PFC 控制周期应 ≤ 20 μs，PWM 选 50 kHz 以上）；④ 电感太大让电流斜率不够。',
    },
    {
      id: 'inductor-saturate',
      label: '试错：升压电感饱和（重载时）',
      symptom: '负载从 4A 加到 12A 后，电感电流出现"陡峭尖峰"、THD 突然从 8% 跳到 30%+；电感发烫、铁芯有啸叫；过流保护频繁触发',
      why: '磁芯一旦超过饱和电流，电感量 L 急剧下降（可能掉到标称的 30%），同样占空比下电流纹波翻 3 倍，电流环根本控不住。生产坑：选电感时只看额定电流不看饱和电流，或环境温度高时磁芯居里点提前。正确做法：饱和电流要 ≥ 1.5 倍峰值工作电流，并留 40-80 ℃ 工作温升余量。磁芯选 SendDust（铁硅铝，居里点 500 ℃）或纳米晶（居里点 570 ℃），避免铁氧体（居里点 200 ℃ 但 100 ℃ 以上磁导率掉很快）。空调外机夏季机箱内 70 ℃ + 电感工作温升 60 ℃ = 130 ℃ 是常态，铁氧体在这个温度已经接近极限。',
    },
    {
      id: 'cap-undersize',
      label: '试错：母线电容选小，纹波超标',
      symptom: '母线 100 Hz 纹波从 ±2V 放大到 ±15V；后级 FOC 电机带明显 100 Hz 嗡嗡声、转矩脉动可闻；产品 EMC 测试 + 噪声测试翻车',
      why: 'ΔUdc ≈ I_load / (2·ω_line·C)：电容容量降一半，纹波翻一倍。BOM 工程师为了省 2 元钱把 680μF 换成 220μF，整机 EMC 测试 + 噪声测试全部翻车。隐藏代价：纹波大 → FOC dq 前馈失准 → Iq 100 Hz 抖动 → 压缩机吸气阀片疲劳 → 三年内故障率上升。修复：按 C ≥ I/(2·ω·ΔU_target) 选，留 20-30% 老化余量，105 ℃ 长寿命系列（典型 5000 小时 @ 105 ℃ → 实际 60 ℃ 工作能用 10+ 年）。',
    },
    {
      id: 'outer-faster-inner',
      label: '试错：外环带宽 > 内环（双环颠倒）',
      symptom: '上电后母线电压 ±20V 振荡、输入电流嗡嗡跳、整机听见低频"咕咕"声；电压环 Kp 调小后好转但响应变拖',
      why: '双环系统铁律：外环带宽必须 < 内环带宽 / 5。外环（电压 PI）给内环（电流 PI）下电流幅值命令，如果外环响应比内环还快，内环来不及跟，外环又改命令——正反馈震荡。新手调参从内环开始，先把电流环阶跃响应调到 10% 超调以内，再调外环到内环带宽的 1/10 起步。同时电压环反馈链上加 100 Hz notch 滤掉母线纹波，可以让外环带宽提到 200-300 Hz 而不振荡。',
    },
  ],
  nextModuleHook: '现在你把电网到母线这一段串通了：380V 稳压 + PF≈1 + THD<10%。最后一模块 16 制冷台架把 PFC + FOC + 压缩机 + 蒸气压缩循环连成一个完整系统，看工况扰动如何沿这条链路传导（冷凝器水温升高 → 排气压力 → 转矩需求 → Iq → 母线电流 → PFC 内环幅值参考 → 电网电流）。',
  nextModuleHookEn: 'You have now connected the grid-to-bus section: 380 V regulated + PF ≈ 1 + THD < 10%. Module 16 (refrigeration bench) ties PFC + FOC + compressor + vapor-compression cycle into a single system and traces how an operating-condition disturbance propagates along this chain (rising condenser water temperature → discharge pressure → torque demand → Iq → bus current → PFC inner-loop amplitude reference → grid current).',
};
