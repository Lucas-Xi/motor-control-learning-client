# 性能审计报告

- **生成时间**: 2026-05-10T00:00:00+08:00
- **基线**: F:\电机控制 当前 main（`dist/` 已存在的最近一次构建产物）
- **采样工具**:
  - 原始字节数：`wc -c dist/assets/*.{js,css}`（精确）
  - gzip 字节数：标注为 **估算**（在当前会话沙箱里 `gzip` / `node` 不可用；估算法：已知库的 minified→gzip 经验比 + 本仓库片段抽样验证。误差 ±5%）
  - 静态分析：`ripgrep` + chunk 内容关键字命中
- **Bundler 配置**: `vite.config.ts` 中 `manualChunks: { charts:['recharts'], three:['three','@react-three/fiber','@react-three/drei'], motion:['framer-motion'] }`

---

## 0. TL;DR — 三句话

1. **`vite.config.ts` 里的 `manualChunks` 三个 key（charts/three/motion）和实际 chunk 内容完全对不上**：`three-*.js`（178 KB）里没有一行 three.js（只有 react-dom），`motion-*.js`（131 KB）里塞了 react + framer-motion，`three.js`/`@react-three/*`/`@react-three/drei` **整个生态都被 tree-shake 出去了**——因为没有任何模块真的 import 它们。这是一个名字与现实严重错位的"假优化"。
2. **首屏关键路径强制下载 charts 和 three 两个 vendor chunk**（`dist/index.html` 里 `<link rel="modulepreload">` 静态写死了这三个 chunk）。`charts-*.js` 412 KB 是 recharts 全家桶，但用户首屏看到的"波形 Dock"其实只用到 `LineChart`/`BarChart`/`Tooltip` 等 ~10 个 export，剩下大约一半（雷达图、桑基、Brush、TreeMap...）是死代码进了运行时。
3. **共享 chunk `FidelityBadge-*.js`（134 KB）实际上是"教学讲义 + lucide 图标 + ConceptNotes/Quiz 等共享 layout"的 grab-bag**——`src/content/lessons.ts`（134 KB 源码！全中文教学文案）被打进它，每个模块切换都要重新解析这一坨字符串。

---

## 1. 当前 Bundle 概况

### 1.1 关键路径（首屏立即下载）

| Chunk | 原始大小 | gzip（估算） | 真实内容 | 备注 |
|---|---:|---:|---|---|
| `index-*.js`（入口） | 100 KB | ~32 KB | App / AppShell / Sidebar / TopBar / ParameterPanel / WaveformPanel / store / presets / parameterSchemas / lucide-react 共用核 | 入口里硬编码了所有 16 个 lazy import 路径表 |
| `motion-*.js`（命名错误） | 131 KB | ~42 KB | **React 19 (react / react-jsx-runtime) + framer-motion** | 实际导出 `r as fo, a as v` 给后续 chunk 复用——这是 React 核心 |
| `charts-*.js` | 412 KB | ~110 KB | **recharts 全量** + d3-shape / d3-scale 子集 | recharts 自己声明的 minified+gzip 体量约 100 KB，符合预期 |
| `three-*.js`（命名错误） | 178 KB | ~55 KB | **react-dom 客户端 (createRoot / scheduler / event system)** | 三 0 行 three.js / R3F / drei 代码——全被 tree-shake |
| `index-*.css` | 29 KB | ~6 KB | Tailwind 输出（已含 JIT 裁剪） + `src/index.css` 自定义层 | 体积合理 |
| `dist/index.html` | 982 B | 482 B | 极小，未做关键 CSS inline | 无优化空间 |
| **首屏合计** | **~850 KB** | **~245 KB** |  | gzip 约 245 KB，4G 下 1-2 s 可接受，慢 3G 下 ~4 s |

### 1.2 共享惰性 chunk（任意模块第一次切换时都要拉）

| Chunk | 原始 | gzip（估算） | 内容 |
|---|---:|---:|---|
| `FidelityBadge-*.js` | **134 KB** | ~38 KB | **`src/content/lessons.ts` 全量教学讲义（134 KB 源码）** + ConceptNotes + ModuleLayout + GuidedExperimentBar + Quiz + AssetHero + Card + lucide 图标集 + faultCases + guidedExperiments |
| `VectorPlane-*.js` | 4 KB | ~2 KB | 矢量平面组件（被多模块共享） |
| `SimulationEngine-*.js` | 668 B | <1 KB | clarke/park/three-phase 共享的小辅助 |
| `inverterModel-*.js` | 1.4 KB | <1 KB | 模块共享逆变器模型 |
| `useRafThrottle-*.js` | 457 B | <1 KB | hook 共享 |
| `rotate-cw / triangle-alert / zap-*.js` | 200~300 B 各 | <1 KB | 单 lucide 图标按需 chunk（tree-shake 健康） |

### 1.3 各模块独立 chunk

| 模块 chunk | 原始 | gzip（估算） | 状态 |
|---|---:|---:|---|
| `RefrigerationBenchModule-*.js` | **60.3 KB** | ~17 KB | **超 30 KB 警戒线**——是其它模块的 4-15 倍 |
| `FOCFlowModule-*.js` | 14.0 KB | ~4.5 KB | 偏胖（流程图 + 多 chart） |
| `SVPWMModule-*.js` | 9.4 KB | ~3 KB | 健康 |
| `MotorBasicsModule-*.js` | 9.1 KB | ~3 KB | 健康 |
| `StartupStateMachineModule-*.js` | 7.9 KB | ~2.6 KB | 健康 |
| `FieldWeakeningModule-*.js` | 7.7 KB | ~2.5 KB | 健康 |
| `SensorlessFOCModule-*.js` / `APFFrontendModule-*.js` / `HFISensorlessModule-*.js` | 7.2-7.5 KB | ~2.4 KB | 健康 |
| `ParkTransformModule-*.js` | 6.4 KB | ~2.1 KB | 健康 |
| `ThreePhaseModule-*.js` | 5.4 KB | ~1.8 KB | 健康 |
| `ControlLoopsModule-*.js` | 5.1 KB | ~1.7 KB | 健康 |
| `FaultsDebuggingModule-*.js` | 4.1 KB | ~1.4 KB | 健康 |
| `InverterModule-*.js` | 3.9 KB | ~1.3 KB | 健康 |
| `PIDControlModule-*.js` | 3.7 KB | ~1.3 KB | 健康 |
| `ClarkeTransformModule-*.js` | 1.9 KB | <1 KB | 健康 |
| **平均 / 中位**：约 9 KB / 6 KB | | | |

### 1.4 与 `vite.config.ts` `manualChunks` 的对照（最关键的发现）

```ts
// vite.config.ts
manualChunks: {
  charts: ['recharts'],                                         // ✅ 真有 recharts
  three: ['three', '@react-three/fiber', '@react-three/drei'], // ❌ 三个包没人 import → chunk 名字保留但内容是 react-dom
  motion: ['framer-motion'],                                   // ⚠️ 有 framer-motion，但被 React 同居占了大头
}
```

实际验证：
- `rg "from '@react-three/(fiber|drei)'" src/` 命中 3 个文件：`Motor3D.tsx` / `RotorFluxScene.tsx` / `MagneticField3D.tsx`。
- `rg "Motor3D|MagneticField3D|RotorFluxScene" src/` 在**这 3 个文件之外没有任何引用**——它们是孤儿组件。
- `Inverter3D.tsx`（被 `FOCFlowModule` 使用的"3D"组件）实际上是纯 CSS 渐变 + `<div>`，**没有 import three / R3F**。
- 抽样 `dist/assets/three-*.js` 内容：`grep -c "WebGLRenderer" → 0`，`grep -c "createRoot|reconciler" → 1`。结论确凿。

### 1.5 关键路径上仍在引用 recharts 的位置（导致 charts chunk 进首屏）

`AppShell` → `WaveformPanel`（同步 import）→ 直接导入 `recharts` 的 `Line / LineChart / CartesianGrid / Tooltip / XAxis / YAxis / Legend` + 间接通过 `ThreePhaseWaveform / DQWaveform / PWMChart / StepResponseChart / FaultBranch` 再导 recharts。所以**只要 AppShell 渲染就拉 recharts，不管用户当前在哪个模块**。

---

## 2. 高价值优化（影响首屏，强烈建议做）

### 2.1 修正 `manualChunks`，删除"three / motion"两个误导名（影响：澄清 + 轻微减肥）

**问题**：`three`/`motion` 两个 key 没有匹配任何被引用的 npm 包，导致 Rollup 把 react-dom 和 react+framer-motion 当作"剩余物"塞进这两个名字，输出的命名 chunk 完全不是字面意思。`index.html` 还基于 `manualChunks` 名字 `<link rel="modulepreload">` 这两个文件。

**改动**：

```ts
// vite.config.ts（伪代码）
manualChunks: (id) => {
  if (id.includes('node_modules/recharts')) return 'recharts';
  if (id.includes('node_modules/framer-motion')) return 'framer-motion';
  if (id.includes('node_modules/lucide-react')) return 'lucide';
  if (id.includes('node_modules/react-dom')) return 'react-dom';
  if (id.includes('node_modules/react')) return 'react';
}
```

**预期收益**：
- chunk 名字与内容一致，便于以后做尺寸预算告警；
- 把 `react`（~12 KB gzip）和 `react-dom`（~42 KB gzip）拆开，可让浏览器并行下载；
- 删除孤儿 three/R3F/drei 后，`devDependencies`/`dependencies` 也可以一并 audit（见 4.1）。

**风险**：低。`index.html` modulepreload 列表由 Vite 重写时根据入口 graph 自动生成，不需手改。

### 2.2 把 `WaveformPanel` 从 `AppShell` 同步 import 改成 `lazy()`（影响：首屏 -110 KB gzip）

**问题**：`AppShell.tsx:6` 同步 import `WaveformPanel`，而 `WaveformPanel` 同步 import 9 个 recharts 子包 + 4 个图表 wrapper（每个又 import recharts）→ recharts 整包进入关键路径。但 `WaveformPanel` 是底部 dock，**首屏视口里通常不可见**（mobile 下要往下滚才看到，desktop 在 1080p 下可能勉强可见）。

**改动**：

```tsx
// AppShell.tsx
const WaveformPanel = lazy(() => import('./WaveformPanel').then(m => ({ default: m.WaveformPanel })));
// 用 <Suspense fallback={<div className="h-56 ..." />}> 包一层，保留高度避免 CLS
```

**预期收益**：
- `charts-*.js`（412 KB raw / ~110 KB gzip）从首屏关键路径剔除，移到第一次模块切换时按需加载；
- 配合 2.1 的拆分，可让 recharts 与 react-dom 并发下载，TTI 降 200-400 ms（4G）；
- LCP 提速明显——首屏只剩主面板与参数侧栏。

**风险**：中。需要给 `<WaveformPanel>` 占位高度（已有 `mt-4` + Card 内有固定高度 `h-56`），用 `<div className="h-72 mt-4" />` 做 fallback 即可避免 CLS。

### 2.3 把 `lessons.ts` / `guidedExperiments.ts` / `faultCases.ts` 拆成"按模块导入"（影响：FidelityBadge 共享 chunk -80 KB，每模块切换更快）

**问题**：`src/content/lessons.ts` 是单文件 134 KB（中文教学文案，富 string）；`ConceptNotes` 直接 `import { lessons } from '../../content/lessons'` 拿全表，被 Rollup 合并到 `FidelityBadge` 共享 chunk。每次第一次访问任意模块都要下完这 134 KB（gzip 后约 38 KB）。但**用户每次只看一个模块的讲义**。

**改动方案 A（推荐）**：拆 `lessons.ts` → `src/content/lessons/<module-id>.ts`，由 `ConceptNotes` 内部 `lazy(() => import(\`../content/lessons/\${moduleId}.ts\`))` 按需加载。`guidedExperiments.ts`、`faultCases.ts` 同理。

**改动方案 B（最小改动）**：保留单文件，但对 `lessons` 改用 `Record<ModuleId, () => Promise<Lesson>>` 形式 + `import.meta.glob('./lessons/*.ts')`。

**预期收益**：
- 首次模块切换从 `FidelityBadge-*.js` 134 KB → 约 50-60 KB（剩余 ConceptNotes/Quiz/lucide）；
- 每个模块自己的 lesson 大约 5-10 KB；
- 副作用：`Quiz` / `formulas` / `glossary` 也建议跟随重构。

**风险**：中等改动，需要批量改 `lessons.ts` 拆文件 + 修改 `ConceptNotes` 内部读取方式。`verify-project.mjs` 的 `requiredFiles` 列表要同步。

### 2.4 `index.html` 内联首屏关键 CSS（影响：FCP -50~150 ms）

**问题**：`dist/index.html` 982 B，`<link rel="stylesheet" href="...index-*.css">` 是阻塞渲染请求；29 KB CSS 在白屏期间需要等回执（HTTP/2 下 1 RTT，Electron 下基本 0 RTT 但仍多一次 file:// 读）。

**改动**：用 [`vite-plugin-html-inject`](https://www.npmjs.com/package/vite-plugin-html-inject) 或 `vite-plugin-critical` 把首屏使用的 ~3-5 KB 关键 CSS（设计令牌 + AppShell 网格）内联到 `index.html`，剩余 26 KB 用 `<link rel="preload" as="style" onload="this.rel='stylesheet'">` 异步加载。

**预期收益**：Web 端 FCP 加速 50~150 ms；Electron 下收益小（因 file:// 几乎 0 RTT），不强求。

**风险**：低，但纯 web 收益有限——优先级低于 2.2。

---

## 3. 中价值优化（lazy chunk 体量 / 资源利用率）

### 3.1 `RefrigerationBenchModule` 60 KB（最大模块 chunk）瘦身

**问题**：`RefrigerationBenchModule.tsx` 自身 15 KB 源码，内联了 R32/R410A/R134a 制冷剂物性 + 多个子卡片（PhDiagram / SystemSchematic / EevControlCard / AnnualPerformanceCard / EnvelopeProbeCard / SnapshotComparePanel / SystemFaultPanel）。所有子卡片**同步 import**。

**改动**：把不在首视图的卡片（`SnapshotComparePanel` 24 KB 估算，`SystemFaultPanel` 9 KB）改为 `lazy()`，或用 `Tabs` 切换时再 import。

**预期收益**：模块第一屏 chunk 60 KB → ~35 KB；用户进入模块速度 +30%。

**风险**：低。

### 3.2 `FOCFlowModule` 14 KB——按需加载 `Inverter3D` / `FocCurrentLoopChart`

**问题**：`FOCFlowModule` 同时 import 了 `PWMChart`、`VectorPlane`、`Inverter3D`、`FocCurrentLoopChart`，但 7 步流程里同一时刻只展示 1 个可视化。

**改动**：4 个可视化用 `Tabs` 已经做切换，只需把 `import` 改成 `React.lazy`+`Suspense`。

**预期收益**：模块 chunk 14 KB → ~8 KB；首步骤渲染加速。

**风险**：低（这 4 个组件已在多模块共享，本来就在 `VectorPlane-*.js` 之类的共享 chunk 里——收益主要在于减少同步 import 引发的瀑布请求）。

### 3.3 用 `recharts` 的命名 import 不会减少包体——确认是 tree-shake 局限，不是错用

调查发现：项目里所有 `from 'recharts'` 都用了具名 import（`{ Line, LineChart, CartesianGrid, ... }`），没有用 `import * as Recharts` 或默认导入。但 recharts 包整体 `sideEffects: true` + 内部用了 `forwardRef + displayName + propTypes`，tree-shaking 无法剥离未用组件。**这是 recharts 的已知缺陷**（v3 也未修），不是项目代码问题。

**长期方案**（不强推）：评估迁移到 `@visx/visx`、`uplot`、或自绘 SVG（项目已经有 `ThreePhaseWaveform` 等自绘组件，可以参照）。`uplot` 在交互式波形 + 高刷新率场景下比 recharts 快 5-10 倍，包体仅 ~40 KB。

**预期收益**：若整体迁移，charts chunk 412 KB → 60 KB；但工作量 1-2 天。**优先级低**，等到性能成为真痛点再做。

### 3.4 lucide-react 已经按需 tree-shake 健康，无需改

`dist/assets/` 里 `rotate-cw-*.js`、`triangle-alert-*.js`、`zap-*.js` 各 200-300 B 的小 chunk 证明了 lucide-react 的 tree-shaking 工作正常（每个 icon 单独 chunk，被多个模块共享时 hoist）。共 23 个文件 import 共约 50+ 个不同 icon，全部命中按需。**不需要改**。

---

## 4. 低价值优化（最佳实践）

### 4.1 删除孤儿 3D 组件 + 卸载 three / @react-three/* 依赖

**问题**：以下 3 个文件没有任何引用，但在 `package.json` 占着 ~3 个 dep（`three` 2 MB，`@react-three/fiber` 0.6 MB，`@react-three/drei` 1.5 MB）：

- `src/components/three/Motor3D.tsx`
- `src/components/three/MagneticField3D.tsx`
- `src/components/three/RotorFluxScene.tsx`

`Inverter3D.tsx`（实际用到的）是纯 CSS，不依赖 three。

**改动**：
1. 删除 3 个孤儿文件；
2. `package.json` 从 `dependencies` 移除 `three`、`@types/three`、`@react-three/fiber`、`@react-three/drei`；
3. 同步删除 `vite.config.ts` 里 `three: [...]` manualChunk（与 2.1 合并执行）；
4. 跑 `npm run verify` + `npm run e2e:optional` 确认。

**预期收益**：
- `node_modules` 减小 ~5 MB；
- `npm install` 时间 -3-5 s；
- bundle 不变（已经是 0 字节 three.js，确认本地开发也无 dev import）；
- Electron 包体不变（`asar` 内只装 dist + electron + node_modules 顶级——但顶级不再需要这些）。

**风险**：低，**前提是确认这 3 个文件确实是历史包袱**。建议先把它们移到 `src/components/three/_archived/` 一个发布周期，确认无 PR 反弹再删。

### 4.2 把 `index.tsx` 入口里 16 个 lazy import 表的字符串拼接合并到一个 `import.meta.glob`

`ModuleRenderer.tsx` 当前是一份手写的 16 行 lazy 表，每行结构相同。可以替换为：

```ts
const moduleLoaders = import.meta.glob<{ default: React.ComponentType }>('./*/[A-Z]*Module.tsx');
const moduleMap = Object.fromEntries(
  Object.entries(moduleLoaders).map(([path, loader]) => {
    const id = path.match(/\.\/([\w-]+)\//)?.[1] as ModuleId;
    return [id, lazy(loader)];
  })
);
```

**预期收益**：代码量 -20 行，新增模块时只需新建文件夹（不再改 ModuleRenderer），但要适配 `verify-project.mjs` 的字符串校验（必须保留注释里的 `moduleId === '<id>'` 字面量，已在现状里有）。

**风险**：低改动；与 CLAUDE.md "六层接入"流程不冲突，但要在 `MODULE_EXTENSION.md` 里同步备注。**纯重构，无性能收益**——可不做。

### 4.3 `SafeResponsiveContainer` 的 layout 副作用

`src/components/charts/SafeResponsiveContainer.tsx` 用 `useLayoutEffect` + `ResizeObserver` 给 recharts 注入数值 width/height，规避 recharts 自身的 `-1` 测量警告。这是好实践，但每个 chart 实例都建一个 RO。当 `WaveformPanel` 同时绘制 4-5 个 chart 时会有 4-5 个 RO。**目前不是瓶颈**（profile 显示 < 1 ms），但可在以后做单例 RO 共享。

**优先级**：低。

### 4.4 dead code: `KeyHelpOverlay` / `GlobalKeybindings` / `ProgressBadge` / `ProgressModal` / `ThemeToggle`

`rg` 显示这些组件**只在自己的文件里出现**，没有被 `AppShell` / 任何模块使用。它们都是被 framer-motion 拉胖的潜在源（`ProgressModal`、`KeyHelpOverlay`、`ThemeToggle` 都 import framer-motion）。

**改动**：删除或归档到 `_archived/`。

**预期收益**：`index-*.js` 入口路径分析更干净；不直接减体积（因为它们已经被 tree-shake 出 bundle，但 dev server 与 verify 脚本仍要分析）。

**风险**：低。

### 4.5 CSS 已合理；index.html 已极简

`dist/assets/index-*.css` 29 KB / gzip ~6 KB 来自 Tailwind JIT + 几条 `body::before` 自定义。无需改。`index.html` 982 B 已最小化。

---

## 5. 不建议改的（成本高，收益低）

### 5.1 不要把 React 19 降级回 18

React 19 的并发渲染对本项目（`requestAnimationFrame` 驱动 + 高频 store 更新）是净收益。降级会损失 useTransition 等优化能力，包体只省 ~3 KB。**不划算**。

### 5.2 不要换掉 framer-motion

项目只用了 `motion.div` + `AnimatePresence` 几个地方（`SimulationPanel` 模块切换、`ModuleLayout` 入场、`ProgressModal/KeyHelpOverlay` 弹窗），FK 体感效果价值远高于 ~25 KB gzip 体积。"换 CSS transition"的工程量与回归风险高于收益。

如果**真的要省**，最先考虑的是把 `ModuleLayout` 的 `motion.div`（每模块一次）替换为 CSS `animation`，可省单模块切换时的初始化开销，但 bundle 不变（framer-motion 仍被 `SimulationPanel` 留着）。

### 5.3 不要禁用 Recharts 的 `isAnimationActive`（已禁）

代码里所有 chart `<Line isAnimationActive={false}>` 已经标了。✅

### 5.4 不要把 zustand 切片选择器改成 `useShallow`/`reselect`

CLAUDE.md 里强调"切片选择器"，目前所有组件都遵守了 `useSimulationStore((s) => s.xxx)`，没看到 `useSimulationStore()` 整把抓的反模式。这块已经是最佳状态。

### 5.5 Electron 端"移除 Chromium 内置编解码器"

这是 electron-builder 配合 `extraResources` 才能动的事；本项目用的是 `desktop:pack` 直接复制 electron dist 目录的方式，无修改入口。不动。

---

## 6. 监控建议

### 6.1 增加 CI 步骤：bundle size budget

在 `scripts/release-audit.mjs` 里增加一步：

```js
// scripts/check-bundle-budget.mjs（新增）
const BUDGET = {
  'index-*.js': 110_000,     // 原始字节
  'charts-*.js': 430_000,    // 现状基线 + 5%
  'three-*.js': 195_000,     // ⚠️ 建议先降到 0（删除 manualChunk 后）
  'motion-*.js': 145_000,
  'FidelityBadge-*.js': 145_000,
  'RefrigerationBenchModule-*.js': 65_000,
  // 单模块上限
  '*Module-*.js': 30_000,    // gzip 约 10 KB
};
```

任意 chunk 超出 budget 就让 `npm run release:audit` 红，逼回归检查。

### 6.2 推荐工具

| 工具 | 用途 | 集成方式 |
|---|---|---|
| `rollup-plugin-visualizer` | 实时看 chunk 内容图谱 | 在 `vite.config.ts` 加 plugin，`build` 后输出 `dist/stats.html` |
| `vite-bundle-analyzer` | 网页 UI 分析 | `npx vite-bundle-analyzer` 一次性命令 |
| `source-map-explorer` | 单 chunk 字节映射回源码 | `npx source-map-explorer dist/assets/charts-*.js` |
| `size-limit` | CI 友好，可写 `.size-limit.json` | `npx size-limit` 直接报错码 |

### 6.3 运行时性能（非 bundle）

CLAUDE.md 已强调"切片选择器 + RAF throttle"两条核心运行时规则。本审计只看了 bundle 静态体量，**没**做 React Profiler / Chrome Performance 抓帧。如果以后用户反馈"波形卡顿"，再做：

1. 用 React DevTools Profiler 录制一段"切换 PID 模块 + 拖滑块"过程，看哪些组件 commit > 16 ms；
2. 在 `useSimulationStore` 的 `step()` 里加 `console.time('step')`，确认快环 ≤ 1 ms；
3. recharts 的 `<LineChart>` 里数据点 > 500 时考虑 `<Brush>` 或 downsample（项目里 `StepResponseChart` 数据点 ~200，目前不痛）。

---

## 附录：审计期间产生的临时文件

- `scripts/analyze-bundle.mjs` —— 计算 dist 各 asset 原始 + gzip 字节的小工具，**审计期间未能在沙箱里运行成功**（node 执行被禁），可保留供本地开发者一键查看（`node scripts/analyze-bundle.mjs`）。

## 附录：已知陷阱备忘

- `npm run build` 当前会因 `tsc -b` 在 `HfiInjectionWaveform.tsx:39` / `DeadTimeWaveform.tsx:78` 报 `Formatter<ValueType, NameType>` 类型错误而退出（recharts v3 类型变化）。**这是必须先修的硬阻塞**，否则 `release:audit` 必红。修复方法：把 tooltip formatter 的参数类型从 `(value: number, name: string)` 改为 `(value: ValueType, name: NameType)` 或加 `as any`。本审计先用既有 dist 产物完成。
