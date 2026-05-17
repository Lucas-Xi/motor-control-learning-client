import type { ModuleWalkthrough } from './types';

/**
 * 14 压缩机启动状态机 —— 把"上电到稳态"的 7 个状态、5 个切换条件、
 * 反液击斜坡、以及 3 类启动失败的可视特征讲透。
 *
 * 这是压缩机变频器出厂前"启动鲁棒性测试"必看的骨架：液击、阻转、冷启动
 * 三个测试场景，本质都是在拍状态机的进入 / 退出条件。
 */
export const startupStateMachineWalkthrough: ModuleWalkthrough = {
  moduleId: 'startup-statemachine',
  bigPicture:
    '7 段启动状态机：idle → precharge → align → V/f → HFI → BEMF → fieldweak，每段有显式进入/退出条件。',
  successCriteria: [
    '能背出 7 个状态的顺序，并说清每段的进入条件与退出条件',
    '理解 V/f → HFI → BEMF 的两次握手为什么按转速分档：取决于"角度信号信噪比"',
    '会用反液击斜坡 accelRampRpmS（300-800 rpm/s）保护压缩机阀片',
    '看到 Iq 突冲 / 转速反向 / 停在 align 三类波形，能快速定位是哪一段出错',
    '能在 STM32 上把 7 状态映射成 enum + switch，并写出 timeout / fault 兜底',
  ],
  steps: [
    {
      id: 'tour-7-states',
      title: '7 状态全景',
      goal: '先把 7 个状态名字、做的事、停留时长建立总体印象',
      action: '点"运行"让仿真从 0 跑到 8 秒；盯左上"启动状态机"卡片，看高亮 chip 依次从"待机"走到"BEMF 闭环"。',
      observe:
        'idle ~50ms → precharge 200ms → align 800ms（默认）→ open-loop 缓升到 100rpm → hfi 升到 500rpm → bemf 升到目标 3000rpm；右边曲线虚线（指令）和绿线（实际）逐段贴近。',
      whyMatters:
        '工程化压缩机控制器没有"一把启动"的捷径，必须分段——因为低速、中速、高速三段角度信号来源完全不同（强迫角度 / HFI 解调 / BEMF 观测），每段控制律不一样。',
    },
    {
      id: 'precharge-align',
      title: '预充电 + 对齐',
      goal: '看懂前两个"看似没事"的状态为什么不能省',
      action: '右侧把"对齐时长"从 800ms 改到 200ms；再跑一遍。',
      observe: '状态机切到 open-loop 时机变早，但 align 期间 Iq 还在飙升的中段就被打断。',
      whyMatters:
        'precharge 等的是母线电容缓充——直接合闸冲击电流能炸 IGBT。align 等的是"d 轴直流把转子拽到零位、并且静止"——如果转子还在转就开始 V/f，开环角度和真实角度差一个未知量，立刻失步。压缩机带液冷启动转子摩擦大，对齐时间常常要 1.0-1.5s，不是越短越好。',
      quiz: {
        q: 'align 阶段控制器给 d 轴施加直流电压，目的是？',
        options: [
          '给绕组预热避免冷态电阻偏差',
          '让转子停在"编码器零位 = d 轴对准 A 相"的状态，建立角度基准',
          '把母线电压拉到额定值',
          '触发 BEMF 观测器初始化',
        ],
        correct: 1,
        hint: '直流电压在 d 轴上 → 定子磁场固定指向 A 相方向；转子永磁体被拽过去，转子 N 极对齐 A 相 → 此时 θe = 0 的定义成立。',
      },
    },
    {
      id: 'vf-openloop',
      title: 'V/f 开环拖动',
      goal: '理解低速段为什么必须用开环 V/f 而不是直接闭环',
      action:
        '把"加速斜坡"先调到 600 rpm/s（默认）；观察 open-loop 段（约 1.0-1.2s 那段绿线）转速怎么从 0 爬到 100rpm。',
      observe:
        'rpmRef 虚线按 600 rpm/s 等斜率上升；实际 rpm 跟随但滞后约一个时间常数 τ≈0.15s；Iq 在 4-6A 区间，是 align 余热 + 加速出力。',
      whyMatters:
        '< 100 rpm 时反电动势 BEMF = Ke·ω 太小（甚至小于 ADC 量化噪声），BEMF 观测器解出来的角度全是噪声；只能由控制器"硬塞"一个按 V/f 比例上升的电压矢量，让转子被磁场拖着走。这一段控制器其实不知道转子在哪——只是相信物理规律会拽着走。',
    },
    {
      id: 'hfi-handoff',
      title: 'HFI 第一次握手',
      goal: '把 V/f → HFI 切换转速（hfiHandoffRpm，默认 100rpm）调清楚',
      action: '把"HFI 切入"从 100 改到 50 rpm，再跑；然后改到 300 rpm，再跑。',
      observe:
        '改成 50：HFI 段开始得太早，仿真里看不出明显问题，但真实电机 50rpm 时凸极比信号弱，角度估计噪声大。改成 300：open-loop 段被拉长，V/f 强拖到 300rpm，电流偏大、效率低。',
      whyMatters:
        'HFI 用的是凸极比（Ld ≠ Lq）解调出转子位置——这个方法的优势是零速 / 极低速也能用，但前提是电机本身有"凸极"。表贴式 PMSM 几乎没凸极，IPM 压缩机才能用。100 rpm 是经验值：低于此点 HFI 噪声 vs BEMF 噪声都大，索性还在 V/f；高于此点 HFI 信噪比够了，可以解出角度做闭环。',
      quiz: {
        q: '为什么不在 V/f 全程用 HFI，省得开环？',
        options: [
          'HFI 算力太大，STM32 跑不动',
          'HFI 需要持续注入高频电压扰动，会产生额外铜损 + 可听噪声，转速够用 BEMF 时就退出',
          'HFI 只能用一次',
          'HFI 必须先 V/f 训练参数',
        ],
        correct: 1,
        hint: 'HFI 是"以 1-2kHz 高频电压扰动换取角度信号"，付出的代价是损耗和噪声。一旦 BEMF 够大了就要切回 BEMF 观测器（更安静、效率更高）。',
      },
    },
    {
      id: 'bemf-handoff',
      title: 'BEMF 第二次握手',
      goal: '理解 HFI → BEMF 切换不是单纯按转速，而是按 BEMF 幅值阈值',
      action:
        '把"BEMF 切入"从 500 改到 200 rpm（提前切换）；看曲线在 200rpm 切换点的细节。',
      observe:
        '仿真里转速曲线本身平滑（一阶模型），但状态切到 bemf 的瞬间在真实系统会出现"角度跳变"——因为 HFI 估出的角度和 BEMF 观测器估出的角度有几度差异，切的瞬间 Park 投影矩阵换了张地图。',
      whyMatters:
        '500 rpm 的工程含义：BEMF = Ke·ω 此时幅值已经 5-10V，远高于 ADC LSB + 共模噪声 → 反电动势观测器（α-β 积分 + PLL）的角度估计能稳定收敛。切早了 BEMF 信号还埋在噪声里，PLL 锁不住，θ 抖动 → Id/Iq 互相串扰 → 听得到的电流啸叫。压缩机出厂调试这个阈值常常要试 3-5 次，每个机型不一样。',
    },
    {
      id: 'anti-slugging-ramp',
      title: '反液击斜坡',
      goal: '搞清 accelRampRpmS 为什么决定了压缩机能不能上线',
      action:
        '把"加速斜坡"从 600 改成 3000 rpm/s（违规快启动）跑一次；再改回 400 rpm/s 跑一次。',
      observe:
        '3000 rpm/s：rpmRef 几乎竖直上升，rpm 滞后追赶；Iq 在 align 后段瞬间冲到 12-15A 量级（看下半段曲线橙色 Iq 线）。400 rpm/s：曲线平缓，Iq 始终在 6-8A。',
      whyMatters:
        '压缩机停机时低压侧（蒸发器）的液态制冷剂会渗回气缸；上电瞬间如果电机转速突变，活塞快速压缩这些液体 → 液击 → 阀片碎裂、连杆变形。行业经验值 300-800 rpm/s 就是从"液体在压缩前有足够时间气化"反算出来的。控制器层面就是限制 dω/dt，配合速度环输出做低通滤波。这不是软件性能问题，是机械安全红线。',
      quiz: {
        q: '若客户投诉"压缩机上电几秒就异响 + 停机"，最先怀疑哪个参数？',
        options: [
          'PID Kp 太小',
          '加速斜坡 accelRampRpmS 太陡导致液击',
          'PWM 死区时间不对',
          '编码器分辨率不够',
        ],
        correct: 1,
        hint: '"上电几秒就异响"+ 压缩机场景 = 液击经典症状。先看启动日志里 accelRampRpmS 是不是 > 1000，是的话基本锁定。',
      },
    },
    {
      id: 'fieldweak-entry',
      title: '弱磁进入',
      goal: '把目标转速推到弱磁区，看第 7 个状态怎么进入',
      action: '把"目标转速"从 3000 改到 6000 rpm；跑完整 8 秒。',
      observe:
        '状态机在 ~5000rpm 处（fieldweakRpm 阈值）切到 fieldweak（最后一个粉色 chip 高亮）；转速继续爬升到 6000；Iq 曲线在弱磁段会变化（仿真简化但趋势对）。',
      whyMatters:
        '5000 rpm 之上 BEMF = Ke·ω 已经接近或超过母线电压余量，电压撞限 → 必须注入负 Id 削弱合成磁链才能继续升速（11 号模块讲过）。状态机层面 fieldweak 是 bemf 的"特殊分支"——电流环、角度估计照旧用 BEMF 那套，只是 Id 指令从 0 变成负值。压缩机变频空调到最大档基本都在这个状态。',
    },
    {
      id: 'state-machine-stm32',
      title: '迁回 STM32',
      goal: '把网页上看到的状态机翻译成 STM32 工程实现的最小骨架',
      action:
        '看"状态切换规则"卡片 + 教学讲义里的 C 代码示例：enum + switch，每个 case 处理 entry / steady / exit；记录 state_enter_ms、上一状态、timeout。',
      observe: '所有 7 个状态都靠 (stateAge >= XXX_DURATION) 或 (rpm >= XXX_HANDOFF) 这种简单条件切换，没有"靠感觉"。',
      whyMatters:
        '现场调试时打开黑匣子，看到的就是"在 align 卡了 5s 没切出去"这种日志——必须每个状态都有 timeout / fault 兜底（precharge 超 2s 母线没起来 → FAULT_PRECHARGE_TIMEOUT）。这一层骨架定下来，后面挂故障库、挂 APF 联动都有地方接。',
      quiz: {
        q: 'STM32 实现状态机切换瞬间最容易踩的坑是？',
        options: [
          '没用 volatile 关键字',
          '没重置电流环 PI 积分器，旧状态的积分残值打到新状态形成大冲击',
          'enum 顺序写反了',
          '没关中断',
        ],
        correct: 1,
        hint: 'V/f → HFI、HFI → BEMF 切换时控制律换了，电压指令计算方式也换了；如果 PI 积分器残值不清，会让新状态第一拍输出一个"莫名其妙的大电压" → Iq 冲击 → 转子抖一下。生产代码里 goto_state() 函数必须包含 pi_reset()。',
      },
    },
  ],
  pitfalls: [
    {
      id: 'align-too-short',
      label: '试错：对齐时长 200ms（转子没停稳就走）',
      symptom: '波形：open-loop 段一开始 Iq 异常突冲到 10A+，然后转速短暂反向几十 rpm，再正向爬升',
      why:
        '压缩机带负载阻力，800ms 才能让转子稳定停在 d 轴零位；200ms 时转子还在惯性回摆，控制器以为 θe=0，实际 θe 偏了 ±20°。V/f 上电瞬间力矩方向跟转子运动方向相反 → 转子先反转一下、电流冲击 → 然后才被磁场重新拽回。生产中这是"启动有金属敲击声"的典型原因，必须延长 align 或增加 align 阶段的电流限幅。',
    },
    {
      id: 'vf-voltage-too-low',
      label: '试错：V/f 比例不对（电压系数偏小）',
      symptom: '波形：状态机一直停在 open-loop，转速爬到 30-50 rpm 就上不去，最终 timeout 转 fault；现场表现是"电机嗡嗡响但不转"',
      why:
        'V/f 启动的物理本质是"给定子电压 → 产生足够磁链 → 拽动转子"。电压系数偏小时低速段电压不足以克服绕组阻性压降（V_R = I·Rs），磁链建立不起来 → 转矩不够推动负载 → 失步停转。压缩机比通用电机更难调，因为冷启动时润滑油黏度高、负载力矩大。修复：抬高 V_min（最低启动电压）或加大 V/f 比例（典型 0.5-1.5 V/Hz）。',
    },
    {
      id: 'bemf-handoff-too-early',
      label: '试错：BEMF 切入阈值 200rpm（切早了）',
      symptom: '波形：bemf 段开始的 100-200ms 内 θe 估计角度抖动 ±5°；Iq 线条变毛刺；可听到尖锐的电流啸叫；严重时 PLL 失锁，状态机回退到 HFI 形成震荡',
      why:
        '200rpm 时 BEMF 幅值大约只有 500rpm 的 40%，反电动势观测器（α-β 积分 + PLL）的信噪比不够 → 解出来的角度抖。Park 投影矩阵带噪 → "纯 Iq"指令被部分泄漏到 Id → 电流环输出又泄漏回电压 → 形成低频自激震荡。正确做法是切换条件加上"BEMF 幅值 > 阈值"且"PLL 锁定标志 = 1"双重判据，光按转速不靠谱。',
    },
    {
      id: 'ramp-too-steep',
      label: '试错：加速斜坡 3000 rpm/s（违规快启动）',
      symptom: '波形：Iq 在 align 结束瞬间冲到 15A+ 维持数百毫秒；现场表现是压缩机内部有"砰"的一声闷响，1-2 秒后过流保护停机',
      why:
        '3000 rpm/s 意味着 1 秒内要把转速从 0 拉到 3000rpm，dω/dt 远超液态制冷剂在气缸内气化所需时间 → 活塞快速压缩液体 → 液击 → 阀片瞬间过载。即使没立刻打坏，长期累积也会导致阀片金属疲劳。售后场景这是"压缩机 3 个月后出现异响然后罢工"的根因之一。出厂前的"启动鲁棒性测试"必跑场景。',
    },
  ],
  nextModuleHook:
    '现在你拿到的是一台"能可靠启动到稳态"的压缩机。但前面还有一关——母线电压从哪来？下一模块 15 号 APF 前级 PFC 讲单相 220V 经 Boost PFC 整流到 380V 直流母线，把谐波抑制 + 功率因数 + 与启动状态机的联动一次讲透。',
};
