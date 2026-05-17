import type { ModuleWalkthrough } from './types';

/**
 * 17 整机搭建工作台 —— 把前 16 个模块的概念串成一台完整压缩机变频器的"装配课"。
 *
 * 教学路径：见 default 配置 → 跑诊断 → 存快照 → 改 slot 看 diff → 进挑战模式 →
 *           看解题路径 → 历史两两对比 → 导出 .c。
 *
 * 终极目标：让学员能独立完成"客户给参数 → 选型 + 验证 + 给 STM32 工程模板"的工程闭环。
 */
export const assemblyWorkshopWalkthrough: ModuleWalkthrough = {
  moduleId: 'assembly-workshop',
  bigPicture: '把前 16 模块的概念串成整机：6 槽位选型 + 时域仿真 + 11 道挑战 + 导出 STM32 main.c。',
  successCriteria: [
    '能从 6 个槽位（压缩机 / 变频器 / 控制策略 / 工况 / PFC / 液气分离器）选出合理组合让 verdict 至少到 pass-warn',
    '能从诊断条目里读出每个 fault / warn 的原因，知道每条对应回去哪个核心模块复习',
    '能说清"约束传播"：压缩机额定 → 逆变器电流 → 母线电压 → 调制限 → 是否需要弱磁',
    '能用挑战模式调试通过 Lv.1~Lv.4 的至少 5 道题，且看过自己解题路径',
    '能用历史会话两两对比看出"换某个 slot 对 KPI 的具体影响"',
    '能按当前组合导出对应 MCU 厂商风格的 main.c 骨架，看懂顶部 banner 和 ISR 名',
  ],
  steps: [
    {
      id: 'orient-6-slots',
      title: '认识 6 槽位',
      goal: '把工作台的 6 个积木看一遍，知道默认配置是什么',
      action: '注意顶部标题下方 "自由搭建 / 挑战模式 / 历史会话" 三个 tab；左侧拓扑图分两行：上行制冷链（工况 → 分离器 → 压缩机），下行电气链（PFC → 变频器 ← 控制器）。下方 6 个 SlotPicker 卡片是详细选型；每张卡片的"current"是当前选中，"subtitle"是简介。',
      observe: '默认：海立 BSA325CV 1.5HP（R32 滚动转子）+ Sanken SCM1241MF + Renesas RX26T + FOC+HFI+BEMF + 夏季制冷 + Boost 单相 PFC（380V）+ 标准液气分离器。这是空调外机最主流的家用配置。',
      whyMatters: '工业上"选型 + 验证"是项目启动的第一步。选错任何一个 slot 都可能在产线点检环节被卡。本模块把这个流程仿真化：先在前 16 模块学单点，再在这里串成系统。',
    },
    {
      id: 'first-run',
      title: '跑首次诊断',
      goal: '看懂 verdict + 8 KPI + 诊断清单 + 时域时间线',
      action: '点 header "运行整机仿真"按钮（青色，带 Play 图标）。等约 200ms。',
      observe: '右栏出现 mint 色"通过"徽章（verdict=pass-warn 也可能）+ 8 个 KPI 卡（制冷量 / 输入功率 / COP / 排气温度 / 压比 / 目标转速 / 稳态 Iq / 母线余量）+ 诊断清单（10+ 条目，按 ok/warn/fault 分色）。左下出现"8 秒启动+稳态时域仿真"图，rpm 从 0 爬到 ~5400，状态切换标线显示 align → openloop → hfi → bemf。',
      whyMatters: 'verdict 是一眼定级；KPI 是"硬指标"；诊断清单是"具体哪里有问题及去哪复习"；时间线是"启动过程是否顺利"。这四层信息层次决定了你后续优化方向。',
      quiz: {
        q: '诊断清单里出现一条"warn 加速斜坡 1200 rpm/s 接近标准液气分离器上限 1500"，怎么办最合理？',
        options: ['立刻换大容量低温分离器（3000 rpm/s）', '保持现状（warn 不是 fault）', '把 load.rampRpmS 调到 800', '重启浏览器'],
        correct: 1,
        hint: 'warn 是"接近边界"提示，不阻断。如果你不计划高强度冷启动，保持现状是最合理的——换大分离器是成本浪费。生产中常见做法是看是否长期工作在 warn 边界。',
      },
    },
    {
      id: 'save-baseline',
      title: '存基线快照',
      goal: '把当前组合存为快照，方便后续改 slot 时做 diff',
      action: '点 header "保存快照 0/5"按钮（带 Save 图标），弹窗里默认名字是"海立 1.5HP · FOC · 空调制冷·夏季典型"，确认即可。',
      observe: 'header 计数变 "保存快照 1/5"；右栏诊断面板下方出现"快照对比（1/5）"卡片，列出刚保存的这条，蓝色边框"当前"徽章标记。',
      whyMatters: '工程师做实验最容易忘"上次哪个配置最好"。快照系统让你随时存基线，改完一通后能秒回。注意快照存到 localStorage，跨刷新保留，但同名会覆盖。',
    },
    {
      id: 'sandbox-tweak',
      title: '改一个 slot 试',
      goal: '体验"约束传播" —— 改一个 slot 看多个 KPI 怎么联动',
      action: '把"PFC 前级"下拉换成"Vienna 三相 PFC (600V)"。再点"运行整机仿真"。',
      observe: '诊断里"电压利用率"那一行从 ~60% 跌到 ~30%（因为母线 380V → 600V），"母线余量" KPI 从 30% 涨到 70%。其它 KPI（COP / T_d）几乎不变（PFC 不影响制冷循环）。右栏"快照对比"卡片显示 diff："母线余量 +40%"染 mint 色。',
      whyMatters: '这是"约束传播"的直接体验：换 PFC 母线电压变 → SVPWM 上限变 → 弱磁余量变。对应到工业 BOM 选型：高功率机型才需要 Vienna，家用 1.5HP 用 Boost 单相足够。',
    },
    {
      id: 'enter-challenge',
      title: '进挑战模式',
      goal: '看懂挑战模式的引子 / 目标 / 必修问题进度条',
      action: '点 header tab "挑战模式"，下拉选 Lv.1 "逆变器选小了"（默认就是它）。看左上 ChallengeCard：题目 + 引子 + 目标 + 提示按钮 + 必修问题进度条 0/1。',
      observe: '6 槽位被自动重置：海立 1.5HP + Panasonic MIP6P011W（10A）。点"运行整机仿真"看诊断：必有"逆变器额定 10A < 7×1.5 = 10.5A"的 fault。verdict 是"不通过"。',
      whyMatters: '挑战模式是"调试通过"练习。每道题模拟一个真实客户场景的错配。和 ChatGPT 给标准答案不同，这里要求你自己找出哪个 slot 错了——这就是售后工程师的日常。',
    },
    {
      id: 'solve-and-replay',
      title: '解题 + 看路径',
      goal: '把挑战调到通关，回看解题路径每步 fault 数变化',
      action: '把"变频器平台"下拉换成 Sanken SCM1241MF（15A）或 Onsemi NFAM5065L4B（15A），再点"运行整机仿真"。诊断面板下方出现 SolutionPathPanel 显示 2 步路径。',
      observe: 'mint 色"通关！"庆祝条；进度条 1/1。SolutionPathPanel 第 1 步标"初始 fault 1"；第 2 步标"变频器 改：MIP6P011W → SCM1241MF，fault 1 → 0 ↓"。header 挑战 tab 变 "挑战模式（1/11）"。',
      whyMatters: '解题路径回放让你看出"哪一步是关键决策"。这次只一步就通关；Lv.4 综合题往往要 3-5 步。养成 diff thinking 习惯：每改一次跑一次，看 fault 减没减——比"乱试 + 看运气"高效得多。',
      quiz: {
        q: '通关后 header 显示"Trophy 1"是什么意思？',
        options: ['通关用了 1 次尝试', '总分 1 分', '剩 1 题没做', '随机数'],
        correct: 0,
        hint: 'Trophy 旁边的数字是"最少通关尝试次数"。下次重做同一题，如果用更少次数解决，会刷新成绩。这数字存 localStorage 跨刷新。',
      },
    },
    {
      id: 'history-compare',
      title: '历史两两对比',
      goal: '在 20 条历史归档里挑 2 条做 A/B testing',
      action: '点 header tab "历史会话"。注意每条记录左侧有 checkbox。勾选两条：一条挑战通关前（fault > 0）+ 一条通关后（fault = 0）。',
      observe: '列表顶部出现"对比 · A 早 → B 晚"卡片：slot 差异（"变频器: MIP6P011W → SCM1241MF"）+ KPI delta（"fault 1 → 0 -1 mint 色"）。',
      whyMatters: '历史会话 ≠ 快照：历史是自动归档的日志（每次运行都存）；快照是手动保存的基线。两两对比适合跨日 / 跨题回看："上周这个组合是怎么 fail 的"。',
    },
    {
      id: 'export-c',
      title: '导出 STM32 模板',
      goal: '把当前组合导出可编译的 main.c 骨架',
      action: '回到自由搭建 tab，确认 6 槽位是你想要的组合。点 header "导出 .c"按钮。浏览器下载 `assembly_xxx_xxx_20260512-xxxxxx.c`。打开看顶部 banner。',
      observe: '文件 ~5KB 文本。顶部 banner 列出 6 槽位摘要 + verdict + COP + 收敛时间 + 待修复 fault 列表。下方 #define MOTOR_POLE_PAIRS / MOTOR_LD_H / MOTOR_FLUX_WB 等已用真机参数填好。按当前 inverter.mcuPartNo（STM32 / Renesas RX / TI C2000）切换风格：STM32 给 HAL_Init + TIM1 + ADC1_2_IRQHandler；Renesas 给 R_BSP_PowerOn + MTU3 + INT_Excep_PERIB_INTB128；TI 给 InitSysCtrl + EPwm + adca1_isr。',
      whyMatters: '这是仿真到真机迁移的桥梁。把这文件丢进 STM32CubeIDE / e² Studio / Code Composer Studio 工程，补 TODO 填实，就能跑——通常省 1-2 天搭项目时间。',
    },
  ],
  pitfalls: [
    {
      id: 'ignore-warns',
      label: '试错：所有 warn 都不修',
      symptom: 'verdict 显示"通过·有告警"，看似 OK 但量产到工厂台架就会被卡',
      why: 'warn 不阻断单次仿真 verdict，但累积起来可能让设计余量为零。比如"加速斜坡接近液气分离器上限 warn" + "Iq 占额定 85% warn"两条叠加，量产环境下温度漂移 / 老化降额 / 工况波动会让某次启动直接撞 fault。出厂版应至少把 fault 全清；warn 看哪些是可接受的 trade-off。',
    },
    {
      id: 'change-many-slots',
      label: '试错：一次改 3 个 slot 再跑',
      symptom: '诊断变化了但你不知道是哪个改动起的作用',
      why: 'Diff thinking 的核心是"一次只改一个变量"。如果一次改 3 个 slot，解题路径里能看到 3 个 slot 都变了但没法知道哪个是关键。Lv.4 综合题考的就是逐项 isolate。生产中调试一台坏机器也是同理：先确认电源，再确认采样，再确认控制——一次只动一处。',
    },
    {
      id: 'overkill-vienna',
      label: '试错：家用 1HP 配 Vienna 三相 PFC',
      symptom: 'verdict 通过但成本/体积上完全不合理',
      why: 'Vienna 三相 PFC 是 3HP+ 工业级方案（需要三相 380V 电源接入），家用 1HP 单相 220V 进线根本接不上 Vienna。仿真不能识别这个工程约束——但实际选型时 Vienna 配 1HP 是个典型外行错误。这也是为什么"仿真通过 ≠ 量产可行"——总有些"工程性约束"在仿真之外。',
    },
    {
      id: 'export-skip-todo',
      label: '试错：导出 .c 后直接编译不填 TODO',
      symptom: '编译失败 / 编译过但代码空跑无效果',
      why: '导出的是骨架，不是完整工程：HAL 配置 / 中断回调 / 慢任务循环里的"TODO"标记都是你要自己填的。骨架的价值在"参数都填好 + 调用顺序对 + ISR 名对"，让你不用从零设置 STM32CubeMX——但中间的工业实现仍需要你来写。',
    },
  ],
  nextModuleHook: '至此 17 个模块全部学完。继续：(1) 11 道挑战刷个全勤 +1 个 trophy，(2) 把导出的 main.c 丢进真机调试，(3) 回到任意核心模块（如 13 HFI 无感 / 11 弱磁）按工作台诊断的 hintModule 指引深挖。',
};
