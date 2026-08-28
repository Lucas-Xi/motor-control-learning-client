import { e } from '../entries';

/** charts 命名空间：共享图表组件（2D 波形 / 相量图 / 桑基图等）。 */
export const charts = {
  // --- 通用小词 ---
  colon: e('：', ': '),
  statusNormal: e('正常', 'Normal'),
  statusHigh: e('偏大', 'High'),
  statusSevere: e('严重', 'Severe'),

  // --- StartupStateGraph：启动状态机有向图 ---
  suStateIdle: e('待机', 'Idle'),
  suStatePrecharge: e('预充电', 'Precharge'),
  suStateAlign: e('对齐', 'Align'),
  suStateOpenLoop: e('V/f 开环', 'V/f open-loop'),
  suStateFieldweak: e('弱磁', 'Field-weakening'),
  suStateFault: e('故障', 'Fault'),
  suActionIdle: e('输出关 / 等待使能', 'Output off / waiting for enable'),
  suActionPrecharge: e('限流给母线电容缓充 ~200ms', 'Current-limited precharge of DC-bus caps ~200ms'),
  suActionAlign: e('d 轴注入直流 1A 持续 800ms', 'DC 1A injection on d-axis for 800ms'),
  suActionOpenLoop: e('V/f 强制斜坡升速到 ~100rpm', 'V/f forced ramp up to ~100rpm'),
  suActionHfi: e('高频注入解调出转子角度', 'Demodulate rotor angle from HF injection'),
  suActionBemf: e('反电动势观测器接管角度', 'BEMF observer takes over the angle'),
  suActionFieldweak: e('注入负 Id 削弱磁链突破电压限', 'Inject negative Id to weaken flux beyond the voltage limit'),
  suActionFault: e('PWM 关断 / 停机保护', 'PWM off / shutdown protection'),
  suTrEnable: e('使能 / t > 50ms', 'Enable / t > 50ms'),
  suTrVbusStable: e('Vbus 稳定 / t > 200ms', 'Vbus stable / t > 200ms'),
  suTrAlignDone: e('对齐完成 / t > Talign', 'Align done / t > Talign'),
  suTrBemfWeak: e('BEMF 信号弱', 'Weak BEMF signal'),
  suTrHfiFail: e('HFI 解角失败', 'HFI angle extraction failed'),
  suTrRpmDrop: e('rpm 回落', 'rpm falls back'),
  suLegendMain: e('主路径', 'Main path'),
  suLegendFallback: e('降级回退', 'Fallback'),
  suLegendCurrent: e('● 当前', '● current'),
  suLegendVisited: e('● 已访问', '● visited'),
  suLegendUnvisited: e('● 未访问', '● unvisited'),

  // --- ScopeToolbar：示波器控件条 ---
  scopeTimebase: e('时基', 'Time base'),
  scopeTimebaseAria: e('时基选择', 'Time base selection'),
  scopeChannels: e('通道', 'Channels'),
  scopeChannelsAria: e('通道开关', 'Channel toggles'),
  scopeWindowAria: e('时间窗', 'Time window'),
  scopeMsUnit: e('毫秒', 'ms'),
  scopeCurrentSuffix: e('（当前）', ' (current)'),
  scopeShowWindowPrefix: e('显示', 'Show'),
  scopeShowWindowSuffix: e('时间窗', 'time window'),
  scopeHide: e('隐藏', 'Hide'),
  scopeShow: e('显示', 'Show'),
  scopeTimeDomain: e('时域', 'Time domain'),
  scopeBackToTime: e('回到时域波形', 'Back to time-domain waveform'),
  scopeFftTitle: e('切换到 FFT 频谱视图（看谐波分量）', 'Switch to FFT spectrum view (see harmonic components)'),
  scopeTrigger: e('触发', 'Trigger'),
  scopeTriggerFftOnly: e('触发只在时域有效（先切回时域）', 'Trigger works in time domain only (switch back first)'),
  scopeTriggerOff: e('关闭触发同步（自由扫描）', 'Disable trigger sync (free run)'),
  scopeTriggerOn: e('开启触发同步（锁定上升沿过零点，周期波看着不动）', 'Enable trigger sync (lock rising zero-crossing so periodic waves look still)'),
  scopeCursor: e('游标', 'Cursor'),
  scopeCursorFftOnly: e('游标只在时域有效（先切回时域）', 'Cursor works in time domain only (switch back first)'),
  scopeCursorOff: e('关闭游标', 'Turn off cursor'),
  scopeCursorOn: e('开启游标（点击波形读取该时刻数值）', 'Enable cursor (click the waveform to read the value at that instant)'),
  scopeResume: e('继续', 'Resume'),
  scopeFreeze: e('冻结', 'Freeze'),
  scopeResumeTitle: e('继续刷新', 'Resume refresh'),
  scopeFreezeTitle: e('冻结当前画面', 'Freeze the current display'),
  scopeCsvTitle: e('导出当前波形为 CSV（可在 Excel/MATLAB 打开）', 'Export the current waveform as CSV (opens in Excel/MATLAB)'),

  // --- PhDiagram：压焓图 ---
  phXLabel: e('焓 h (kJ/kg)', 'Enthalpy h (kJ/kg)'),
  phYLabel: e('压力 P (MPa, log)', 'Pressure P (MPa, log)'),
  phSubcooled: e('过冷液', 'Subcooled liquid'),
  phTwoPhase: e('两相区', 'Two-phase region'),
  phSuperheated: e('过热气', 'Superheated vapor'),
  phCompression: e('压缩', 'Compression'),
  phCondensation: e('冷凝放热', 'Condensation (heat out)'),
  phThrottle: e('节流', 'Throttle'),
  phEvaporation: e('蒸发吸热', 'Evaporation (heat in)'),
  phDragHint: e('拖动 [1] 调蒸发温度+过热度 · 拖动 [3] 调冷凝温度+过冷度', 'Drag [1] to set Te + superheat · drag [3] to set Tc + subcool'),
  phSatLiquid: e('饱和液', 'Saturated liquid'),
  phSatVapor: e('饱和气', 'Saturated vapor'),
  phCycle: e('循环', 'Cycle'),
  phTwoStage: e('两级 + 闪发', 'Two-stage + flash tank'),

  // --- EnergyFlowSankey：能量流桑基图 ---
  enAria: e('能量流 Sankey 图', 'Energy flow Sankey diagram'),
  enGrid: e('电网', 'Grid'),
  enPfcOut: e('PFC 输出', 'PFC output'),
  enFocMech: e('FOC 机械功', 'FOC mechanical'),
  enAeroWork: e('气动功', 'Gas power'),
  enCooling: e('制冷量 Q_c', 'Cooling Q_c'),
  enPfcLoss: e('PFC 损耗', 'PFC loss'),
  enFocLoss: e('FOC 损耗', 'FOC loss'),
  enCompLoss: e('压缩机损耗', 'Compressor loss'),
  enLegendUseful: e('有效功传递', 'Useful power transfer'),
  enLegendLoss: e('损耗（→ 发热）', 'Loss (→ heat)'),
  enLegendCooling: e('制冷量输出', 'Cooling output'),
  enLegendWidth: e('带宽 ∝ 功率', 'Bandwidth ∝ power'),
  enCopMismatchPrefix: e('COP 校验偏差 > 5%（', 'COP mismatch > 5% ('),
  enCopMismatchSuffix: e('）', ')'),
  enOverallPrefix: e('电网 → 制冷量 总效率（COP_sys）：', 'Grid → cooling overall efficiency (COP_sys):'),

  // --- MotorAnatomy2D：电机径向剖面 ---
  anStatorYoke: e('定子铁芯', 'Stator yoke'),
  anStatorWinding: e('定子绕组', 'Stator windings'),
  anAirGap: e('气隙', 'Air gap'),
  anRotor: e('转子', 'Rotor'),
  anMagnet: e('永磁极 N/S', 'Magnets N/S'),
  anMagnetPairs: e(' 对，共 ', ' pairs, '),
  anMagnetBlocks: e(' 块', ' poles'),
  anPolePairs: e(' 极对 · ', ' pole pairs · '),
  anPoles: e(' 极 · ', ' poles · '),
  anSlots: e(' 槽', ' slots'),
  anCurrentDir: e('⊙ 流出纸面 ⊗ 流入纸面', '⊙ out of page · ⊗ into page'),
  anHdAria: e('高保真物理效应清单', 'High-fidelity physics effects list'),
  anHdSaturation: e('饱和 Ld(id,iq) Vorobiev', 'Saturation Ld(id,iq) Vorobiev'),
  anHdIronLoss: e('铁损 Bertotti 三项', 'Iron loss Bertotti 3-term'),
  anHdCogging: e('齿槽 + BEMF 5/7/11/13', 'Cogging + BEMF 5/7/11/13'),
  anHdTemp: e('温度 PTC/NTC + Stribeck', 'Temp PTC/NTC + Stribeck'),

  // --- CascadeLoopDiagram：三闭环级联框图 ---
  caAria: e('三闭环级联控制信号流框图', 'Cascaded three-loop control signal-flow diagram'),
  caPositionLoop: e('位置环', 'Position loop'),
  caSpeedLoop: e('速度环', 'Speed loop'),
  caCurrentLoop: e('电流环', 'Current loop'),
  caPiPosition: e('PI 位置', 'PI position'),
  caPiSpeed: e('PI 速度', 'PI speed'),
  caPiCurrent: e('PI 电流', 'PI current'),
  caPlant: e('逆变器+电机', 'Inverter + motor'),
  caLegendPos: e('位置(慢)', 'Position (slow)'),
  caLegendSpd: e('速度', 'Speed'),
  caLegendCur: e('电流(快)', 'Current (fast)'),

  // --- DeadTimeWaveform：死区畸变波形 ---
  dtAvgErrorV: e('平均误差电压 ΔV', 'Avg error voltage ΔV'),
  dtErrorPct: e('占额定 |ΔV/Udc|', 'Share of rated |ΔV/Udc|'),
  dtIdeal: e('理想', 'ideal'),
  dtActual: e('实际', 'actual'),

  // --- MtpaCurve：IPM 操作图 ---
  mpCurrentCircle: e('电流极限圆', 'Current limit circle'),
  mpVoltageEllipse: e('电压极限椭圆', 'Voltage limit ellipse'),
  mpOverCurrent: e('电流越界', 'Over-current'),
  mpVoltageSat: e('电压撞限·弱磁', 'Voltage sat · field-weaken'),
  mpOnMtpa: e('运行在 MTPA', 'On MTPA'),
  mpTransition: e('过渡区', 'Transition'),

  // --- CompressorEnvelope：压缩机操作包线 ---
  evTeLabel: e('蒸发温度 T_e (°C)', 'Evaporating temp T_e (°C)'),
  evTcLabel: e('冷凝温度 T_c (°C)', 'Condensing temp T_c (°C)'),
  evViolated: e('⚠ 工作点越出包线', '⚠ Operating point outside envelope'),

  // --- HfiInjectionWaveform：HFI 信号链 ---
  hfiInjectV: e('注入电压 V_h', 'Injection voltage V_h'),
  hfiCurrentResp: e('电流响应 i (含噪声)', 'Current response i (noisy)'),
  hfiDemod: e('解调中间信号', 'Demodulated intermediate'),
  hfiErrorLpf: e('LPF 误差 ∝ sin(2θe)', 'LPF error ∝ sin(2θe)'),

  // --- StatorField2D：三相定子截面 ---
  sfLegend: e('⊙ 电流流出 / ⊗ 流入 · 箭头 = 合成磁场', '⊙ current out / ⊗ in · arrow = resultant field'),

  // --- SpaceVectorHexagon：SVPWM 六边形 ---
  svTitle: e('SVPWM 六边形空间矢量', 'SVPWM space-vector hexagon'),
  svSectorPrefix: e('扇区 ', 'Sector '),
  svTarget: e('目标 Uαβ', 'Target Uαβ'),
  svLinearLimit: e('线性区上限 ', 'Linear-region limit '),
  svBusUtil: e('母线利用率 ', 'DC-bus utilization '),
  svNoteSeg1: e(
    '括号 (ABC) 是该顶点对应的上桥臂三相状态：1=高电平，0=低电平。SVPWM 用所在扇区的两条边 ',
    'The (ABC) code is the three-phase upper-bridge state of that vertex: 1 = high, 0 = low. SVPWM uses the two edges of the active sector ',
  ),
  svEnumComma: e('、', ', '),
  svNoteSeg2: e(
    '（绿/橙箭头按 T1、T2 时间分配），加零矢量 V0/V7 凑齐周期，合成出蓝色目标矢量。',
    ' (green/orange arrows weighted by T1, T2), plus zero vectors V0/V7 to complete the cycle and synthesize the blue target vector.',
  ),

  // --- VectorPlane：αβ 矢量平面 ---
  vpTitle: e('αβ 矢量平面', 'αβ vector plane'),
  vpDragHint: e('拖白点可直接改变矢量端点', 'Drag the white dot to move the vector tip'),

  // --- FocCurrentLoopChart：FOC 电流环 ---
  flCmd: e('指令', 'ref'),
  flActual: e('实际', 'actual'),
  flIqRiseTime: e('Iq 上升时间', 'Iq rise time'),
  flIqOvershoot: e('Iq 超调', 'Iq overshoot'),
  flIqSteadyErr: e('Iq 稳态误差', 'Iq steady-state error'),
  flIdCrossTalk: e('Id 串扰峰值', 'Id crosstalk peak'),

  // --- StepResponseChart：PID 阶跃响应 ---
  stTarget: e('目标', 'Target'),
  stResponse: e('响应', 'Response'),
  stOutput: e('输出', 'Output'),

  // --- ObserverTransitionCard：估计器过渡 ---
  obTitle: e('估计器收敛', 'Observer convergence'),
  obEyebrow: e('HFI→BEMF 角度误差过渡', 'HFI→BEMF angle-error transition'),
  obAngleError: e('角度误差', 'Angle error'),
  obSeriesName: e('估计角度误差', 'Estimated angle error'),
  obNote: e(
    'HFI 区域（低频段）误差较大 ~15-25°；BEMF 接管后随转速升高迅速收敛至 <5°，过渡点存在瞬态尖峰。',
    'In the HFI region (low speed) the error is larger, ~15-25°; after BEMF takes over it converges quickly to <5° as speed rises, with a transient spike at the handover point.',
  ),

  // --- PidBodeChart：PID Bode 图 ---
  bdTitle: e('Bode 图', 'Bode plot'),
  bdEyebrow: e('频率响应 · 幅值 & 相位', 'Frequency response · magnitude & phase'),
  bdMagnitude: e('幅值', 'Magnitude'),
  bdPhase: e('相位', 'Phase'),
  bdZnTuning: e('Z-N 整定', 'Z-N tuning'),
  bdZnNoOvershoot: e('PID (无超调)', 'PID (no overshoot)'),
  bdNoUltimate: e('未检测到 -180° 相角穿越，当前系统无临界振荡点。', 'No -180° phase crossing detected; the current system has no critical oscillation point.'),

  // --- ThreePhaseSpectrumCard：三相频谱 ---
  spTitle: e('三相电流频谱 (DFT)', 'Three-phase current spectrum (DFT)'),
  spEyebrow: e('Ia / Ib / Ic · FFT 对比', 'Ia / Ib / Ic · FFT comparison'),
  spOrderSuffix: e(' 次', 'th'),
  spPhaseSuffix: e(' 相', ' phase'),
};
