# 领域准确性审查（电机 + 制冷专家版）

审查范围：`src/simulation/math/` 全部 20 个算法文件、`src/content/lessons.ts`（16 模块 1974 行讲义）、`src/content/formulas.ts` / `glossary.ts` / `faultCases.ts`、`src/simulation/engine/presets.ts`。

审查视角：把每个数学函数、每条公式、每段 codeExample、每个默认参数都和教科书 / 工业实践对一遍。**不假设代码是对的**。

---

## 1. 物理 / 控制模型严格性

### 1.1 `transforms.ts` ✅ 模型正确

- Clarke：`Iα = Ia, Iβ = (Ia+2·Ib)/√3`（line 13-14）— 标准**幅值不变形式**，与教学口径一致。
- 反 Clarke：`ia=α; ib=-α/2+√3/2·β; ic=-α/2-√3/2·β`（line 25-27）— 标准。
- Park / 反 Park：标准旋转矩阵，符号一致。
- `generateThreePhaseCurrent`（line 77-88）的 `noise` 项使用 `Math.sin(173·t+seed)` 模拟"伪随机"——纯确定性，刻意可复现，UI 不抖。**教学级简化但需声明**。

### 1.2 `svpwm.ts` ⚠️ T1/T2 公式有量级错误

`calculateSvpwm` 的核心一段（line 47-50）：
```ts
const t1 = ts * modulationIndex * Math.sin(Math.PI/3 - angleInSector) / Math.sin(Math.PI/3);
const t2 = ts * modulationIndex * Math.sin(angleInSector) / Math.sin(Math.PI/3);
```
其中 `modulationIndex = √3·|Uref|/Udc`。

**标准教科书公式**（Bose, Mohan, 国内冯垛生 / 王成元）：
```
T1 = m·Ts·sin(60°-θ')      (m = √3·|Uref|/Udc, 0 ≤ θ' ≤ 60°)
T2 = m·Ts·sin(θ')
```
最大处 θ'=30° → T1=T2=m·Ts·0.5，T1+T2=m·Ts，m=1 才撞 T0=0 边界。✅ 自洽。

**代码版本**多除了一个 `sin(60°)=√3/2`，等于把 T1/T2 全乘 2/√3≈1.155。
- 在 m=0.866 时 T1+T2 已经达到 Ts、T0=0；m=0.999 时 T0 被 `Math.max(0, …)` 强制裁到 0，halfZero=0，但 T1+T2 还会继续增长，最终 ta/tb/tc 撞 [0,1] 边界。
- 结果：**线性区上限错位**——本来 0~1 的合法 m 区间在代码里变成了 0~0.866，超过 0.866 已开始隐式过调制 / 削顶，但 `saturated` 旗标却仍按 m_raw>=1 才报 true（line 82）。学员看不到过调制临界点。

🔧 **修法**：去掉 `/Math.sin(Math.PI/3)`，并把 `saturated` 判据改成 `T1+T2 > Ts`。或保留当前缩放但显式注明这是"按 sin(60°) 归一化的 m"，并把 saturated 阈值改成 modulationIndex >= √3/2。

### 1.3 `pid.ts` ✅ 控制律正确，仿真模型偏教学

- `pidStep` 的微分项采用"对测量微分"（derivative-on-measurement，line 35）——避免 setpoint 阶跃导致的"derivative kick"，工程上正确。
- 抗积分饱和用"饱和输出反推积分"（back-calculation，line 42-44）——经典做法。
- `simulatePidStepResponse` 的二阶被控对象（line 113）公式略奇怪：
  ```
  acc = ω·k·(u - L) - 2ζ·ω·v - ω²·x·0.06
  ```
  把刚度系数硬编为 `0.06`、ω 固定 34 rad/s，是被指定为"演示曲线"的玩具模型。形态合理，但不能映射到真实电机/伺服的二阶环节传递函数。**教学级简化**。

### 1.4 `motorModel.ts` ✅ dq 方程完全正确

PMSM dq 电压方程实现（line 57-58）：
```ts
did = (vd - rs·id + ω_e·lq·iq) / ld
diq = (vq - rs·iq - ω_e·(ld·id + flux)) / lq
```
对照教科书 `vd = R·id + Ld·did/dt - ω_e·Lq·iq` / `vq = R·iq + Lq·diq/dt + ω_e·(Ld·id+ψf)`，**完全一致**。

转矩公式 line 61：`τ = 1.5·p·(ψf·iq + (Ld-Lq)·id·iq)` ——标准（注意：磁阻转矩项在 IPM Lq>Ld 时，Id<0 才能正贡献，与"负 Id 既能弱磁又能 MTPA"的物理一致）。✅

机械方程：`J·dω/dt = τ - τ_load - B·ω` ✅。

⚠️ 前向欧拉积分。在 `dt = 1e-4` s（10 kHz）下 PMSM 电气时间常数 L/R ≈ 1.1mH/0.42Ω ≈ 2.6 ms，>> dt，数值稳定。但若学员把 dt 调到 5 ms 量级会数值发散——UI 没护栏。

### 1.5 `observer.ts` ⚠️ BEMF 公式有方向问题

`estimateBackEmf`（line 25）：
```ts
angle = atan2(eβ, eα) + π/2
```
但教科书 BEMF 与转子角的关系：`eα = -ω·ψf·sin θ, eβ = ω·ψf·cos θ`，所以 `θ = atan2(-eα, eβ)`。

代码 `atan2(eβ, eα)+π/2`：
- atan2(eβ, eα) 给出的是 BEMF 矢量的极角 = θ + 90°（因 eβ 是 cos）
- 再加 π/2 后变成 θ + 180°，与真实 θ 差 π
- ω<0（反转）时彻底错

`smo.ts` 用的 `atan2(-zα, zβ)` 是正确的，所以 SMO 那侧没问题；但 `observer.ts/estimateBackEmf` 单独调用会吐出反转角度。**实际项目中 estimateBackEmf 似乎只在演示一图里被引用，不进闭环；但作为参考代码段会误导工程师**。

🔧 改成 `angle = atan2(-eα, eβ)`。

### 1.6 `smo.ts` ✅ 完全合规

滑模面、边界层 sat、等效控制 LPF、PLL 顺序都教科书。
- 唯一可议的：`simulateSMO`（line 181）把"真实电流"硬设为 `0.5·cos(θ_true)/sin(θ_true)`，简化得电流 _未带_ L·di/dt 项。在 1500 rpm@4PP（ω=628 rad/s）下 ω·L·0.5≈0.55 V，远小于 BEMF=ω·ψf≈32.7 V，量级影响 1.7%。**可接受教学简化**。

### 1.7 `hfi.ts` / `hfiSignals.ts` ⚠️ 凸极增益有概念错误

**lessons.ts 给出的公式** (line 1441)：
```
gain ≈ (Lq - Ld) / (Lq · Ld) · V_h
```
这个写法本身是教科书"差模电感 ΔL 倒数"形式，单位是 1/H × V = A/s。

**hfi.ts 实现**（line 38）：
```ts
const saliencyGain = (r - 1) / (r + 1);    // r = Lq/Ld
```
这是**完全不同的量**——是无量纲的凸极调制指数。两者数值差异巨大（典型 IPM r=2.18：1/0.4mH·30=75000 A/s vs (1.18/3.18)=0.37）。

**hfiSignals.ts** 又用了第三个公式（line 91-92）：
```ts
sigma = (1/Ld + 1/Lq)/2
delta = (Lq - Ld) / (2 · Ld · Lq)
```
最终响应电流幅值正比于 Δ·sin(2θe)。这是 hfiSignals 自己的推导，是教科书 d-q 高频小信号模型的**正确形式**。

⚠️ **三个文件用了三套不同公式，其中两套互相有矛盾**：
- lesson 公式 `(Lq-Ld)/(Lq·Ld)` 写得不严谨（单位不对，应该是 (Lq-Ld)/(2·Lq·Ld) ）；
- hfi.ts 用 `(r-1)/(r+1)` 是 simplified 直觉量，不匹配 lesson 公式；
- hfiSignals.ts 才是物理正确的。

🔧 统一到 hfiSignals.ts 的 Σ/Δ 推导，更新 lesson 公式 `Δ = (Lq-Ld)/(2·Lq·Ld)`。

### 1.8 `weakField.ts` ⚠️ Id 建议过于简化

`suggestWeakeningId`（line 45-48）：
```ts
return -Math.min(currentLimit*0.75, Math.abs(voltageReserve)*0.08)
```
这是个**纯启发式 hack**，没有物理意义：
- 真正的弱磁解：从 `|V|² = (R·Id - ω·Lq·Iq)² + (R·Iq + ω·(Ld·Id+ψf))² ≤ V_max²` 解 Id；
- 简化版（忽略 R）：`Id = -ψf/Ld + (1/Ld)·√(V_max²/ω² - Lq²·Iq²)`。

代码里 0.08 系数完全是经验拍脑袋。文件标题已注明"教学演示"，但讲义没说清这点，工程师拿来移植会翻车。**应在 lessons 中明确："这个函数是占位符，不是工程级弱磁调度器"**。

### 1.9 `inverterModel.ts` ❌ 死区损失方向错误

`inverterAverageModel`（line 28-29）：
```ts
const deadLoss = clamp(input.deadTimeSec * input.pwmFrequency, 0, 0.2);
const signedDuty = (duty) => clamp(duty - deadLoss * Math.sign(duty - 0.5), 0, 1);
```

**物理错误**：死区电压损失方向 = `sign(I_phase)`（电流方向），**不是** `sign(duty - 0.5)`（占空比是否大于 50%）。

正确公式（与 deadTimeDistortion.ts 一致）：
```
ΔV_avg = sign(I_phase) · td · fpwm · Udc
```

后果：
- duty>0.5 但电流为负时，代码把损失方向取反——结果错；
- 在电流过零点附近，代码用 duty 来推断电流方向，与现实物理脱节；
- 是逆变器模块教学和死区扭曲模块教学**自相矛盾**的典型——一个文件用占空比、另一个文件用电流。

🔧 让 inverterAverageModel 接受 `iaSign/ibSign/icSign` 参数（或直接调用 deadTimeDistortion 的解析公式）。

### 1.10 `startup.ts` ✅ 状态机逻辑合理，但状态切换条件粗糙

- 7 状态序列（idle → precharge → align → open-loop → hfi → bemf → fieldweak）符合压缩机标定流程；
- 反液击 ramp 限制（典型 600 rpm/s）合理；
- ⚠️ HFI→BEMF 切换条件只看 `rpm >= bemfHandoffRpm * 0.95`（line 66），**没有 BEMF 信号质量校验**。讲义里 line 1142 强调"BEMF 幅值 ≥ 阈值 + PLL 锁相 < 5° 持续 ≥ 20ms"才能切——讲义和代码不一致。**这是工业上启动失败的主因**，不应被简化掉。

### 1.11 `apf.ts` ✅ Boost PFC 双环平均模型正确

- `dudc = ((1-d)·iL - i_load)/C` ✓
- `diL = (vRect - (1-d)·udc)/L` ✓
- 占空比前馈 `dutyFf = 1 - vRect/udc` ✓ 经典 Boost 平均模型
- ⚠️ THD 计算（line 138-140）：用 `i_first_harm_acc` 单边累加 `iLine·sin(ωt)` 来估基波 RMS，丢了余弦分量（即电流相对电压有相位偏差时基波被低估）。教学场景下输入电流接近与电压同相位，影响有限。**教学级简化**。

### 1.12 `refrigerantProps.ts` ⚠️ R-32 潜热低 18%

物性核对（饱和压力对照 NIST REFPROP / CoolProp）：

| 制冷剂 | 7°C @code | 7°C @real | 45°C @code | 45°C @real | 偏差 |
|--------|-----------|-----------|------------|------------|------|
| R-32 | 1.012 MPa | 1.06 MPa | 2.795 MPa | 2.79 MPa | 高温几乎完美，低温 -5% |
| R-410A | 0.993 MPa | 1.05 MPa | 2.730 MPa | 2.72 MPa | 高温好，低温 -5% |
| R-134a | 0.379 MPa | 0.375 MPa | 1.15 MPa | 1.16 MPa | 全段 ±1% |

潜热（0°C）：

| 制冷剂 | 代码 Lref | NIST 真实值 | 偏差 |
|--------|-----------|-------------|------|
| R-32 | **315** kJ/kg | **382** kJ/kg | **-17.5%** ❌ |
| R-410A | 222 kJ/kg | 222 kJ/kg | ±0% ✅ |
| R-134a | 199 kJ/kg | 199 kJ/kg | ±0% ✅ |

**R-32 潜热严重偏低**，这会让 Qc/Wcomp/COP 全部按比例错（Qc ∝ Δh），在"R-32 比 R-410A COP 高"的教学结论上系统性低估 R-32 优势。

🔧 R-32 `Lref` 改为 380（或更准 382）。

### 1.13 `vaporCycle.ts` ⚠️ EEV 限流耦合粗糙、过冷度焓接口不一致

- 多变压缩 T_d、容积效率 η_v、m_dot 公式都正确。
- ⚠️ EEV 限流逻辑（line 148-154）：用 `mDotMax = 0.005 + eevOpening·0.04` 直接钳制 m_dot，触发后**只发警告，没有**把 P_d 抬高到一个真实平衡点。现实中 EEV 卡小 → m_dot 受限 → 蒸发器一侧液堆积 → 实际系统 P_s 抬高（直到 m_in_evap = m_出 EEV）。教学上"只警告不动态"会让学员看不到真实的 P_s/P_d 演化。
- ⚠️ 容积效率公式 `η_v = max(0.05, 1 - C·((Pd/Ps)^(1/n)-1))` 与教科书 `η_v = 1 + C - C·(Pd/Ps)^(1/n)` 等价（化简对照即可），✅ 正确。
- ⚠️ 入口气相密度 line 139：`rho1 = rhoVRef·(1+α·T_C)·(T1_K/(Te+273.15))` 把"过热气理想气体修正"直接乘到饱和密度上，对低过热度（5K）OK，但高过热度时把吸气密度 _抬高_——实际过热气密度比饱和气**低**。乘错方向。

🔧 应该是 `rho1 = rhoVRef·(1+α·Te) · (Te+273.15)/T1_K`（理想气体 PV=mRT，T 高 ρ 低）。

### 1.14 `annualPerformance.ts` ⚠️ bin 数据合理，部分负荷加成可议

- 4 城市的 bin 总小时数（北京制冷 750h、上海 1500h、广州 3500h）量级与中国典型气候资料对得上 ✅；
- 设计温度（北京冷 35°C 热 -7°C）与 GB 50736 设计参数一致 ✅；
- Tc = T_outdoor + 12 的"冷凝逼近度"、Te = 7°C（蒸发器恒温）是行业经验值 ✅；
- ⚠️ 制热季 Te = T_outdoor - 8（line 256）在哈尔滨 -25°C 时 Te = -33°C，已经离 R-32 实际可用区很远（家用空调一般 -15°C 蒸发即触发除霜或停机）。代码没限位、没警告。
- ⚠️ `partLoadBoost = 1 + 0.15·(1-partLoad)`（line 234）——把 partLoad=0.3 解读为"标定 COP × 1.105"。真实变频空调部分负荷 COP 提升常见 10-30%（因为压缩机机械损耗占比下降）。系数 0.15 偏保守，但不离谱。**教学级近似可接受**。
- ⚠️ 一级能效 ≥ 5.0、二级 ≥ 4.5、三级 ≥ 4.0 的判据（line 311-314）符合 GB 21455-2019 但只针对房间空调器分体式；多联机/移动空调阈值不同。**讲义需注明使用对象**。

### 1.15 `systemFaults.ts` ⚠️ condenser-fouling 排气温度叠加重复

`condenser-fouling` 分支（line 200-209）：
```ts
result.states[1].T += sev * 12;
result.states[2].T += sev * 6;
result.states[1].T += sev * 15;     // 注释明确说"再加 15 度排气过热"
result.Wcomp *= 1 + sev * 0.25;
```
两次给 `states[1].T` 加值，sev=1 时累计 +27°C。
- 真实"冷凝器堵塞"现场，排气温度因 P_d 升高+多变压缩比扩大而上升，常见 5-15°C；+27°C 偏激进。
- 注释承认是"叠加"，但读者看到代码会困惑。

🔧 合并成单次 +20°C 之类的合理值，写明"含压比抬高+换热不良双因素"。

其他故障扰动方向都是对的：
- refrigerant-leak：m_dot 降、Qc 降、SH（吸气过热）升 ✅
- evaporator-frost：P_s 降、Qc 降 ✅
- eev-stuck-closed：m_dot 大降、SH 飙升、Td 升 ✅
- eev-stuck-open：吸气接近饱和液、Wcomp 升（湿压缩） ✅
- non-condensable-gas：P_d 抬高、Wcomp 升 ✅
- oil-circulation-low：Wcomp 升、Td 升 ✅

### 1.16 `eevController.ts` ⚠️ 注释逻辑反复，代码方向正确

控制律 line 103：`steps = baseSteps + Kp·(sh - target) + Ki·integ`，被控 `shSteady = baseSH - systemGain·(steps - baseSteps)`。
- sh > target → err>0 → steps↑ → systemGain·(steps-base)↑ → shSteady↓ → 收敛 ✅
- 但开头大段注释（line 22-29）说 `err = target - meas` 会导致正反馈发散，最终落地用 `err = sh - target` 形式。注释自我矛盾，读者会迷糊。
- `samples[i].shErr = target - sh`（line 117）保存的是"教科书定义的误差"，与控制律内部 errAccum 反号——容易让画图的人困惑误差曲线极性。

🔧 删掉前段反复的"先错后对"说明，保留干净的：
> "EEV 是反向被控对象（开度↑ → SH↓），所以 PI 用 `err = SH_meas - SH_ref` 才能正反馈到收敛。"

### 1.17 `deadTimeDistortion.ts` ✅ 完全正确

- ΔV = sign(I)·td·fpwm·Udc 公式（line 154-162）和 instantPhaseVoltage 的死区窗口逻辑都符合教科书；
- 与 inverterModel.ts 形成的对比反差恰好暴露了 inverterModel 的方向错误（见 §1.9）。

### 1.18 `faultWaveforms.ts` ✅ 教学合成波形定性正确

- 缺相用 KCL 重构 Ic = -Ia（满足三相和=0）✓
- 相序错用 swap A/C 通道 ✓
- 电压饱和用 5/7 次谐波保持 KCL ✓（很多教学代码错画成"削顶"，这里改对了）
- 电流偏置三相不和零 ✓ 模拟控制器误判

### 1.19 `focLoop.ts` ⚠️ 硬编码电机参数与 motor profile 脱节

`focLoop.ts` 顶部 line 27-29：
```ts
const R = 0.55;
const L = 1.2e-3;
const PSI_F = 0.045;
```
但 `presets.ts/motorBasicsDefault` 是 `rs:0.42, ldMh:1.1, lqMh:2.4, flux:0.052`。两套参数不一致。FOC 仿真和电机基础模块的参数应该联动。

🔧 让 `simulateFocCurrentLoop` 接受 motor params 参数，从 store 拉。

---

## 2. 公式与教学一致性

| 位置 | 讲义公式 | 代码实现 | 问题 |
|------|----------|----------|------|
| `lessons.ts` line 1441 (HFI gain) | `(Lq-Ld)/(Lq·Ld)·V_h` | hfi.ts: `(r-1)/(r+1)`；hfiSignals.ts: `(Lq-Ld)/(2·Ld·Lq)` | 三套公式互相不一致；讲义版本量纲不严，缺 1/2 因子 |
| `lessons.ts` line 1187 (MTPA) | `Iq² + (Lq-Ld)·Id·Iq − ψf·Id = 0` | （无代码实现） | **公式本身错**：标准 MTPA 是 `Id² + ψf/(Lq-Ld)·Id - Iq² = 0`，讲义把 `Id²` 写成 `Id·Iq`，是常见笔误，但这条会让学员推导出错 |
| `lessons.ts` line 1054 (角度提取) | `θ_est = atan2(eα, -eβ)` | smo.ts: `atan2(-zα, zβ)`；observer.ts: `atan2(eβ, eα)+π/2` | 讲义 `atan2(eα, -eβ)` 与 SMO 实现 `atan2(-eα, eβ)` 等价（差全负号→相同角度），但与 observer.ts 不一致 |
| `lessons.ts` line 696 (T1/T2) | `T1 = m·sin((N·60° - θ + 60°))·Ts` | svpwm.ts: 多除一个 sin(60°) | 讲义公式正确，代码实现量级偏 2/√3（见 §1.2） |
| `lessons.ts` line 1163 (HFI→BEMF 切换) | "BEMF 幅值≥阈值 + PLL 锁相<5° 持续 ≥20ms" | startup.ts: 只看 rpm | 讲义讲了正确的多重判据，状态机代码却简化掉 |
| `formulas.ts` line 6 (电压极限) | `√(Vd²+Vq²) ≤ Udc/√3` | weakField.ts/checkVoltageLimit: 同上但默认乘 0.96 余量 | 一致 |

---

## 3. 数值默认与工程现实

### 3.1 motorBasicsDefault（1.5HP 压缩机标杆）

| 参数 | 代码值 | 1.5HP 转子式压缩机典型 | 评价 |
|------|--------|------------------------|------|
| polePairs | 4 | 4 (8极) 或 6 (12极) | ✅ 中规中矩 |
| Rs | 0.42 Ω | 0.3-0.6 Ω | ✅ |
| Ld | 1.1 mH | 0.8-1.5 mH | ✅ |
| Lq | 2.4 mH (Lq/Ld=2.18) | 1.5-3.0 mH，凸极比 1.5-2.5 | ✅ 适配 HFI |
| ψf | 0.052 Wb | 0.04-0.08 Wb | ✅ |
| 额定电流 12 A 峰值 | | 1.5HP @ 220V → 8-12 A | ✅ |
| 额定转速 7200 rpm | | 压缩机典型 1500-7200 rpm | ✅ |

⚠️ inertiaUm=320, dampingUm=120 — 单位是"×1e-6"，等于 J=3.2e-4 kg·m²、B=1.2e-4 N·m·s/rad。1.5HP 压缩机转子+曲轴 J ~ 1-3e-4 kg·m²，✅ 量级正确。

### 3.2 inverterDefault

| 参数 | 代码值 | 评价 |
|------|--------|------|
| Udc | 310 V | 单相 220V 整流后 = 311V，✅ |
| pwmFrequency | 6000 Hz | 压缩机典型 4-8 kHz（高速 IGBT），但 focLoop.ts 内部硬编 16000，**两套参数不自洽** |
| deadTimeUs | 2 μs | IGBT 典型 1-3 μs，✅ |

### 3.3 refrigerationDefault（R-32 空调标定工况）

| 参数 | 代码值 | GB/T 7725 名义工况 | 评价 |
|------|--------|---------------------|------|
| Te | 7 °C | 7.2 °C | ✅ |
| Tc | 45 °C | 室外 35 → Tc≈45-50 | ✅ |
| superheatK | 5 K | 5-7 K | ✅ |
| subcoolK | 3 K | 3-5 K | ✅ |
| 排量 9.5 cc/rev | | 1.5HP 转子式 8-11 cc | ✅ |
| 余隙比 0.05 | | 0.03-0.08 | ✅ |
| 等熵效率 0.72 | | 实测变频压缩机 0.65-0.80 | ✅ |
| eevOpening 0.55 | | 50-60% 中等开度 | ✅ |

整体 **refrigerationDefault 的参数集是当前文档中工程现实感最强的部分**。

### 3.4 hfiDefault

| 参数 | 代码值 | 评价 |
|------|--------|------|
| injectVoltage 30 V | | 5-30 V，typical 10-20 V，**偏大**会增加电流谐波 |
| injectFreqHz 800 Hz | | 500-2000 Hz，✅ 但与 PWM 6kHz 比 1:7.5，奈奎斯特边界附近，建议 ≥1000Hz 或 PWM 抬到 10kHz |
| saliencyRatio 2.18 | | IPM 压缩机典型 1.5-2.5，✅ |
| pllKp 100, pllKi 1500 | | 量级合理 |

### 3.5 startupDefault

| 参数 | 代码值 | 评价 |
|------|--------|------|
| accelRampRpmS 600 | | 反液击经验 300-800 rpm/s，✅ |
| alignDurationMs 800 | | 200-1000 ms，✅ |
| hfiHandoffRpm 100 | | HFI→开环切到点，可议——典型 30-100 rpm |
| bemfHandoffRpm 500 | | HFI→BEMF 切换，5-10% 额定 = 360-720 rpm，✅ |
| fieldweakRpm 5000 | | 弱磁介入约 70% 额定 = 5040，✅ |

### 3.6 apfDefault

| 参数 | 代码值 | 评价 |
|------|--------|------|
| udcRef 380 V | | 220V 单相变频空调常见 380-400V 母线，✅ |
| boostInductanceMh 1.5 | | 0.5-2 mH，✅ |
| boostCapacitanceUf 470 | | 470-1000 μF，✅ |
| voltageKp 0.5, voltageKi 5 | | 电压环带宽 ~20 Hz，**偏低**（典型 50-100 Hz） |
| currentKp 0.05, currentKi 50 | | 电流环带宽 ~1 kHz，✅ |

---

## 4. 教学顺序

16 个模块顺序：
```
01 motor-basics → 02 three-phase → 03 clarke → 04 park → 05 pid → 06 foc-flow
→ 07 svpwm → 08 inverter → 09 control-loops → 10 sensorless-foc → 11 field-weakening
→ 12 faults-debugging → 13 hfi-sensorless → 14 startup-statemachine → 15 apf-frontend → 16 refrigeration-bench
```

整体合理，但有以下建议：

| 当前位置 | 建议调整 | 理由 |
|----------|----------|------|
| 06 (foc-flow) 在 svpwm 前 | ✅ 保持，但要注意 foc-flow 演示用 SVPWM 而 SVPWM 还没讲——讲义 line 588 `codeExample` 已显式调用 `svpwm_calc`，前置依赖未公开 | 在 06 引言中明确"SVPWM 暂时当黑盒，下一节展开" |
| 08 inverter 在 svpwm 后 | ✅ 合理 | SVPWM 算 duty，逆变器把 duty 变成相电压 |
| 13 hfi 在 12 faults 之后 | ⚠️ HFI 是无感的延伸，应紧贴 10 sensorless-foc | 顺序改为：10 → 13 → 11 → 12 |
| 14 startup 在 11/12/13 后 | ✅ 启动状态机集成所有子模块，放最后讲合理 | |
| 15 apf 在 14 startup 后 | ⚠️ APF 是前级电源，逻辑上应放在 08 inverter 旁 | 但放在 14/16 之间作为"系统集成"也讲得通 |
| 16 refrigeration 最后 | ✅ 让电机控制者跨界看系统级，节点很巧 | |

**主要建议**：把 13 hfi 提前到 10 sensorless 之后、11 field-weakening 之前。逻辑链为"无感角度估算（SMO 高速 → HFI 低速）→ 高速极限处理（弱磁）"。

---

## 5. STM32 代码骨架可用性

| 模块 | codeExample 评价 | 实战工程师拿来当起点的可信度 |
|------|------------------|-------------------------------|
| motor-basics (encoder_to_theta_e) | ✅ 类型清晰、防溢出、单位明确 | 高，可直接抄到生产工程 |
| three-phase (ADC 偏置校准) | ⚠️ 用 `ADC1->JSR` 是 F1/F4 写法，G4/H7 是 ADC1->ISR；JDR1/JDR2/JDR3 是 STM32F1 风格 | 中，需要按目标 MCU 改 |
| clarke (clarke / clarke_2adc) | ✅ static inline、ONE_OVER_SQRT3 常量、健康检查 | 高 |
| park (park / inv_park / align_encoder_zero) | ⚠️ `set_open_loop_voltage` 没定义；`align_encoder_zero` 用 HAL_Delay(800) 在中断之外 OK，但代码块孤立 | 中 |
| pid (pi.h 完整带 anti-windup) | ✅ 工程级实现，整定建议清晰 | 高 |
| foc-flow (TIM1_UP_TIM16_IRQHandler) | ⚠️ `pi_step` 接口与 pi.h 不一致（pi.h 是 `pi_step(c, ref, meas)`，foc.c 写成 `pi_step(c, err, kp, ki, dt)`）；解耦前馈方向写错——`v_d -= ω·Lq·iq` 应该是 `v_d += ...`（dq 解耦标准为 v_d_decouple = -ω·Lq·iq，要补偿就 `v_d_with_ff = v_d_pi - (-ω·Lq·iq) = v_d_pi + ω·Lq·iq`） | **低-中**，前馈方向是工程级翻车点 |
| svpwm (svpwm_calc min-max) | ✅ min-max 算法是工业实现首选，简洁、扇区附带计算 | 高 |
| inverter (TIM1 BDTR DTG) | ⚠️ DTG 编码 `(uint64_t)DEAD_TIME_NS * APB2_CLOCK_HZ / 1e9` 的高位编码（DTG[7:5]）没处理，超过 127 的死区计算错；`if (dtg > 127) dtg = 127` 已规避，但实际很多场景 DT > 1μs（170MHz下 dtg=170 已超），需要切到 DTG[7]=1xx 编码模式 | 中 |
| control-loops (triple_loop.c 三 PI 调度) | ✅ 限幅、采样率分级清晰；整定步骤详细 | 高 |
| sensorless-foc (smo_pll.c) | ⚠️ "sensorless_step" 把 `(di + z/L)·dt` 加到 i_est，但 smo.ts 里 `z/L` 已经合在 `(R·i + v + z)/L` 里，C 代码版本和 ts 版本数学上不同。**两版互相不参考**。读者会困惑 | 中 |
| field-weakening (fw_compute_id_ref) | ⚠️ `pi_step(&f->pi_fw, 0.0f, -err)` 参数名 (ref, meas) 顺序与上文 pi.h 不符（应该是 (ref=1.0, meas=v_ratio)）；电流圆约束写得很好 | 中 |
| faults-debugging (黑匣子 + 三级保护) | ✅ NMI / 软件 / 主循环三级很专业；`__attribute__((section(".noinit")))` 链接脚本细节给出 | 高 |
| hfi-sensorless (hfi_step) | ⚠️ "i_q_meas 中的高频分量" 没说怎么提取（应该是 i_q_high_pass 之后的）；解调直接用 i_q 会被 i_q 的 DC 转矩分量主导 | 中 |
| startup-statemachine (compressor_startup.c) | ✅ 7 状态 enum + entry/exit + 黑匣子日志 + PI reset，工业级模板 | 高 |
| apf-frontend (pfc_pwm_isr) | ⚠️ `update_sine_template` 用"v_ac_rect 自身归一化"是粗糙近似；电网过零 PLL（典型 SOGI）才是工业实现；`v_peak *= 0.9999f` 会让连续低压时峰值跟踪丢失 | 中 |
| refrigeration-bench (bench_slow_task / eev_pi_task) | ✅ 工况采集、保护分级、EEV PI 都很清晰；"3D 查表" 函数 `rpm_lookup_3d` 留给读者实现，合理 | 高 |

**总评**：codeExample 整体水准在国内嵌入式教材中属于优秀——尤其黑匣子、三级保护、状态机、min-max SVPWM、抗积分饱和这些工业惯例都到位。但 foc-flow 的 dq 解耦前馈方向、sensorless 的 SMO 离散公式版本不一致是两个**应当修正的硬伤**。

---

## 6. 重要错误清单

| 严重度 | 文件:行 | 问题 | 修法 |
|--------|---------|------|------|
| **严重** | `inverterModel.ts:29` | 死区损失方向用 `sign(duty-0.5)` 而非 `sign(I_phase)`，与教材公式相反 | 接受电流方向参数，复用 `deadTimeDistortion.ts` 的解析公式 |
| **严重** | `lessons.ts:1187` (MTPA) | MTPA 公式写成 `Iq² + (Lq-Ld)·Id·Iq − ψf·Id = 0`，把 Id² 误写为 Id·Iq | 改为 `Id² + ψf/(Lq-Ld)·Id - Iq² = 0` |
| **严重** | `svpwm.ts:48-49` | T1/T2 公式多了 1/sin(60°) 因子，使线性区上限错位到 m=0.866 而非 1.0 | 删 `/Math.sin(Math.PI/3)`，并把 saturated 阈值改为 `T1+T2 > Ts` |
| **严重** | `lessons.ts foc-flow codeExample:625-626` | 解耦前馈符号错：写 `v_d -= ω·Lq·iq` 应为 `v_d += ω·Lq·iq` | 翻号 |
| **严重** | `refrigerantProps.ts:46` | R-32 潜热 Lref=315 比真实值 (382 kJ/kg) 低 17.5%，会让 R-32 教学结论被低估 | 改 Lref: 380 |
| 中等 | `observer.ts:25` | `estimateBackEmf` 的角度提取 `atan2(eβ,eα)+π/2` 与教材 `atan2(-eα,eβ)` 差 180°，反转方向角度全错 | 改为 `atan2(-eα, eβ)` |
| 中等 | `vaporCycle.ts:139` | 过热气密度修正乘了 `T1/Te` 反向（理想气体应除而不是乘） | 改为 `rho1 = rhoVRef·(1+α·Te) · (Te+273)/T1_K` |
| 中等 | `systemFaults.ts:204-207` | `condenser-fouling` 给 states[1].T 重复加了两次（+12 又 +15），sev=1 时 +27°C 偏离实际 | 合并为单次 +18°C |
| 中等 | `hfi.ts:38` vs `hfiSignals.ts:91-92` vs `lessons.ts:1441` | 三套不同的"凸极增益"公式，语义都说"凸极调制强度"但量纲与系数不一致 | 统一到 `Δ = (Lq-Ld)/(2·Lq·Ld)`，更新 lesson 公式 |
| 中等 | `startup.ts:66-67` | HFI→BEMF 切换只看 rpm，没有 BEMF 信号质量校验，与讲义 line 1163 描述的"幅值+锁相+持续 20ms"三重判据不一致 | 加入 SMO/PLL 健康检查作为切换前置条件 |
| 中等 | `lessons.ts foc-flow:621-622` | `pi_step(&g_pi_d, g_ref.id - i_d, g_param.kp, g_param.ki, DT)` 接口与 `pi.h:489` 的 `pi_step(c, ref, meas)` 不一致 | 统一参数表 |
| 轻微 | `focLoop.ts:27-29` | 硬编码 R/L/ψf，与 motorBasicsDefault 不联动 | 改为传参 |
| 轻微 | `inverterDefault.pwmFrequency=6000` 与 `focLoop.ts/PWM_FREQ=16000` | 同一项目两套 PWM 频率 | 统一为 store 参数 |
| 轻微 | `eevController.ts:22-29` | 注释先讲"err=target-meas 会发散"再改成"err=meas-target 收敛"，逻辑反复让读者迷糊 | 删掉发散段，留干净版本 |
| 轻微 | `apf.ts:138-140` | THD 计算只用 sin 分量做基波估计，丢了 cos 分量（相移大时基波被低估） | 用 sin/cos 双通道相关求基波幅值 |

---

## 7. 教学级简化清单（不算错，但读者应当知道）

1. **`pid.ts/simulatePidStepResponse` 二阶模型** — 玩具二阶环节，刚度系数硬编 0.06，不能映射到真实电机传递函数。
2. **`smo.ts/simulateSMO` 真实电流** — 用 `0.5·cos(θ)/sin(θ)` 占位，没带 L·di/dt 项，但量级影响 < 2%。
3. **`hfiSignals.ts` 注入只在 d 轴** — 真实工业方案常用 d-q 双轴注入或脉振注入，本仿真单轴够教学。
4. **`apf.ts` 整流桥用 |sin| 直接表示** — 没仿真整流桥换流死区、没仿真 EMI 滤波器，简化到 Boost 平均模型。
5. **`weakField.ts/suggestWeakeningId`** — 纯启发式，不是工程级弱磁调度器。讲义未明示。
6. **`refrigerantProps.ts` Antoine + 线性 cp** — 全段 ±5%，远低于 NIST REFPROP 精度。已注明"不要做制冷工程设计"。
7. **`vaporCycle.ts` 蒸发/冷凝器无压损** — 真实系统有 5-15 kPa 压损，影响 COP 1-3%。
8. **`annualPerformance.ts` 部分负荷 boost** — `1+0.15·(1-PL)` 一刀切，真实曲线随机型变化。
9. **`startup.ts` 状态切换条件** — 简化到 `rpm >= threshold·0.95`，缺少 BEMF/PLL 多重判据。
10. **`focLoop.ts` 一阶离散** — 前向欧拉，dt 大时数值不稳定，UI 没护栏。
11. **`generateThreePhaseCurrent` "noise"** — 是确定性 sin 噪声，不是真随机；UI 上更稳定，但学员若复制到 STM32 期望"白噪声"会出乎意料。
12. **`faultWaveforms.ts` 全是合成波形** — 不是物理仿真；定性正确但定量没有意义。
13. **`refrigerantProps` saturationCurve** — 不画临界点附近，避免 Antoine 外推爆。

---

## 8. 强烈建议补的内容

### 8.1 概念缺失或讲得太薄

| 主题 | 当前状态 | 建议 |
|------|----------|------|
| **MTPA 角度求解** | lesson 给了一句"MTPA: Iq²+(Lq-Ld)·Id·Iq−ψf·Id=0"且公式有错 | 加一节"MTPA 角度求解：解析解 vs 查表 vs 迭代法"，对比 IPM (Lq>Ld) vs SPM (Lq=Ld) |
| **MTPV** | 仅在弱磁讲义提了名词 | 补"深度弱磁区切换 MTPV 的几何意义"和典型代码骨架 |
| **解耦前馈** | foc-flow codeExample 给了但符号错 | 单独章节讲"为什么 dq 在高速会串扰、解耦前馈如何抵消"+ 公式推导 |
| **dq 电流环带宽与极点配置** | lesson 给了 Kp=ω_bw·L、Ki=ω_bw·R | 缺"零极对消"推导、缺"为什么 Ki/Kp=R/L"几何意义 |
| **死区补偿算法** | lesson inverter 一句"提前在 PWM 命令上加补偿值" | 补：电流过零点附近极性翻转的判据、低通跟踪 vs 矢量补偿 |
| **PLL 设计** | observer/sensorless 讲了 PI PLL | 缺"二阶 PLL 自然频率/阻尼比 vs Kp/Ki 折算"——工业整定靠它 |
| **HFI 极性判别** | 讲义提了一句但没展开 | 补"启动后用注入直流 + 检测 sign(Iq) 决定 d 轴极性"代码骨架 |
| **凸极转矩 (Reluctance Torque)** | torque 公式写出来了 | 但没专门讲"IPM 在 Id<0 时磁阻转矩为正"的几何意义，弱磁/MTPA 都靠它 |
| **过流保护两级**（硬件 BKIN + 软件 |I_αβ| 阈值）| faults 模块详细 | 缺"硬件过流响应时间 vs IGBT 短路承受时间"权衡 |
| **APF 单环 vs 双环 vs 平均电流模式** | 仅给双环 | 缺峰值电流模式、迟滞控制对比 |
| **EEV 控制其他策略** | 仅 SH PI | 缺"过冷度反馈"、"功率反馈"两种工况下的策略选择 |
| **变频压缩机噪声管理** | 完全没讲 | HFI 注入电流、PWM 谐波都是噪声源；空调认证 GB/T 7725 噪声等级 — 缺一节"载频随机化、PWM 边沿优化、噪声谱整形" |
| **退磁阈值** | 弱磁模块提了一句 | 没具体数值（钕铁硼 NdFeB N42SH 退磁阈值 -800 kA/m，对应 Id 上限）；没"工厂回流后退磁监测"的工程做法 |

### 8.2 公式推导太简略

1. **SVPWM T1/T2 推导** — lessons 直接给公式，缺"用电压矢量等效 = T1·V_k + T2·V_{k+1}"几何推导。
2. **Park 变换的"功率不变 vs 幅值不变"** — clarke 讲了 √(2/3) 缩放但没数学推导。
3. **滑模观测器为什么能"等效"BEMF** — 讲了"开关函数 + LPF"但没"等效控制原理"——这是 SMO 理论核心。
4. **PMSM dq 模型从 abc 推导** — lessons 直接给 dq 方程，缺 abc → αβ → dq 的导数链式推导，工程师拿来"为什么有 ω·L 交叉项"会懵。
5. **多变压缩 T_d = T_s·(P_d/P_s)^((n-1)/n)** — 给了公式，缺"为什么 n 不等于 cp/cv"工程经验解释。

### 8.3 工程化深度

1. **生产线参数辨识** — 现场上电后自动辨识 Rs/Ls/ψf 的流程（高频信号注入 / 短路实验），lesson sensorless 提了"必做"但没具体方法。
2. **黑匣子结构与 CRC** — fault 模块代码骨架很专业，但没讲"复位后如何区分这次掉电是故障还是断电"——加 boot reason flag。
3. **不同 MCU 的移植** — codeExample 全用 STM32，没提"Cortex-M0 没 FPU 时如何用 Q15 定点替代浮点"。
4. **EMI 与 PCB Layout** — 完全没提，但实战故障 30% 来自 layout（采样地分离、栅极电阻、母线 snubber）。

---

## 总结

**评级**：内容定位"初中级嵌入式 + 制冷"双向跨界，整体水平在国内电机控制学习材料中位居前列。代码层算法纯函数 / 状态机 / 黑匣子等架构都有工业品味，refrigerationDefault 参数、faultCases 排查清单、压缩机 7 状态启动机都是这门课的强项。

**主要短板**：
- SVPWM T1/T2 量级偏 2/√3、inverterModel 死区方向错、MTPA 公式错、解耦前馈符号错、R-32 潜热低 17% — 这五条是"严重"等级，会被现场工程师立刻发现并怀疑全套教材。
- HFI 凸极增益三套公式互相矛盾，需要统一到 hfiSignals.ts 的物理推导。
- 多个 codeExample 中函数接口前后不一致（pi_step 参数表），读者复制粘贴会编译失败。

**建议优先修**：第 6 节"严重"5 条、再加 hfi 公式统一、HFI→BEMF 切换条件多重判据。这些修完，技术准确性从"教学优秀"升级到"工业可信"。
