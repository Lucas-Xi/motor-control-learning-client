# 性能审查报告（专家版）

- 生成时间：2026-05-10
- 基线：`npm run build` 实测产物（vite 7.3.3 / 2838 modules / 7.31s）
- 范围：bundle / 加载 + 运行时 re-render + 内存生命周期三层
- 与前一版（`docs/PERFORMANCE_AUDIT.md`）关系：本版聚焦"专家视角下尚未覆盖的运行时与内存问题"，bundle 部分仅复述结论 + 补充新数据，重点在 §2 §3。

---

## 0. TL;DR

1. **首屏关键路径仍是 ~865 KB raw / ~273 KB gzip**，主要被 `WaveformPanel` 同步 import 拖入的 `charts-Dv2GPaPy.js`（recharts 422 KB raw / 120 KB gzip）+ `FidelityBadge-D5HeGuHg.js`（lessons.ts 137 KB raw / 55 KB gzip）支配；这两个 chunk 与首屏视口几乎都没有强对应关系。
2. **运行时最大隐患不在 store 选择器（CLAUDE.md 已强约束），而在两点**：
   - `BenchScope` / `ThreePhaseBranch` / `MotorBasicsBranch` / `DQBranch` / `SchematicPanel` 各自订阅 `state.time`（60 fps 推送），其中 `BenchScope` 即使采样率 8 Hz 也仍然每帧 re-render → diff `<LineChart>`；
   - `BenchKpiStrip` / `MetricsProbe` / `EnvelopeProbeCard` / `EnergyFlowCard` / `SnapshotComparePanel` / `SystemFaultPanel` / `BenchScope` **七处**各自 `useMemo(() => simulateCycle(...), [refrig, motor.rpm])` —— 每次 `refrigeration` 切片改变（拖动 EEV 滑块时每帧），**全部 7 处同时重算**同一份循环。
3. **内存 / 生命周期实际较干净**（ProgressHook 的 setInterval 卸载正确、useRafThrottle 也清理 RAF），但有两处需要警惕：
   - `BenchKpiStrip` 用 `histRef.current.cop.push(...)` + `force(t+1)`，**只在 `[cop,Td,Qc,Iq]` 变化时累计**，但 cop/Td 由 simulateCycle 派生，refrigeration 滑块每动一帧就 push 一个 → `histRef` 数组永远不会超过 40，但每帧分配新 Sparkline path 字符串；
   - `BenchScope.samples` 设了 `MAX_SAMPLES=240` 上限，但 `setSamples` 在每个 `time` 变化（60Hz）的 useEffect 里都触发 setState（即使被 `time-lastSampleTime<1/8s` 提前 return），Hook 每帧都进 effect 队列；
   - `MetricsProbe` 内部用了 `setSparkTick((t) => t + 1)` 来驱动 sparkline 重渲染——这是个无意义的状态更新，可以直接靠 `Ps/Pd/...` 依赖触发。

---

## 1. Bundle / 加载分析

### 1.1 实测 chunk 表（`npm run build` 输出，2026-05-10 单位均为 raw / gzip）

| Chunk | raw | gzip | 内容（核对自 chunk 头部 / `dependencies` 链） |
|---|---:|---:|---|
| `index-BjdbR352.js` | 123.69 KB | 43.14 KB | App / AppShell / Sidebar / TopBar / ParameterPanel / WaveformPanel 入口 / store / presets / parameterSchemas / 部分 lucide |
| `motion-CxtP32bd.js` | 134.57 KB | 44.49 KB | **react + react-jsx-runtime + framer-motion**（命名错误，react 占大头） |
| `three-3PtB6Gua.js` | 184.54 KB | 58.52 KB | **react-dom（createRoot/scheduler）**——验证：`grep "WebGLRenderer" → 0`；`grep "unstable_scheduleCallback" → 5` |
| `charts-Dv2GPaPy.js` | 422.21 KB | 120.42 KB | recharts 全量（v3 仍 sideEffects:true，无法 tree-shake） |
| `FidelityBadge-D5HeGuHg.js` | 137.43 KB | 54.85 KB | **lessons.ts 134KB 中文文案** + ConceptNotes + Quiz + CodeBlock + faultCases + ModuleLayout + lucide 子集 |
| `RefrigerationBenchModule-BiBXX-nJ.js` | 73.04 KB | 23.57 KB | 16 号制冷台架（含 7 子卡片 + simulateCycle 数据） |
| `index-DNgPTich.css` | 30.91 KB | 6.64 KB | Tailwind JIT 输出 |
| **首屏关键路径合计** | **865 KB** | **273 KB** | index + motion + three + charts + FidelityBadge + 默认模块 ThreePhaseModule (5.5 KB) + CSS |

> **新发现 vs 旧文档**：73 KB 制冷台架 chunk 比旧版（60 KB）增长 22%，主要是 BenchKpiStrip / MetricsProbe / SystemFaultPanel 等被持续扩展。`*Module-*.js` 单 chunk budget 30 KB 现已被它击穿 2.4 倍，应单独脱出预算线。

### 1.2 影响首屏的问题（按收益排序）

| # | 现象 | 文件 / 改动 | 预期收益 | 风险 |
|---|---|---|---|---|
| **B1** | `WaveformPanel` 在 `AppShell.tsx:9` 同步 import → 拖入整个 `charts` chunk | `src/components/layout/AppShell.tsx`：`import { WaveformPanel }` 改 `const WaveformPanel = lazy(()=>import('./WaveformPanel').then(m=>({default:m.WaveformPanel})))`；包 `<Suspense fallback={<div className="h-72 mt-4 rounded-2xl border border-line-subtle bg-bg-surface" />}>` 占位避免 CLS | 首屏 raw -422 KB / gzip **-120 KB**；TTI 4G ↓ 200~400 ms | 中。第一次切换模块时多一次 chart 加载（Suspense fallback 已稳定），但 BenchScope 仍在 RefrigerationBench 内同步 import recharts，所以即使首屏 lazy 化，进任意带波形模块也会触发拉取 |
| **B2** | `lessons.ts` 134 KB 整包打入 `FidelityBadge` 共享 chunk | 拆 `src/content/lessons.ts` → `src/content/lessons/<moduleId>.ts`；`ConceptNotes.tsx` 改 `const lesson = use(import(\`../content/lessons/\${moduleId}.ts\`))`（React 19 use API）或 `useState(()=>...) + useEffect(import())` | `FidelityBadge` chunk 137 KB → ~50 KB；每模块新增 ~5-10 KB 各自 chunk；首屏 gzip **-30 KB** | 中。需同时改 `getLesson` 同步 API 为异步；`Quiz` 等组件需 Suspense 包裹；`verify-project.mjs` 文件清单要更新 |
| **B3** | `vite.config.ts` 的 `manualChunks: { three:[...], motion:[...] }` 名实不符 | `vite.config.ts:11-15` 改成函数式：`manualChunks(id) { if (id.includes('node_modules/react-dom')) return 'react-dom'; if (id.includes('node_modules/react/')) return 'react'; if (id.includes('node_modules/recharts')) return 'recharts'; if (id.includes('node_modules/framer-motion')) return 'framer-motion'; if (id.includes('node_modules/lucide-react')) return 'lucide'; }` | chunk 命名清晰；react / react-dom 拆开后可并发下载（HTTP/2 下 ~100 ms 收益） | 低。modulepreload 由 vite 自动重写 |
| **B4** | three / @react-three/fiber / @react-three/drei 是孤儿依赖 | 删 `src/components/three/Motor3D.tsx` `MagneticField3D.tsx` `RotorFluxScene.tsx`；`package.json` 移除 `three`、`@types/three`、`@react-three/fiber`、`@react-three/drei` | bundle 不变（已 tree-shake），node_modules **-5 MB**，npm install -3~5 s | 低 |
| **B5** | `RefrigerationBenchModule` 73 KB 一个 chunk，进入即全部下载 | 把不在首屏的 tab 内容 `lazy()`：`src/modules/refrigeration-bench/SnapshotComparePanel.tsx`、`SystemFaultPanel.tsx`、`AnnualPerformanceCard.tsx` 改 `const Snap = lazy(()=>import('./SnapshotComparePanel').then(m=>({default:m.SnapshotComparePanel})))`；`ProbeTabs` 内容用 `<Suspense>` 包 | 首屏制冷模块 73 → ~40 KB；进入时间 ↓ 30% | 低。已经是 ProbeTabs 切换语义 |

### 1.3 二次切换（已加载首屏后）的盲点

- `BenchScope` 同步 import 在 `WaveformPanel` 里；只要切到 16 号模块或波形 dock 渲染就拉 recharts。**已被 §B1 lazy 化覆盖**，但单独提一句：现状下进 16 号会触发 `vaporCycle.ts` + `refrigerantProps.ts` + `systemFaults.ts` + `eevController.ts` + `annualPerformance.ts` 5 个数学库一次性加载。这个 OK，模块内同步合理。
- `WaveformPanel` 的 9 个 branch 全部同步 import 各自 chart 组件，例如 `FaultBranch` 只在 `activeModule === 'faults-debugging'` 才走，但代码上是顶层 import → 切到任意模块都会拉。**改动**：把 9 个 branch 文件改成 `lazy(() => import('./WaveformBranches/FaultBranch'))`，按 activeModule 动态切换。**收益**：模块切换的渲染开销分摊到各自 chunk；不影响首屏因为已经 §B1 lazy 化；**优先级**：低（先做 B1）。

### 1.4 监控盲点

- 当前 `verify-project.mjs` 仅做文件存在性 + 关键字串校验，没有 chunk size budget。
- 建议在 `scripts/release-audit.mjs` 后加一步 `node scripts/check-bundle-budget.mjs`，超 budget 让 `release:audit` 红：

```js
// scripts/check-bundle-budget.mjs (新增)
const BUDGET = {
  'index-*.js': 130_000,
  'charts-*.js': 0,                  // 切到 lazy 后应当不在首屏；如出现就告警
  'FidelityBadge-*.js': 60_000,      // 完成 B2 后
  'RefrigerationBenchModule-*.js': 75_000,
  '*Module-*.js (其他)': 30_000,
};
```

---

## 2. 运行时渲染分析

### 2.1 高风险 selector 列表

CLAUDE.md 强制切片选择器，全仓搜索结果显示**没有任何 `useSimulationStore()` 整把抓的反模式**——这一项 100% 通过。
但仍有两类高频 re-render 来源：

#### (a) 订阅 `state.time` 的组件（60 fps 推送）

`grep "useSimulationStore.*time"` 命中 12 处：

| 文件:行 | 是否合理 | 问题 |
|---|---|---|
| `src/modules/three-phase/ThreePhaseModule.tsx:14, 46` | ✅ 合理（动画驱动） | — |
| `src/modules/motor-basics/MotorBasicsModule.tsx:56` | ✅ 合理 | — |
| `src/components/charts/MotorAnatomy2D.tsx:38` | ✅ 合理 | — |
| `src/modules/foc-flow/FOCFlowModule.tsx:65` | ✅ 合理 | — |
| `src/modules/startup-statemachine/StartupStateMachineModule.tsx:23` + `StateGraphCard.tsx:21` | ✅ 合理 | — |
| `src/components/layout/WaveformPanel.tsx:18, 25, 41` | ⚠️ 三处 branch（`ThreePhaseBranch` `MotorBasicsBranch` `DQBranch`）各自订阅 time | 三个 branch 在不同 activeModule 下被渲染，**单时刻只挂一个**——OK |
| `src/modules/refrigeration-bench/RefrigerationBenchModule.tsx:121`（`SchematicPanel`） | ⚠️ 60 fps re-render 用于 `flowPhase` | 流体动画**只是用于装饰**，但每帧都跑 simulateCycle（参 §2.2） |
| `src/modules/refrigeration-bench/BenchScope.tsx:28` | ❌ **疑似浪费** | 60 fps 重新进入 useEffect、检查 `time-last<1/8s` return；setState 不触发但 selector 仍重订阅 → 每帧 useEffect 重建 |

**风险评估**：60 fps re-render 本身不致命（React 19 + 这些组件树都很浅），但触发的 `useMemo` 依赖检查 + `simulateCycle()` / 三角函数生成才是 CPU 大头（参 §2.2）。

#### (b) `useSimulationStore((s) => s.refrigeration)` 整对象订阅

```ts
// 7 处文件相同模式：
const refrig = useSimulationStore((s) => s.refrigeration);
```

文件：`RefrigerationBenchModule.tsx`（PhPanel/SchematicPanel/MetricsProbe 三次） + `BenchKpiStrip.tsx` + `BenchScope.tsx` + `EnvelopeProbeCard.tsx` + `EnergyFlowCard.tsx` + `SnapshotComparePanel.tsx` + `SystemFaultPanel.tsx`。

**问题**：refrigeration 对象有 13 个字段（refrigerant / Te / Tc / SH / SC / displacement / clearance / isentropic / eev / closedLoop / displacementCc / ambientOutdoor / ambientIndoor）。改动任意字段，整对象引用变化，所有 7 个组件 re-render；`useMemo([refrig, motor.rpm])` 也都重算 simulateCycle。

**改动建议**（中等收益，低风险）：抽出共享 hook：

```ts
// src/modules/refrigeration-bench/useCycleResult.ts (新建)
import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { simulateCycle } from '../../simulation/math/vaporCycle';

export function useCycleResult() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const rpm = useSimulationStore((s) => s.motorBasics.rpm);
  return useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te, Tc: refrig.Tc,
    superheatK: refrig.superheatK, subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc, clearanceRatio: refrig.clearanceRatio,
    rpm: rpm > 100 ? rpm : 3000,
    isentropicEff: refrig.isentropicEff, eevOpening: refrig.eevOpening,
  }), [refrig, rpm]);
}
```

但这只是去重——React 不会跨组件 hoist `useMemo`。要真正只算一次：

**方案 A（最小工作量）**：让 `RefrigerationBenchModule` 计算一次结果，通过 React Context 传给所有子卡片。
- 改 `RefrigerationBenchModule.tsx`：在最外层 `useCycleResult()`，包 `<CycleContext.Provider value={result}>`；
- 子卡片把 `useMemo(()=>simulateCycle(...))` 改成 `useContext(CycleContext)`；
- **预期收益**：refrigeration 滑块拖动时 simulateCycle 调用次数 7 → 1（拖动一次最多 ~50 fps × 7 = 350 次/s 降到 50 次/s）。

**方案 B（更激进）**：把 cycleResult 提升到 store。在 `simulationStore` 加 `refrigerationDerived: CycleSimulationResult`，并在 `updateRefrigeration` / `updateMotorBasics` 的 set 内派生。
- 优点：单次中央计算，订阅者只读 derived 切片；
- 缺点：违反 CLAUDE.md "store 只放参数" 约定（不过该约定是软约束，可由本审计提议放宽）。

**推荐方案 A**：低风险、零架构改动、命中点准。

### 2.2 `simulateCycle` 在 7+ 卡片同时 useMemo —— 量化与解决

`simulateCycle` 单次开销估测（基于 `vaporCycle.ts` 199 行 + `refrigerantProps.ts` 152 行 Antoine 方程组）：约 **200-400 μs / call**（Pentium-N 等老 CPU 可能 1-2 ms）。

当前激活卡片数（refrigeration-bench 默认 tab）：`BenchKpiStrip` + `PhPanel` + `SchematicPanel` + `MetricsProbe` + `EnvelopeProbeCard` + `EnergyFlowCard` = 6 处独立计算。
切到 `调控` tab：`SystemFaultPanel`（再调一次 + 一次 `applySystemFault`） + 上面 KpiStrip 等 3 处（`primary` 槽常驻） + BenchScope = 5 处。
切到 `对比` tab：`SnapshotComparePanel`（capture 时调一次） + `AnnualPerformanceCard`（`calculateAPF` 内部循环 8-12 次 simulateCycle）= 单次 8-12 KPI bin × 200 μs ≈ 2-3 ms 但只在 zone/refrigerant 变化时算。

**拖动 EEV 滑块时**（refrigeration 字段改变，60 fps 触发）：
- 当前：6 × ~300 μs = **~1.8 ms / 帧** 用于 simulateCycle，再加 PhDiagram redraw / SVG 路径再生成 ~1 ms / SchematicPanel `flowPhase` 60Hz 重算 → **总帧预算压到 ~3 ms**，已经吃掉 16 ms 帧预算的 20%。
- 改方案 A 后：1 × 300 μs = **0.3 ms / 帧**，节省约 1.5 ms。

**实际改动量**：6 个文件 × 各自删 useMemo + 改 useContext = 约 30 行代码。

### 2.3 不必要的 useMemo / useEffect 依赖

| 文件:行 | 问题 | 修复 |
|---|---|---|
| `BenchKpiStrip.tsx:31-38` | `useEffect` 依赖 `[cop,Td,Qc,Iq]`（这 4 个是 derived），里面调 `force(t+1)` 强制重渲染——纯属冗余 | 删掉 `useState(0)` 和 `force(t+1)`，histRef.push 后让 React 自然下一帧 commit 即可（cop/Td 已经触发了父组件的重渲染） |
| `MetricsProbe`（`RefrigerationBenchModule.tsx:210-220`） | 同样的 `setSparkTick((t)=>t+1)` 模式，已经标了 `void sparkTick` | 同上：删 |
| `BenchScope.tsx:49-68` | `useEffect` 依赖 `[time, running, result, requiredIq, frozen]`——`result` 每帧因 refrigeration 变化重算导致 effect 重跑；但内部 `time-last < 1/8s` 早 return | 把 `result` 字段拆出来：`useEffect(...)` 依赖只放真正需要采样的字段（`Pd, Td, cop, Iq, mDot`）+ `time`；早 return 逻辑不变 |
| `WaveformPanel.tsx:42-49`（`DQBranch`） | `useMemo` 依赖列表展开了 `park.iAlpha, park.iBeta, ...` 但 `threePhase` 里又把 6 个字段都展开 | 已经做对了，无需改（避免对象引用比较）；保持 |
| `BenchScope.tsx:31-38` 的 `useMemo([refrig, motor.rpm])` | refrigeration 整对象做依赖，等价 60Hz 重算（拖滑块时） | 通过 §2.1 方案 A 解决（改 useContext 直接拿 result，不再 useMemo） |

### 2.4 RAF throttle 应用

| 文件 | 是否走 useRafThrottle | 备注 |
|---|---|---|
| `PhDiagram.tsx:51` | ✅ pointermove 走 throttle | 正确 |
| `VectorPlane.tsx`（park 矢量拖拽） | 需现场 grep 验证 | grep 命中 `useRafThrottle.ts` 被 import |
| `SVPWMModule` 矢量拖拽 | grep 命中 useRafThrottle | 正确 |
| `FieldWeakening` Id-Iq 拖拽 | grep 命中 useRafThrottle | 正确 |
| `SystemFaultPanel.tsx:setSeverity`（severity slider） | ❌ 未 throttle | Slider 内部 onChange 直接 setState，不经过 RAF；该 setState 在 useState 本地（非 store），且每次 setState 触发 baseline+fault 两次 useMemo，可能在 60Hz 拖动时计算 120 次/s。**建议**：给 `<Slider value={severity} onChange={setSeverity}>` 加 `useRafThrottle` 包装，或在 SystemFaultPanel 内对 severity 状态做 RAF 节流 |
| `EevControlCard.tsx:setKp/setKi/...` | ❌ 未 throttle | 同上。`simulateEevPi` 跑 300 步 dt=0.05 → 每次拖动算 15 秒仿真。**优先级**：中（用户实际拖动频率 ≤30 Hz，可暂不改） |

**RAF throttle 应用结论**：覆盖到位 80%，剩 20% 在制冷台架的本地状态 slider 上有改进空间，但在用户实际操作频率下可暂不改（除非有反馈）。

### 2.5 SchematicPanel flowPhase 是隐性帧消耗

```ts
// RefrigerationBenchModule.tsx:134
const flowPhase = (time * Math.max(0.05, result.massFlow * 25)) % 4;
```

每帧（time 推送）这个值变化 → SchematicPanel re-render → 内部 SystemSchematic 组件 re-render（179 行 SVG）→ 浏览器 SVG 重排。
**改动**：把 SystemSchematic 用 `React.memo` 包裹，让它只在 props 变化时 re-render（rpm/Te/Tc/eevOpening + flowPhase 已经是 props，但 states 是数组对象——可能不稳定引用）。
**收益**：在动画态下减少 ~0.5 ms/帧。
**优先级**：低。

---

## 3. 内存 / 生命周期

### 3.1 ProgressHook setInterval

`src/components/layout/ProgressHook.tsx:57-88`：

```ts
useEffect(() => {
  const id = window.setInterval(() => { ... }, STEP_MS);
  return () => window.clearInterval(id);
}, [tickActiveTime]);
```

✅ **卸载正确**。`tickActiveTime` 是 zustand 选择器返回的稳定函数引用（zustand 不会重建 action 函数），所以 effect 也只挂载一次。
唯一隐患：HMR 下，文件改动会让 `useEffect` 重新运行，cleanup → setInterval 再启 → 旧 timer 已 clear，新 timer 接管，**无泄漏**。

> 但有一个**架构小问题**：第 58 行 `STEP_MS = 5000` 即每 5 秒一次 tick。如果用户在 PMSM 流程中切了模块 4 次（每次间隔 1 秒），第二个 useEffect（监听 activeModule 变化的那个）会把 delta 累加到 `prevModule.totalTimeMs`。但 setInterval 会同时给 `current` 累加 5s——存在**模块切换瞬间双重计数**的边缘情况：第 84 行 `enterAtRef.current = Date.now()` 已经规避了；OK。

### 3.2 BenchScope.samples 增长

`samples` 已设 `MAX_SAMPLES = 240` 上限（30s × 8Hz）+ 时窗 cutoff filter。**无内存泄漏**。
但有一个边界 bug：

```ts
// BenchScope.tsx:65
const cutoff = time - WINDOW_SEC;
return next.filter((s) => s.t >= cutoff).slice(-MAX_SAMPLES);
```

如果用户按了 `R` 重置时间（time=0），但 samples 里的 `t` 仍然是历史时间值（>30），filter 把所有点都剔除——**期望行为吗？** 看代码上下文是希望"reset 触发清空历史"，但 `R` 不是 refrigerant 变化，所以也不进入第 73 行的 `setSamples([])`。**结果**：按 R 后图表暂时空白几秒重新填——勉强可接受。

**改动**（小品）：在 `useEffect(() => { ... }, [time...])` 前面加一段：

```ts
const lastTimeRef = useRef(time);
useEffect(() => {
  if (time < lastTimeRef.current) {
    setSamples([]);
    lastSampleTime.current = -1;
  }
  lastTimeRef.current = time;
}, [time]);
```

### 3.3 BenchKpiStrip / MetricsProbe histRef.current

```ts
const histRef = useRef({ cop: [] as number[], ... });
// useEffect 内 push, 超过 40 shift
```

✅ 上限 40 点，shift 维护。**不增长**。但每次 push 都 `setSparkTick(t=>t+1)` 强制重渲染——`histRef` 是 ref，React 不会因 ref 写入触发 re-render，所以"强制刷新"的设计是有意为之。**但这个 force tick 完全没必要**——因为父组件本来就因 `cop/Td/Qc/Iq` 变化在 re-render，sparkline 接收到的 `data={h.cop}` 引用同一个数组（push 不变引用）→ Sparkline 能不能正确更新？

读 `Sparkline.tsx:29`：`if (data.length < 2) {...}`，再用 `data.map(...)` 渲染——**它依赖的是 props 变化触发 React diff**，但 push 不改变数组引用！**这才是为什么需要 force tick**——它是 hack，用 setState 强制 commit 让 Sparkline 看到 updated 数组。

**正确改法**：在 useEffect 里改成 `setHist((h) => ({ cop: [...h.cop, cop].slice(-40), ... }))`，让数组**新引用**自然触发 re-render，删除 useRef + force tick。
- **预期收益**：代码简洁，也少一次 useState；运行时无显著差异（push+force vs new array slice，都是 O(40) ）。
- **优先级**：低（可读性收益 > 性能收益）。

### 3.4 localStorage 写入频率

| Store | 写入触发点 | 频率风险 |
|---|---|---|
| `progressStore` | `recordVisit` 切模块、`recordQuizResult` 答题、`tickActiveTime` 每 5s + setState 给当前模块 +5000ms | 5 秒一次，**OK** |
| `themeStore` | `setTheme` / `toggle` | 用户主动点击，**OK** |
| `param-group-${moduleId}-${name}`（ParameterPanel.tsx:270） | 折叠组按钮 toggle | 用户主动点击，**OK** |
| `bench-probe-tab`（ProbeTabs.tsx:40） | tab 切换 | 用户主动点击，**OK** |

**结论**：所有 localStorage 写入都是用户事件触发，**没有发现高频写入**。

### 3.5 HMR 热重载下的孤儿订阅

zustand store 是模块级单例（`create<>()(...)`），HMR 下如果改 `simulationStore.ts`，模块会被重新执行 → 新的 `useSimulationStore` 实例。但旧组件已经订阅了旧 store——**这是 zustand 的已知 HMR 问题**，但本项目 `simulationStore.ts` 不常改，开发者通常会 hard reload；**不是生产问题**，本审计标记为已知行为不要求修。

### 3.6 各 *Card 的 useState 在切走 tab 后会被 GC 吗

`ProbeTabs` 默认实现：`{active.content}`——**只渲染 active tab 的 content**，inactive content 直接卸载。
所以 `EevControlCard` 的 `kp/ki/targetSH/initialSH` useState、`SystemFaultPanel` 的 `type/severity` useState 在切走 tab 时**组件 unmount** → state 清空。
**但 `tabs` prop 是父组件 RefrigerationBenchModule.tsx:269 在每次 render 时构建的全部 tab 数组，包含 inactive content 的 React.Element**——**这些 Element 创建了但不会被渲染**，只占临时分配（render phase 释放）。**OK，无内存问题**。

唯一隐患：用户切回 `调控` tab 时，EevControlCard 重新挂载、kp/ki/targetSH/initialSH 全部回到 default。**这是 UX 问题，不是性能问题**——如果想保留，可把 4 个 useState 提升到 RefrigerationBenchModule 或本地 sessionStorage。

### 3.7 useRafThrottle 清理

`src/utils/useRafThrottle.ts:20-26`：

```ts
useEffect(() => {
  return () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    latestArgs.current = null;
  };
}, []);
```

✅ unmount 时取消未 flush 的 RAF，正确。

### 3.8 AppShell RAF 主时钟

```ts
// AppShell.tsx:16-28
useEffect(() => {
  let frame = 0;
  const tick = (now) => {
    ...
    if (running) step(dt);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}, []);
```

✅ unmount 时 cancelAnimationFrame。但有个细节：**`running=false` 时仍然每帧调度 RAF**（只是不调 step）。这不致命（RAF 在浏览器优化下也是 ~0.1 ms/帧），但理论上可以 `if (!running) return;` 后面不再 schedule。
**风险**：如果不重新 schedule，恢复 running 时需要从外部 trigger——当前组件靠 useEffect 依赖触发，**改这个会破坏暂停后立即恢复**的语义。**保持现状**。

### 3.9 ThemeApplier 副作用

```ts
// ThemeApplier.tsx:16-35
useEffect(() => {
  if (initializedRef.current) return;
  initializedRef.current = true;
  ... matchMedia ...
}, [setTheme]);
```

✅ 只在首次挂载执行；matchMedia 没有持续监听（一次性读取 `.matches`）。**没有泄漏**。
唯一遗憾：用户系统主题在运行时切换不会同步（matchMedia 没加 listener）——这是 UX 问题不是性能问题。

---

## 4. 优先级清单

| 优先级 | 改动 | 文件 | 预期收益 | 风险 |
|---|---|---|---|---|
| **高** | B1：`WaveformPanel` 改 `lazy()` + Suspense fallback 占位 | `src/components/layout/AppShell.tsx` | 首屏 raw -422 KB / gzip **-120 KB** | 中 |
| **高** | §2.1 方案 A：`RefrigerationBenchModule` 用 React Context 共享 cycle result，移除 6 处独立 simulateCycle | `RefrigerationBenchModule.tsx`、`BenchKpiStrip.tsx`、`EnvelopeProbeCard.tsx`、`EnergyFlowCard.tsx`、`MetricsProbe`、`SystemFaultPanel.tsx`、`BenchScope.tsx` | 拖 EEV 滑块帧耗 -1.5 ms（从 ~1.8 ms 降到 ~0.3 ms，相当于消除 60Hz 下 10% 帧预算压力） | 低 |
| **高** | B2：`lessons.ts` 拆按模块文件 + ConceptNotes 按需 lazy | `src/content/lessons.ts` 拆成 `src/content/lessons/<id>.ts`；`src/components/layout/ConceptNotes.tsx` 改异步 | 共享 chunk -85 KB raw / -30 KB gzip | 中 |
| **高** | B5：`RefrigerationBenchModule` 内部 Snapshot/Fault/Annual 三卡片 lazy | `src/modules/refrigeration-bench/RefrigerationBenchModule.tsx` 把 import 改 `lazy()`，ProbeTabs 包 Suspense | 制冷模块首屏 73 → ~40 KB | 低 |
| 中 | B3：`vite.config.ts` `manualChunks` 改函数式拆 react / react-dom / recharts / lucide / framer-motion | `vite.config.ts` | 命名清晰；并发下载 ~100 ms | 低 |
| 中 | B4：删 3 个孤儿 3D 组件 + uninstall three / @react-three/* | `src/components/three/*.tsx`、`package.json` | bundle 不变；node_modules -5 MB | 低 |
| 中 | §2.3：删 `BenchKpiStrip` / `MetricsProbe` 里的 `force(t+1)` setState 反模式，改用 `setHist({ ... })` 触发自然 re-render | `src/modules/refrigeration-bench/BenchKpiStrip.tsx`、`RefrigerationBenchModule.tsx`（MetricsProbe） | 代码简洁；运行时无明显差异 | 低 |
| 低 | §2.5：`SystemSchematic` 用 `React.memo` | `src/components/charts/SystemSchematic.tsx` | 60Hz 动画态下 -0.5 ms/帧 | 低 |
| 低 | §2.4：`SystemFaultPanel` severity slider 加 RAF throttle | `src/modules/refrigeration-bench/SystemFaultPanel.tsx` | 拖动时 simulateCycle+applySystemFault 调用减半（120Hz→60Hz） | 低 |
| 低 | §3.2：`BenchScope` time 回退检测，主动清 samples | `src/modules/refrigeration-bench/BenchScope.tsx` | UX 修补，非性能 | 低 |
| 低 | bundle budget CI guard | 新增 `scripts/check-bundle-budget.mjs`，挂到 `release-audit.mjs` | 防回归 | 低 |

---

## 5. 不建议改的（成本高收益低）

### 5.1 不要把 zustand 切片选择器改成 `useShallow` / `reselect`

CLAUDE.md 已强约束切片选择器；现状 100% 通过。
对于 `refrigeration` 整对象订阅的"过订阅"问题，§2.1 方案 A（Context 共享 derived 值）比 useShallow 更直接，**没必要**额外引 reselect。

### 5.2 不要换掉 recharts

虽然 recharts 422 KB raw / 120 KB gzip 是首屏第二大 chunk，但：
- 项目已经把所有 LineChart/BarChart 都标了 `isAnimationActive={false}` ✅；
- 已经用 `SafeResponsiveContainer` 解决 ResponsiveContainer 第一帧 -1 测量 bug；
- 迁移到 `uplot` 或自绘 SVG，工作量 1-2 周，回归风险高。

只在以下场景才考虑迁移：(a) 用户反馈"波形卡顿"，且已把 simulateCycle 共享、WaveformPanel lazy 都做完仍卡；(b) 移动端目标。

### 5.3 不要把 `step()` 推送频率从 60 fps 改低

`step(dt = 0.016)` 是物理仿真时钟。把它降到 30Hz 会让动画掉感，**FOC 教学的核心交互价值会折损**。

### 5.4 不要给 `useSimulationStore` 加 zustand `subscribeWithSelector` middleware 做"非订阅式读"

主时钟在 `AppShell.tsx:22` 已经用 `useSimulationStore.getState()` 而不是 hook 订阅；其他地方按选择器订阅是正确分工。无需 middleware。

### 5.5 不要 inline 关键 CSS

`dist/index.html` 982 B、CSS 31 KB raw / 6.6 KB gzip——Web 端 FCP 收益 50-150 ms，Electron file:// 几乎 0 RTT 收益，**优先级低于 §B1 / §B2**。

---

## 6. 度量与监控建议

1. 在 `vite.config.ts` 加 `rollup-plugin-visualizer`（dev only），`npm run build` 后看 `dist/stats.html` 树图；
2. 引入 `size-limit` 或 §B1-B5 改完后写 `scripts/check-bundle-budget.mjs`，挂到 `release:audit`；
3. React DevTools Profiler 录"切到 16 号 → 拖 EEV 滑块 5s"过程，验证 §2.1 方案 A 收益（应看到 simulateCycle 6 处合并为 1 处）；
4. 用 Chrome Performance 抓 60s "运行 + 拖滑块" 火焰图，关注 `simulateCycle` / `generateThreePhaseCurrent` / SVG layout 三个热点是否符合预期（每帧 ≤ 4 ms 帧预算的 25%）。
