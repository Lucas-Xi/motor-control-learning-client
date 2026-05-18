import type { TranslationDict, TranslationEntry } from './types';

/**
 * 翻译表。按 namespace 组织：
 *  - common：通用按钮 / 状态文案（确定 / 取消 / 加载中 / 切换语言等）
 *  - shell：壳层（Sidebar / TopBar / ParameterPanel / WaveformPanel / ConceptNotes / KeyHelpOverlay）
 *  - curriculum：CurriculumPanel
 *  - parameters：ParameterPanel 重复出现的 chip / slot 文案
 *  - faults：故障类型简短中英标签
 *  - motorBasics：01 电机基础模块（标题 / 卡片 / 提示）
 *  - threePhase / clarkeTransform / parkTransform / pidControl / svpwm / inverter /
 *    controlLoops / sensorlessFoc / hfiSensorless / weakField / faultsDebugging /
 *    startupStateMachine / apfFrontend / assemblyWorkshop：本轮新增 14 个模块的标题 /
 *    卡片 eyebrow / 按钮 / 关键提示双语 key（ConceptNotes 长讲义仍保留中文）。
 *  - focFlow：06 FOC 总流程模块（pipeline 节点名 / 调参建议 / 切换）
 *  - refrigerationBench：16 制冷台架模块（标题 / 卡片 / SystemSchematic 标签 / BenchKpiStrip）
 *  - guidedLab：GuidedExperimentBar 共享标签（Guided Lab / 操作 / 观察 / 预期 / 加载本步参数 / 收起 / 展开）
 *
 * 维护原则：
 *  - 翻译值不掺中英混排（除非是术语缩写如 PMSM / SVPWM / Iq）。
 *  - 英文值禁止出现中文字符（单测会校验）。
 *  - 新增 key 必须同时填两种语言；缺一即 TS 类型报错（TranslationEntry 强制 'zh-CN' + 'en-US'）。
 */
function e(zh: string, en: string): TranslationEntry {
  return { 'zh-CN': zh, 'en-US': en };
}

export const translations = {
  common: {
    yes: e('是', 'Yes'),
    no: e('否', 'No'),
    on: e('开', 'On'),
    off: e('关', 'Off'),
    reset: e('重置', 'Reset'),
    apply: e('应用', 'Apply'),
    cancel: e('取消', 'Cancel'),
    confirm: e('确认', 'Confirm'),
    open: e('打开', 'Open'),
    close: e('关闭', 'Close'),
    expand: e('展开', 'Expand'),
    collapse: e('收起', 'Collapse'),
    loading: e('加载中…', 'Loading…'),
    translationPending: e('（中文版） · English translation pending', '(Chinese only) · English translation pending'),
    language: e('语言', 'Language'),
    switchToEnglish: e('切换到英文', 'Switch to English'),
    switchToChinese: e('切换到中文', 'Switch to Chinese'),
    languageChip: e('中', 'EN'),
  },

  shell: {
    brandEyebrow: e('Compressor Drive Lab', 'Compressor Drive Lab'),
    brandTitle: e('压缩机变频器控制', 'Compressor VFD Control'),
    brandSubtitle: e(
      '面向空调 / 冰箱 / 工业制冷压缩机的 FOC + V/f 启动 + HFI 无感 + 弱磁交互式学习。',
      'Interactive FOC + V/f startup + HFI sensorless + field-weakening lab for HVAC, refrigerator and industrial compressors.',
    ),
    curriculumEntry: e('课程主线', 'Curriculum'),
    curriculumEntrySubtitle: e('4 条主题路径 · 自报进度 + 证书', '4 themed tracks · self-paced progress + certificate'),
    curriculumOpen: e('打开课程主线总览', 'Open curriculum overview'),
    curriculumBack: e('回到当前模块视图', 'Back to module view'),
    runStateRun: e('RUN', 'RUN'),
    runStateHold: e('HOLD', 'HOLD'),
    modeTeach: e('教学', 'Teach'),
    modeLab: e('实验', 'Lab'),
    actionRun: e('运行', 'Run'),
    actionPause: e('暂停', 'Pause'),
    actionStep: e('单步 5ms', 'Step 5ms'),
    actionResetTime: e('归零', 'Reset clock'),
    actionFullscreen: e('全屏', 'Fullscreen'),
    paramPanelEyebrow: e('Control Rack', 'Control Rack'),
    paramPanelTitle: e('参数控制台', 'Parameter Console'),
    paramTabParams: e('参数', 'Parameters'),
    paramTabPresets: e('案例', 'Presets'),
    paramReset: e('重置', 'Reset'),
    presetCardTitle: e('内置实验案例', 'Built-in Experiments'),
    presetCardEyebrow: e('preset experiments', 'preset experiments'),
    waveformCardTitle: e('底部波形观察区', 'Waveform Scope'),
    waveformCardEyebrow: e('Scope Dock', 'Scope Dock'),
    waveformExpand: e('展开', 'Expand'),
    waveformCollapse: e('收起', 'Collapse'),
    waveformExpandAria: e('展开波形面板', 'Expand waveform panel'),
    waveformCollapseAria: e('收起波形面板', 'Collapse waveform panel'),
    conceptEyebrow: e('Lesson Notes', 'Lesson Notes'),
    conceptTitle: e('教学讲义', 'Lesson Notes'),
    conceptTabIntro: e('初识', 'Intro'),
    conceptTabDeep: e('深入', 'Deep Dive'),
    conceptTabPractice: e('上机', 'Hands-on'),
    conceptTabQuiz: e('题目', 'Quiz'),
    keyHelpEyebrow: e('Keyboard', 'Keyboard'),
    keyHelpTitle: e('键盘快捷键', 'Keyboard Shortcuts'),
    keyHelpHint: e('按 Esc 或点击空白关闭', 'Press Esc or click outside to close'),
    keyHelpCatRun: e('运行控制', 'Run Control'),
    keyHelpCatNav: e('导航', 'Navigation'),
    keyHelpCatLayout: e('布局', 'Layout'),
    keyHelpCatMode: e('模式', 'Mode'),
    keyHelpCatHelp: e('帮助', 'Help'),
    keyHelpKeySpace: e('空格', 'Space'),
  },

  curriculum: {
    eyebrow: e('Curriculum Tracks', 'Curriculum Tracks'),
    title: e('课程主线', 'Curriculum Tracks'),
    description: e(
      '把 16 个模块串成 4 条主题路径，按学习目标推进。每个 checkpoint 完成后勾选打钩，走完整条可导出 SVG 学习证书。',
      'Sixteen modules organized into four themed tracks. Tick checkpoints as you complete them; finishing a track exports an SVG learning certificate.',
    ),
    resetProgress: e('重置进度', 'Reset progress'),
    exportCertificate: e('导出学习证书', 'Export certificate'),
    completionLabel: e('完成度', 'Completion'),
    nextStep: e('下一步：', 'Next: '),
    goNow: e('立即前往', 'Go now'),
    pathDone: e('整条路径已完成 · 可导出证书', 'Track complete · certificate available'),
  },

  parameters: {
    chipBalanced: e('平衡三相', 'Balanced three-phase'),
    chipManualAbc: e('手动 Ia/Ib/Ic', 'Manual Ia/Ib/Ic'),
    chipAntiWindupOn: e('抗积分饱和 开', 'Anti-windup On'),
    chipAntiWindupOff: e('抗积分饱和 关', 'Anti-windup Off'),
    chipSlowResponse: e('慢响应', 'Slow response'),
    chipOscillation: e('振荡', 'Oscillation'),
    refrigerantTitle: e('制冷剂选择：', 'Refrigerant:'),
    closedLoopTitle: e('FOC 闭环耦合', 'FOC closed-loop coupling'),
    closedLoopHint: e(
      '开启后，循环算出的负载扭矩会反映成 FOC 模块所需的 Iq 给定，让"系统侧"和"电机侧"互相印证。',
      'When enabled, the load torque from the cycle becomes the FOC Iq reference, cross-validating system-side and motor-side.',
    ),
    closedLoopEnabled: e('已启用闭环', 'Closed-loop enabled'),
    closedLoopEnable: e('启用闭环', 'Enable closed loop'),
    motorPresetsHint: e('常见压缩机 IPM 电机预设：', 'Typical compressor IPM motor presets:'),
    motorPresetHvac: e('空调压缩机', 'HVAC compressor'),
    motorPresetFridge: e('冰箱压缩机', 'Refrigerator compressor'),
    motorPresetIndustrial: e('工业制冷', 'Industrial refrigeration'),
  },

  faults: {
    overCurrent: e('过流', 'Over-current'),
    phaseLoss: e('缺相', 'Phase loss'),
    currentOffset: e('采样偏置', 'Sampling offset'),
    phaseOrder: e('相序错误', 'Phase order error'),
    encoderAngle: e('角度错误', 'Angle error'),
    speedOscillation: e('速度振荡', 'Speed oscillation'),
    voltageSaturation: e('电压饱和', 'Voltage saturation'),
    startupFail: e('启动失败', 'Startup failure'),
    liquidSlugging: e('液击', 'Liquid slugging'),
    lockedRotor: e('堵转', 'Locked rotor'),
    dcUndervolt: e('母线欠压', 'DC undervoltage'),
    overTemp: e('过温', 'Over-temperature'),
    vibration: e('振动超限', 'Vibration over limit'),
    oilLow: e('油位告警', 'Low oil alarm'),
  },

  motorBasics: {
    title: e('径向剖面电机解剖图', 'Radial cross-section motor anatomy'),
    eyebrow: e('stator / rotor / magnets', 'stator / rotor / magnets'),
    view2D: e('2D 剖面', '2D cross-section'),
    view3D: e('3D 立体', '3D view'),
    viewSwitchAria: e('解剖图视图切换', 'Anatomy view switch'),
    angleCardTitle: e('机械角度 vs 电角度', 'Mechanical vs electrical angle'),
    angleCardEyebrow: e('angle relation', 'angle relation'),
    angleMechanical: e('θm 机械', 'θm mechanical'),
    angleElectrical: e('θe 电角度', 'θe electrical'),
    keyParamsTitle: e('关键参数', 'Key parameters'),
    keyParamsEyebrow: e('motor parameters', 'motor parameters'),
    note2D: e(
      'PMSM 顶视剖面：外圈定子铁芯 + 12 槽 A / B / C 三相绕组（⊙ / ⊗ 表示电流进出），中间转子贴交替 N / S 永磁体。滑动机械角度看转子旋转；改极对数磁极数翻倍但槽不变。',
      'PMSM top cross-section: outer stator with 12 slots holding A / B / C windings (⊙ / ⊗ indicate current direction), rotor with alternating N / S permanent magnets. Slide the mechanical angle to see rotation; changing pole pairs multiplies magnet count but keeps the slot count.',
    ),
    note3D: e(
      '立体视图：定子 A 青 / B 绿 / C 黄三相绕组与转子 N 红 / S 蓝磁极相对位置，中央 mint 箭头是三相合成的旋转磁通矢量。鼠标拖动旋转视角。',
      '3D view: stator windings A (cyan) / B (green) / C (amber) versus rotor poles N (red) / S (blue). The central mint arrow is the three-phase resultant flux vector. Drag to rotate.',
    ),
    rotorLoading: e('正在加载 3D 视图…', 'Loading 3D view…'),
    statorMagnet: e('定子绕组产生旋转磁场，转子永磁体提供磁链。', 'Stator windings generate the rotating field; rotor magnets provide the flux linkage.'),
    polePairLabel: e('极对数越多，同样转速电频率越高，FOC 中断压力也越高。', 'More pole pairs raise the electrical frequency at the same speed, increasing FOC interrupt load.'),
    ratedTorqueLabel: e('额定转矩 ≈ Kt × I', 'Rated torque ≈ Kt × I'),
    polePairsCycle: e('转子机械转 1 圈，电角度转', 'For each mechanical revolution, the electrical angle rotates'),
    polePairsCycleSuffix: e('圈，电频率', 'cycles; electrical frequency ='),
  },

  focFlow: {
    moduleEyebrow: e('αβ stationary · dq rotating', 'αβ stationary · dq rotating'),
    title3D: e('3D 矢量空间', '3D vector space'),
    toggleOn3D: e('已开启 3D', '3D enabled'),
    toggleOff3D: e('开启 3D', 'Enable 3D'),
    note3D: e(
      'mint 箭头是 αβ 静止平面上的合成电流矢量，下方旋转的 mint / 粉色十字是 dq 坐标轴。把 dq 轴对准合成矢量时 Iq 最大、Id≈0，正是 id=0 控制要做的事。',
      'The mint arrow is the resultant current vector on the αβ stationary plane; the rotating mint / pink cross is the dq axes. Aligning dq with the resultant maximises Iq and drives Id to zero — exactly what id=0 control does.',
    ),
    loadingScene: e('正在加载 3D 矢量空间…', 'Loading 3D vector space…'),
    pipelineEyebrow: e('pwm interrupt pipeline', 'pwm interrupt pipeline'),
    pipelineTitle: e('单周期 FOC 数据流', 'Single-cycle FOC dataflow'),
    pipelineHint: e('点击步骤可锁定探针；运行态自动流动', 'Click any step to lock the probe; auto-flows during run'),
    pipelineUnlock: e('恢复跟随', 'Resume follow'),
    loopTitle: e('电流环阶跃响应', 'Current-loop step response'),
    loopEyebrow: e('closed-loop tracking', 'closed-loop tracking'),
    loopHint: e(
      '给电流环一个 Iq 阶跃指令，观察实际 Iq 跟踪、Id 串扰、超调与稳态误差。',
      'Apply an Iq step command and observe Iq tracking, Id cross-coupling, overshoot and steady-state error.',
    ),
    probeTitle: e('当前步骤探针', 'Current step probe'),
    probeEyebrow: e('input / output', 'input / output'),
    probeInput: e('输入', 'Input'),
    probeOutput: e('输出', 'Output'),
    vectorCardTitle: e('αβ / dq 矢量', 'αβ / dq vectors'),
    vectorCardEyebrow: e('vector state', 'vector state'),
    vectorSnapshotTitle: e('αβ / dq 矢量（瞬态快照）', 'αβ / dq vectors (snapshot)'),
    vectorSnapshotEyebrow: e('snapshot', 'snapshot'),
    svpwmOutTitle: e('SVPWM 输出', 'SVPWM output'),
    svpwmOutEyebrow: e('duty', 'duty'),
    svpwmSummary: e('扇区', 'Sector'),
    inverterTitle: e('逆变器桥臂', 'Inverter bridge'),
    inverterEyebrow: e('power stage', 'power stage'),
    tabLoop: e('电流环响应', 'Current-loop response'),
    tabPipeline: e('数据流水线', 'Data pipeline'),
    tuningTitle: e('调参建议', 'Tuning hints'),
    tuningEyebrow: e('tuning hints', 'tuning hints'),
    tipKpLow: e('Kp 太低：上升时间长，Iq 慢慢爬。', 'Kp too low: long rise time, Iq creeps up.'),
    tipKpHigh: e('Kp 太高：超调或振荡，电流环放大采样延迟。', 'Kp too high: overshoot or oscillation; the current loop amplifies sampling delay.'),
    tipKiLow: e('Ki 太低：稳态误差消除慢；Ki 太高则可能撞限幅形成积分饱和。', 'Ki too low: slow to eliminate steady-state error; too high risks integrator wind-up against the limit.'),
    tipThetaErr: e('Δθ ≠ 0：Iq 阶跃会拉到 Id 上形成串扰，电流相位偏离 q 轴。', 'Δθ ≠ 0: Iq step bleeds into Id, the current vector drifts off the q axis.'),
    tipOmegaHigh: e('ω 大：dq 之间交叉耦合强（vd 含 -ωLq·iq），需要解耦前馈。', 'High ω: strong dq cross-coupling (vd has -ωLq·iq); feed-forward decoupling helps.'),
    tipDelay: e('采样延迟多：等效相位滞后，相同 Kp 更易振荡。', 'More sampling delay: equivalent phase lag, same Kp is more prone to oscillation.'),
    stepClark: e('Clarke 变换', 'Clarke transform'),
    stepPark: e('Park 变换', 'Park transform'),
    stepPi: e('PI 调节', 'PI regulation'),
    stepInversePark: e('反 Park 变换', 'Inverse Park'),
    stepSvpwm: e('SVPWM 调制', 'SVPWM modulation'),
    stepPwm: e('PWM 输出', 'PWM output'),
  },

  refrigerationBench: {
    phTitle: e('P-h 焓压图：蒸气压缩循环', 'P-h diagram: vapour compression cycle'),
    phEyebrow: e('pressure-enthalpy diagram', 'pressure-enthalpy diagram'),
    schematicTitle: e('制冷系统管路', 'Refrigeration system schematic'),
    schematicEyebrow: e('system schematic', 'system schematic'),
    metricsTitle: e('工况实测面板', 'Working-condition readouts'),
    metricsEyebrow: e('bench instruments', 'bench instruments'),
    motorCouplingTitle: e('电机侧需求（系统↔电机闭环）', 'Motor-side demand (system ↔ motor loop)'),
    motorCouplingEyebrow: e('motor coupling', 'motor coupling'),
    scenariosTitle: e('工况场景', 'Operating scenarios'),
    scenariosEyebrow: e('quick scenarios', 'quick scenarios'),
    scenariosHint: e('一键载入典型测试工况，配合下方台架记录器可即时观察过渡过程：', 'Load typical operating conditions in one click; pair with the bench recorder to observe transitions:'),

    // KPI Strip
    kpiCop: e('COP', 'COP'),
    kpiTdischarge: e('排气温度', 'Discharge temp'),
    kpiCapacity: e('制冷量', 'Cooling capacity'),
    kpiIqRequired: e('所需 Iq', 'Required Iq'),
    statusGood: e('正常', 'Normal'),
    statusWarn: e('警戒', 'Warning'),
    statusBad: e('超限', 'Over limit'),
    hintCopHigh: e('高效区', 'High-efficiency'),
    hintCopMid: e('一般', 'Average'),
    hintCopLow: e('低效', 'Low'),
    hintTdHigh: e('超限保护', 'Over-limit'),
    hintTdMid: e('接近警戒', 'Approaching limit'),
    hintTdOk: e('正常', 'Normal'),
    hintCapAmple: e('充足', 'Ample'),
    hintCapLow: e('偏低', 'Below target'),
    hintCapMin: e('不足', 'Insufficient'),
    hintIqOver: e('超额定', 'Over rated'),
    hintIqRatedSuffix: e('额定', 'of rated'),

    // System schematic labels
    schOutdoor: e('室外环境', 'Outdoor'),
    schIndoor: e('室内环境', 'Indoor'),
    schCompressor: e('压缩机', 'Compressor'),
    schCompressorSub: e('FOC 驱动 IPM 电机', 'FOC-driven IPM motor'),
    schCondenser: e('冷凝器', 'Condenser'),
    schCondenserSub: e('高压气 → 高压液 (放热)', 'High-P gas → high-P liquid (heat rejection)'),
    schCondenserFan: e('→ 风扇排热到', '→ Fan rejects heat to'),
    schEvaporator: e('蒸发器', 'Evaporator'),
    schEvaporatorSub: e('低压液 → 低压气 (吸热)', 'Low-P liquid → low-P gas (heat absorption)'),
    schEvaporatorFan: e('风扇吸热自', 'Fan absorbs heat from'),
    schEev: e('膨胀阀', 'Expansion valve'),
    schEevSub: e('节流降压', 'Throttle / pressure drop'),

    // P-h state nodes
    phState1: e('吸气', 'Suction'),
    phState2: e('排气', 'Discharge'),
    phState3: e('冷凝出口', 'Condenser out'),
    phState4: e('蒸发进口', 'Evaporator in'),
    capacity: e('制冷量', 'Cooling capacity'),
    inputPower: e('输入功率', 'Input power'),
    cop: e('COP', 'COP'),
    massFlow: e('流量', 'Mass flow'),
    suctionPressure: e('吸气压力 P_s', 'Suction pressure P_s'),
    dischargePressure: e('排气压力 P_d', 'Discharge pressure P_d'),
    pressureRatio: e('压缩比 P_d/P_s', 'Pressure ratio P_d/P_s'),
    dischargeTemp: e('排气温度 T_d', 'Discharge temp T_d'),
    volEff: e('容积效率 η_v', 'Volumetric eff η_v'),
    specWork: e('单位功 w', 'Specific work w'),
    loadTorque: e('负载扭矩 τ_load', 'Load torque τ_load'),
    requiredIq: e('所需 Iq', 'Required Iq'),
    percentOfRated: e('占额定电流', '% of rated current'),
    closedLoopOn: e(
      '闭环已开启：FOC 模块的 Iq 给定会被自动设为上述值。可切到 06 号 FOC 总流程模块验证。',
      'Closed loop enabled: the FOC module Iq reference is set automatically. Verify in the FOC flow module (06).',
    ),
    closedLoopOffPrefix: e('闭环未开启。当前 FOC iqRef=', 'Closed loop off. Current FOC iqRef='),
    closedLoopOffInfix: e('A，与系统侧需求', 'A, while system-side demand is'),
    closedLoopOffSuffix: e('A 不联动。', 'A — not linked.'),

    // Scenario presets
    sceneSummerTypical: e('夏季典型', 'Summer typical'),
    sceneSummerHot: e('夏季高温', 'Summer hot'),
    sceneExtreme: e('极限工况', 'Extreme condition'),
    sceneDehumidify: e('除湿模式', 'Dehumidify'),
    sceneCommFrozen: e('商用冷冻', 'Commercial freezer'),
    sceneSlug: e('液击边缘', 'Liquid-slug edge'),

    // Cards lazy loading
    seasonalCop: e('季节性 COP', 'Seasonal COP'),
    defrost: e('化霜循环', 'Defrost cycle'),
    partLoad: e('部分负载效率', 'Part-load efficiency'),
    quadrant: e('四象限工作点', 'Four-quadrant operating point'),
  },

  // === 02 三相磁场 ===
  threePhase: {
    primaryTitle: e('三相定子截面与合成磁场', 'Three-phase stator cross-section and resultant field'),
    primaryEyebrow: e('stator cross-section', 'stator cross-section'),
    primaryNote: e(
      'A / B / C 三相绕组放在 120° 等分位置；圆点 ⊙ 表示电流流出纸面，⊗ 流入；亮度对应 |I|。中心绿色箭头是三相电流合成的旋转磁场矢量；尾巴的浅绿点是它走过的轨迹。',
      'A / B / C three-phase windings are spaced 120° apart; ⊙ marks current flowing out of the page, ⊗ into the page; brightness scales with |I|. The green arrow at the centre is the resultant rotating field, with a fading trail.',
    ),
    alphaBetaTitle: e('αβ 静止坐标矢量', 'αβ stationary-frame vector'),
    alphaBetaEyebrow: e('clarke output', 'clarke output'),
    vectorPlaneHint: e('拖白点直接改 αβ', 'Drag the dot to change αβ'),
    alphaBetaNote: e(
      'Clarke 把 abc 三相投影成 (α, β)。运行时这个箭头与左侧定子箭头方向一致，但坐标系是静止的——观察它如何沿单位圆旋转。',
      'Clarke maps the abc currents to (α, β). At runtime this arrow shares the same direction as the stator arrow on the left, but the axes stay stationary — watch it sweep around the unit circle.',
    ),
    fidelityHint: e(
      '三相 sin 生成 + Clarke 投影是精确数学，幅值/相位/谐波/不平衡都按公式注入',
      'Three-phase sinusoid generation + Clarke projection is exact math; amplitude / phase / harmonics / imbalance are injected by formula.',
    ),
  },

  // === 03 Clarke 变换 ===
  clarkeTransform: {
    primaryTitle: e('αβ 矢量平面', 'αβ vector plane'),
    primaryEyebrow: e('clarke output', 'clarke output'),
    vectorPlaneHint: e('拖拽白点直接改变 αβ', 'Drag the dot to change αβ'),
    fidelityHint: e('Clarke 是精确矩阵变换，输出与教科书一致', 'Clarke is an exact matrix transform — output matches textbook.'),
    abcTitle: e('abc 三相输入', 'abc three-phase input'),
    abcEyebrow: e('phase currents', 'phase currents'),
    matrixTitle: e('变换矩阵', 'Transform matrix'),
    matrixEyebrow: e('abc → αβ0', 'abc → αβ0'),
  },

  // === 04 Park 变换 ===
  parkTransform: {
    primaryNote: e(
      '转子带 N/S 极，d 轴沿 N 极方向（绿）、q 轴领先 90°（红）；蓝色箭头是 αβ 静止坐标里的电流矢量。Park 把它分别投影到 d 轴 → Id（绿色实线段）和 q 轴 → Iq（红色实线段）。当 θ 跟住转子时，两个分量都是直流量。',
      'The rotor carries N/S poles; the d axis points along N (green), the q axis leads by 90° (red). The blue arrow is the current vector in the αβ frame. Park projects it onto d → Id (green segment) and q → Iq (red segment). When θ tracks the rotor, both components are DC.',
    ),
    fidelityHint: e('Park 是精确旋转矩阵变换 Id/Iq 来自数学公式', 'Park is an exact rotation; Id/Iq come straight from the formula.'),
    projectionTitle: e('αβ → dq 数学投影', 'αβ → dq projection'),
    projectionEyebrow: e('park projection', 'park projection'),
    vectorPlaneHint: e('拖白点改 αβ', 'Drag the dot to change αβ'),
    projectionNote: e(
      '这边和左边是同一组数据的另一种画法：保留 αβ 网格不动，叠加旋转的 d/q 轴。',
      'This is the same data drawn differently: keep the αβ grid fixed and overlay the rotating d/q axes.',
    ),
    labelIdFlux: e('Id 磁链', 'Id (flux)'),
    labelIqTorque: e('Iq 转矩', 'Iq (torque)'),
  },

  // === 05 PID 控制 ===
  pidControl: {
    primaryTitle: e('PID 阶跃响应', 'PID step response'),
    primaryEyebrow: e('closed loop step', 'closed loop step'),
    primaryFidelityHint: e(
      '一阶被控对象 + 离散 PI + 限幅 + 抗积分饱和，对应真实电流环动力学',
      'First-order plant + discrete PI + clamp + anti-windup — matches a real current-loop dynamic.',
    ),
    metricsTitle: e('响应指标', 'Step metrics'),
    metricsEyebrow: e('step metrics', 'step metrics'),
    metricOvershoot: e('超调量', 'Overshoot'),
    metricRise: e('上升时间', 'Rise time'),
    metricSteadyError: e('稳态误差', 'Steady error'),
    metricFinalOutput: e('最终输出', 'Final output'),
    tuningTitle: e('调参提示', 'Tuning hints'),
    tuningEyebrow: e('tuning hints', 'tuning hints'),
    tuningKpHint: e(
      'Kp 增大响应更快，但放大模型误差，表现为超调或啸叫。',
      'Larger Kp speeds up the response but amplifies modelling errors — overshoot or audible squeal.',
    ),
    tuningKiHint: e(
      'Ki 消除稳态误差；输出限幅时不开抗积分饱和会形成大超调。',
      'Ki removes steady-state error; without anti-windup, a saturated output produces a big overshoot.',
    ),
    tuningSampleHint: e(
      '采样周期 改变 Ki/Kd 实际作用。STM32 上电流环跟 PWM 同频。',
      'Sample period shifts the effective Ki/Kd. On STM32 the current loop runs at the PWM rate.',
    ),
    tuningRiskHint: e(
      '超调或稳态误差偏大：先降低目标值与限流，再逐步提高增益。',
      'Big overshoot or residual error: lower the target and current limit first, then raise the gains step by step.',
    ),
    labelKp: e('Kp', 'Kp'),
    labelKi: e('Ki', 'Ki'),
    labelSamplePeriod: e('采样周期', 'Sample period'),
  },

  // === 07 SVPWM ===
  svpwm: {
    fidelityHint: e('扇区判断 + T1/T2/T0 时间分配 + 占空比都是精确算法', 'Sector lookup + T1/T2/T0 timing + duty cycles are exact.'),
    timingTitle: e('T1 / T2 / T0 时间分配', 'T1 / T2 / T0 timing breakdown'),
    timingEyebrow: e('switching period', 'switching period'),
    t1Label: e('T1 第一矢量', 'T1 (first vector)'),
    t2Label: e('T2 第二矢量', 'T2 (second vector)'),
    t0Label: e('T0 零矢量', 'T0 (zero vector)'),
    sectorLabel: e('扇区', 'Sector'),
    modulationLabel: e('m', 'm'),
    svpwmUtilLabel: e('SVPWM 利用率', 'SVPWM utilisation'),
    spwmLabel: e('SPWM', 'SPWM'),
    dutyTitle: e('三相 PWM 占空比', 'Three-phase PWM duty'),
    dutyEyebrow: e('duty compare', 'duty compare'),
    saturationWarn: e(
      '目标电压矢量已超 SVPWM 线性区，真实电机会出现电流环输出撞限。可提高母线、降低目标转速，或注入负 Id 进入弱磁。',
      'The voltage reference is outside the SVPWM linear range — a real motor would saturate. Raise the DC bus, lower the target speed, or inject negative Id to enter field-weakening.',
    ),
  },

  // === 08 逆变器 ===
  inverter: {
    primaryTitle: e('相电压 / 线电压波形', 'Phase / line-to-line voltage'),
    primaryEyebrow: e('phase and line voltage', 'phase and line voltage'),
    fidelityHint: e(
      '平均模型：占空比 → 相电压成立，但忽略了开关纹波；死区损失按频率近似估算',
      'Averaged model: duty → phase voltage is valid; switching ripple is omitted and dead-time loss is frequency-scaled.',
    ),
    dutyTitle: e('占空比', 'Duty cycles'),
    dutyEyebrow: e('phase duty', 'phase duty'),
    deadTimeLossLabel: e('死区损失', 'Dead-time loss'),
    checklistTitle: e('STM32 桥级 Checklist', 'STM32 bridge checklist'),
    checklistEyebrow: e('hardware checklist', 'hardware checklist'),
    checklistItem1: e(
      'TIM1/TIM8 互补 PWM + 死区 + 刹车 + 过流硬件保护。先 PWM、再母线、再电机。',
      'TIM1/TIM8 complementary PWM + dead-time + brake + hardware over-current. Bring up PWM first, then the DC bus, then the motor.',
    ),
    checklistItem2: e(
      '死区过大低速畸变啸叫；过小上下管直通风险。',
      'Too much dead-time causes low-speed distortion and squeal; too little risks shoot-through.',
    ),
    checklistItem3: e(
      '中心对齐 PWM 的 ADC 采样点放在中点，避开开关边沿。',
      'For centre-aligned PWM, sample ADC at the midpoint to avoid switching edges.',
    ),
  },

  // === 09 三闭环 ===
  controlLoops: {
    primaryTitle: e('三闭环级联响应', 'Cascaded triple-loop response'),
    primaryEyebrow: e('position → speed → current', 'position → speed → current'),
    fidelityHint: e(
      '位置/速度/电流三层级联是真实结构；电机用一阶 dq + 转矩常数 0.095 的简化模型，惯量/阻尼来自电机参数',
      'Position / speed / current cascade matches real hardware; the motor uses a first-order dq + Kt=0.095 simplified model with inertia and damping from motor params.',
    ),
    hierarchyTitle: e('三层级联', 'Loop hierarchy'),
    hierarchyEyebrow: e('loop hierarchy', 'loop hierarchy'),
    positionLoopTitle: e('位置环 PID', 'Position PID'),
    positionLoopDesc: e('最外层，输出速度参考。不能急。', 'Outermost; outputs the speed reference. Be patient.'),
    speedLoopTitle: e('速度环 PI', 'Speed PI'),
    speedLoopDesc: e('中间层，输出 Iq 参考。比电流环慢。', 'Middle layer; outputs the Iq reference. Slower than the current loop.'),
    currentLoopTitle: e('电流环 PI', 'Current PI'),
    currentLoopDesc: e('最内层，与 PWM 同频，是稳定地基。', 'Innermost; runs at PWM rate — the foundation of stability.'),
    finalStateTitle: e('末态指标', 'Final-state metrics'),
    finalStateEyebrow: e('final state', 'final state'),
    positionLabel: e('位置', 'Position'),
    speedLabel: e('速度', 'Speed'),
    iqLabel: e('Iq', 'Iq'),
    torqueLabel: e('转矩', 'Torque'),
    targetPositionLabel: e('目标位置', 'Target position'),
    iqRefLabel: e('Iq参考', 'Iq ref'),
    oscWarn: e(
      '外环增益偏大，可能振荡。整定顺序：电流 → 速度 → 位置；每层都要比内层慢。',
      'Outer-loop gains too high — risk of oscillation. Tune current → speed → position; each outer loop must be slower than the inner.',
    ),
  },

  // === 10 无感 FOC (SMO) ===
  sensorlessFoc: {
    primaryTitle: e('SMO 滑模观测器跟踪', 'SMO sliding-mode observer tracking'),
    primaryEyebrow: e('sliding mode observer', 'sliding mode observer'),
    fidelityHint: e(
      '真实滑模观测器：开关函数 + 边界层 sat + 等效控制 LPF + atan2 + PLL 修正',
      'Real SMO: switching function + boundary-layer sat + equivalent-control LPF + atan2 + PLL correction.',
    ),
    statusLost: e('失锁风险（建议切 HFI）', 'Lock-loss risk (switch to HFI)'),
    statusLocked: e('SMO 锁相中', 'SMO locked'),
    statusMargin: e('SMO 误差临界', 'SMO error marginal'),
    peakErrorPrefix: e('峰值误差', 'Peak error'),
    lockThresholdLabel: e('失锁阈值 ±10°', 'Lock-loss threshold ±10°'),
    legendTrueTheta: e('真实 θe', 'True θe'),
    legendSmoEst: e('SMO+PLL 估算', 'SMO+PLL estimate'),
    legendErrorDeg: e('误差 °', 'Error (°)'),
    primaryFootnoteLow: e('< 500rpm 应切 HFI 模块（13）做低速无感', 'Below 500 rpm switch to HFI (module 13) for low-speed sensorless'),
    primaryFootnoteGood: e('BEMF 信号充足，SMO 锁相稳定', 'BEMF amplitude is sufficient; SMO stays locked'),
    diagnosticTitle: e('观测器诊断', 'Observer diagnostics'),
    diagnosticEyebrow: e('observer readiness', 'observer readiness'),
    diagnosticLowSpeedWarn: e(
      '低速 SMO 失效区——压缩机此时应切 HFI（模块 13）做低速无感。',
      'Low-speed SMO blind zone — compressor controllers should switch to HFI (module 13).',
    ),
    internalsTitle: e('SMO 内部信号', 'SMO internal signals'),
    internalsEyebrow: e('switch surface & equivalent control', 'switch surface & equivalent control'),
    internalsNote: e(
      '开关面 |i_est − i_meas| 应快速收敛到边界层内（接近 0），随后等效控制 z_α/z_β 经低通就是 BEMF 估算。SMO 增益过大 → 抖振 → 角度噪声；增益过小 → 收敛慢。',
      'The switching surface |i_est − i_meas| should converge inside the boundary layer (close to zero); the LPF of z_α/z_β then yields the BEMF estimate. Too much SMO gain causes chatter and angle noise; too little is slow to converge.',
    ),
  },

  // === 11 弱磁 ===
  weakField: {
    primaryTitle: e('Id / Iq 限制地图', 'Id / Iq limit map'),
    primaryEyebrow: e('current and voltage limit', 'current and voltage limit'),
    fidelityHint: e(
      '电压/电流极限圆来自 PMSM 稳态 dq 方程；瞬态切换过程未仿真',
      'Voltage / current limit loci come from the steady-state PMSM dq equations; transient switching is not simulated.',
    ),
    labelIdPlus: e('Id +', 'Id +'),
    labelIdMinusWeak: e('Id − (弱磁)', 'Id − (field-weakening)'),
    labelIq: e('Iq', 'Iq'),
    labelWeakDir: e('弱磁方向', 'Field-weakening direction'),
    labelCurrentCircle: e('电流极限圆 |I|≤', 'Current limit circle |I|≤'),
    labelVoltageEllipse: e('电压极限椭圆 (ω↑→变小)', 'Voltage limit ellipse (shrinks as ω↑)'),
    labelVoltageSaturated: e('电压饱和', 'Voltage saturated'),
    labelSafePoint: e('安全工作点', 'Safe operating point'),
    torqueTrendTitle: e('转矩 / 功率趋势', 'Torque / power envelope'),
    torqueTrendEyebrow: e('constant torque / power', 'constant torque / power'),
    torqueLabel: e('转矩 Nm', 'Torque (Nm)'),
    powerLabel: e('功率 kW', 'Power (kW)'),
    metricTorque: e('转矩', 'Torque'),
    metricReserve: e('余量', 'Voltage margin'),
    metricSuggestedId: e('建议 Id', 'Suggested Id'),
    saturatedHint: e(
      '当前进入电压饱和：Vdq 超过 SVPWM 线性区。可降低 Iq、提高母线，或注入更合适的负 Id。',
      'Voltage saturated: Vdq exceeds the SVPWM linear range. Lower Iq, raise the DC bus, or inject a more negative Id.',
    ),
  },

  // === 12 故障调试 ===
  faultsDebugging: {
    statusOnlyEyebrow: e('status-only fault', 'status-only fault'),
    statusOnlyFidelityHint: e(
      '此类故障由传感器/开关上报，不在电流或转速上留下可视特征',
      'These faults come from sensors / digital switches and leave no visible signature on current or speed.',
    ),
    statusOnlyDescTop: e(
      '该故障属于压力 / 油位 / 温度等独立传感通道触发的状态位告警，',
      'This fault is a status-bit alarm raised by an independent sensor (pressure / oil / temperature),',
    ),
    statusOnlyDescBottom: e(
      '主回路电流与转速在告警瞬间通常仍处于额定运行，不会出现可视电气波形特征。',
      'main-circuit currents and speed are usually still at rated values when the alarm fires — no visible electrical waveform clue.',
    ),
    statusOnlyAdvice: e(
      '排查应直接查 GPIO 输入电平、I²C 传感器寄存器或 CAN 总线告警字段，而不是看示波器。',
      'Check the GPIO level, I²C sensor register or CAN alarm field directly — the oscilloscope will not help.',
    ),
    waveformEyebrow: e('fault waveform signature', 'fault waveform signature'),
    waveformFidelityHint: e(
      '按故障类型合成的特征示意：方向与真实物理一致，幅值/时刻为教学缩放',
      'Synthesised signature per fault type: direction matches real physics; magnitudes and timing are scaled for teaching.',
    ),
    titleSuffixStatus: e('状态位告警', 'Status-only alarm'),
    titleSuffixWave: e('波形表现', 'Waveform signature'),
    phenomenonTitle: e('故障现象', 'Symptom'),
    phenomenonEyebrow: e('symptom', 'symptom'),
    stm32MapTitle: e('STM32 对应关系', 'STM32 mapping'),
    stm32MapEyebrow: e('hardware mapping', 'hardware mapping'),
    causesTitle: e('可能原因', 'Likely causes'),
    stepsTitle: e('排查步骤', 'Diagnostic steps'),
    fixTitle: e('解决建议', 'Suggested fix'),
  },

  // === 13 HFI 无感 ===
  hfiSensorless: {
    primaryTitle: e('HFI 解调与角度跟踪', 'HFI demodulation and angle tracking'),
    primaryEyebrow: e('high-frequency injection', 'high-frequency injection'),
    fidelityHint: e(
      '高频注入 + 凸极响应解调 + PLL 锁相，simplifed 信号模型但流程真实',
      'High-frequency injection + saliency-response demodulation + PLL lock — simplified signal model, real pipeline.',
    ),
    statusLocked: e('已锁相', 'Locked'),
    statusUnlocked: e('未锁相', 'Not locked'),
    errorChartTitle: e('角度估算误差', 'Angle estimation error'),
    errorChartEyebrow: e('estimation error', 'estimation error'),
    lockBandLabel: e('锁定 ±5°', 'Lock band ±5°'),
    injectChartTitle: e('高频注入信号 + 解调', 'High-frequency injection + demodulation'),
    injectChartEyebrow: e('injection & demodulation', 'injection & demodulation'),
    legendInjectV: e('V_inject', 'V_inject'),
    legendResponseI: e('解调误差信号', 'Demodulated error'),
    keyMetricsTitle: e('HFI 关键指标', 'HFI key metrics'),
    keyMetricsEyebrow: e('key metrics', 'key metrics'),
    metricLockTime: e('锁相时间', 'Lock time'),
    metricFinalError: e('最终误差', 'Final error'),
    metricSaliencyGain: e('凸极信号增益', 'Saliency gain'),
    metricInjectFreq: e('注入频率', 'Inject freq'),
    notLocked: e('未锁定', 'Not locked'),
    whenToUseTitle: e('HFI 适用范围', 'When to use HFI'),
    whenToUseEyebrow: e('when to use', 'when to use'),
    legendTrueTheta: e('真实 θe', 'True θe'),
    legendEstTheta: e('HFI 估算', 'HFI estimate'),
  },

  // === 14 启动状态机 ===
  startupStateMachine: {
    smTitle: e('启动状态机', 'Startup state machine'),
    smEyebrow: e('state diagram', 'state diagram'),
    fidelityHint: e(
      '时序仿真：转速一阶跟踪指令；状态切换条件按典型压缩机控制器设计',
      'Timing simulation: speed follows the reference as first-order; transitions match a typical compressor controller.',
    ),
    speedChartTitle: e('转速 / 电流时序', 'Speed / current timeline'),
    speedChartEyebrow: e('rpm & current', 'rpm & current'),
    legendRpmRef: e('rpm 指令', 'rpm ref'),
    legendRpmActual: e('rpm 实际', 'rpm actual'),
    legendIqA: e('Iq A', 'Iq (A)'),
    paramsTitle: e('启动参数', 'Startup parameters'),
    paramsEyebrow: e('startup constraints', 'startup constraints'),
    paramTargetRpm: e('目标转速', 'Target rpm'),
    paramAccelRamp: e('加速斜坡', 'Accel ramp'),
    paramAlignDur: e('对齐时长', 'Align duration'),
    paramHfiHandoff: e('HFI 切入', 'HFI hand-off'),
    paramBemfHandoff: e('BEMF 切入', 'BEMF hand-off'),
    paramFieldweakRpm: e('弱磁介入', 'Field-weak entry'),
    antiSlugTitle: e('反液击保护', 'Anti-slugging protection'),
    antiSlugEyebrow: e('anti-slugging', 'anti-slugging'),
    handOffTitle: e('状态切换规则', 'Hand-off rules'),
    handOffEyebrow: e('hand-off', 'hand-off'),
  },

  // === 15 APF 前级 ===
  apfFrontend: {
    waveformTitle: e('Boost PFC 电流 / 母线波形', 'Boost PFC current / DC-bus waveform'),
    waveformEyebrow: e('pfc current shaping', 'pfc current shaping'),
    spectrumTitle: e('线电流谐波频谱', 'Line-current harmonic spectrum'),
    spectrumEyebrow: e('harmonic spectrum', 'harmonic spectrum'),
    tuningTitle: e('双环整定 / 阶跃响应', 'Dual-loop tuning / step response'),
    tuningEyebrow: e('dual loop tuning', 'dual loop tuning'),
    diagramTitle: e('双环结构图', 'Dual-loop block diagram'),
    diagramEyebrow: e('voltage outer · current inner', 'voltage outer · current inner'),
    chipPfc: e('PFC 电流', 'PFC current'),
    chipBare: e('裸整流', 'Diode rectifier'),
  },

  // === 17 整机搭建 ===
  assemblyWorkshop: {
    tabWorkshop: e('虚拟搭建', 'Virtual assembly'),
    tabSerial: e('实测对照', 'Serial bench compare'),
  },

  guidedLab: {
    eyebrow: e('Guided Lab', 'Guided Lab'),
    operationLabel: e('操作：', 'Operation: '),
    observeLabel: e('观察：', 'Observe: '),
    expectedLabel: e('预期：', 'Expected: '),
    loadPresetButton: e('加载本步参数', 'Load step preset'),
    expand: e('展开', 'Expand'),
    collapse: e('收起', 'Collapse'),
    zhFallback: e('（zh fallback）', '(zh fallback)'),
  },

  glossary: {
    panelTitle: e('术语表', 'Glossary'),
    panelEyebrow: e('terms & definitions', 'terms & definitions'),
  },
} satisfies TranslationDict;

export type Translations = typeof translations;
