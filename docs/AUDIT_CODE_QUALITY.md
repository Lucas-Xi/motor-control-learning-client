# 代码质量审查（汇编版）

> 上一轮 agent 两次超时；本文档由 LLM 直接读源 + grep 验证后人工汇编。每条发现可重现。

## 1. 死代码

| 文件 | 引用搜索 | 建议 |
|---|---|---|
| `src/components/three/Motor3D.tsx` | `grep -rln "Motor3D" src` → 仅自身 | **删** |
| `src/components/three/MagneticField3D.tsx` | `grep` → 仅自身 | **删** |
| `src/components/three/RotorFluxScene.tsx` | `grep` → 仅自身 | **删** |

连带 `@react-three/fiber` / `@react-three/drei` / `three` 三个 npm 依赖 ~5MB node_modules + 178KB build artifact 全是垃圾费用。注意 `Inverter3D` **有引用**（FOCFlow + Inverter 模块），不要误删。

清理 PR：删 3 个 tsx + `npm uninstall three @react-three/fiber @react-three/drei` + 修 `vite.config.ts` 的 `manualChunks.three` 字段。

## 2. TypeScript 严格度

`tsconfig.app.json` 已启 `"strict": true`。**未启** `noUncheckedIndexedAccess` —— 项目中数组下标访问如 `pts[i].x` 没有 undefined 安全保护，建议下一版加。

`grep "as unknown as|as any|ts-ignore" src`：

| 文件:行 | 模式 | 评估 |
|---|---|---|
| `utils/useRafThrottle.ts:16,35` | `as unknown as T` | 不可避免（泛型函数擦除）✓ |
| `components/layout/ParameterPanel.tsx:185-186` | `as unknown as Record<string, Record<...>>` | schema-driven slice 读写的代价。**可改进**：把 sliceKey/updateKey 改成强类型 union，或引入 `slices` Record 中心化。**ROI 一般**，因为这是唯一一处。 |

无 `as any`、无 `@ts-ignore`、无 `@ts-expect-error`。整体严格度不错。

## 3. React 反模式 Top 5

1. **`setSparkTick(t+1)` 强制 commit hack** —— `BenchKpiStrip.tsx` + `RefrigerationBenchModule.tsx` 的 MetricsProbe 用 ref 累积历史，再 setState 强 commit。问题：跳过了 React 自然 diff，可能造成 stale closure。**修法**：改用 `setHist({ ...prev, cop: [...prev.cop.slice(-39), newCop] })` 让数组本身做 immutable 更新。

2. **simulateCycle 在 bench 模块被 6-7 处 `useMemo` 重复算**（19 处 `simulateCycle` 出现）：`PhPanel` / `SchematicPanel` / `MetricsProbe` / `BenchKpiStrip` / `EnergyFlowCard` / `EnvelopeProbeCard` / `SystemFaultPanel` 各自独立调一次。同一份输入算 6 次。**修法**：抽 `useBenchCycle()` hook 放进 React Context，或集中到一个 selector，让 6 个消费方共享同一份 result。性能审计已估算可省 ~1.5ms/帧。

3. **`useEffect` 用变化值作为 trigger 但 setState 写入 ref**（同 #1）：跳过依赖追踪，HMR 下易孤儿。

4. **没有 `useCallback` 包裹 store action 回调**（多处 onChange={(v) => update({key: v})}）—— 子组件每次都拿到新函数，下游 memo 失效。但当前下游 Slider 没 React.memo，所以暂无 perf 影响。**优先级低**，将来加 memo 时再处理。

5. **`location.reload()` 在 ThemeApplier 等组件未发现，OK**。但 `RefrigerationBenchModule.tsx` 内 `handleDrag` 是普通函数（非 useCallback），每次 re-render 重新创建。drag 频率高时会让 `PhDiagram` 不必要重渲。**修法**：用 `useCallback([refrig.refrigerant, update])`。

## 4. 抽象建议

### A. `useBenchCycle()` hook

```ts
// src/modules/refrigeration-bench/useBenchCycle.ts
export function useBenchCycle() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  return useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te, Tc: refrig.Tc,
    superheatK: refrig.superheatK, subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc, clearanceRatio: refrig.clearanceRatio,
    rpm: motor.rpm > 100 ? motor.rpm : 3000,
    isentropicEff: refrig.isentropicEff, eevOpening: refrig.eevOpening,
  }), [refrig, motor.rpm]);
}
```

6 处调用方改为 `const result = useBenchCycle();` 一行。React 19 自动跨组件共享同 selector 结果时不重算（如果是同一个 store + 同一个 deps）。如果跨 Suspense / Context 边界仍重算，则升级为 Context Provider 模式。

### B. `<MetricTile />` 组件归并

当前 `BenchKpiStrip.KpiTile`（4 列大字 + sparkline + 状态色）和 `RefrigerationBenchModule.MetricRow`（label + sparkline + 数值）结构相近，可抽通用 `<MetricTile size="lg" | "sm" />`。约 60 行重复 → 30 行通用 + 10 行 props。

### C. `useCycleHistory(value, capacity = 40)` hook

把"累积最近 N 个采样到 ref"的逻辑（在 BenchKpiStrip / MetricsProbe / BenchScope 都有）抽到 hook：

```ts
export function useCycleHistory<T extends number>(value: T, capacity = 40): T[] {
  const ref = useRef<T[]>([]);
  useEffect(() => {
    ref.current.push(value);
    if (ref.current.length > capacity) ref.current.shift();
  }, [value]);
  return ref.current;
}
```

省 setSparkTick hack。

## 5. 测试覆盖建议

`src/simulation/math/` 是项目的"信任根基"，但目前**只有** `scripts/verify-fault-waves.mjs` 一个回归脚本。建议加 vitest 单测：

| 优先级 | 文件 | 测什么 |
|---|---|---|
| 高 | `transforms.ts` | Clarke / Park / 反 Park 对称性（pkg → unpkg 还原误差） |
| 高 | `vaporCycle.ts` | 经典工况（R-32, Te=7, Tc=45）下 COP / Qc / Wcomp 与教科书参考值 ±5% |
| 高 | `svpwm.ts` | 6 个扇区边界 + 过调制 m=1 临界 + T1+T2+T0=Ts 守恒 |
| 中 | `refrigerantProps.ts` | pSat(0°C, R32) ≈ 0.813 MPa；tSat(pSat(T))=T 反函数闭环 |
| 中 | `pid.ts` | anti-windup 边界 + 阶跃响应稳定性 |

**领域审查发现的 5 处严重 bug 必须先加单测锁定再修**，否则修一个出三个。

## 6. 最小重构 PR 序列

按 30 分钟/PR 切分：

1. **PR-clean-three**：删 3 个 3D 孤儿组件 + 修 vite.config.ts manualChunks + uninstall 三个 npm 包。-178KB build + 5MB node_modules。风险低。
2. **PR-useBenchCycle**：新增 hook + 6 处 bench 卡片改为消费 hook。验收：sliders 拖动时 perf timeline 显示 simulateCycle 只算一次。
3. **PR-useCycleHistory**：抽 hook 替换三处累积逻辑，移除 setSparkTick hack。
4. **PR-vitest-math**：加 5 个数学层 vitest 文件，覆盖 transforms / vaporCycle / svpwm / refrigerantProps / pid。回归网兜。
5. **PR-MetricTile**：抽通用 MetricTile，归并 KpiTile + MetricRow。视觉零变化但代码量减 30+ 行。

每个 PR 独立可 ship，不依赖前一个完成。

## 7. 不应改的

- `as unknown as` in `useRafThrottle.ts` —— 泛型擦除限制，是 TS 已知边界
- `ParameterPanel` schema-driven slice 访问的 cast —— 替代方案（强类型 union）会让 schema 文件膨胀 2-3 倍，ROI 不合算
- 16 模块各自的 `useMemo(...)` 计算 —— 跨模块不重叠，不需要全局共享
