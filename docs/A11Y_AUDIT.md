# A11Y Audit · 滑块 / 拖拽 SVG / 状态指示 / 快捷键

> 审查范围：`src/components/`、`src/modules/`
> 审查标准：CLAUDE.md 中的"a11y 全局约束"
>   - `<input type="range">` 必须带完整 5 个 aria-*
>   - 可拖拽 SVG 必须 `tabIndex={0}` + `role="application"` + `aria-label` + `onKeyDown`
>   - warn / fault / measure 状态走"颜色 + 形状 + sr-only"三通道
> 审查日期：2026-05-17
> 基线测试：`npm test` → 196 通过 / 8 失败（失败全部位于 `src/simulation/math/__tests__/`，与本次 a11y 修复无关，math 文件不在改动范围内）

---

## 1. 范围概要

| 类别 | 扫描文件数 | 命中问题文件数 | 实际改动文件数 |
|------|------|------|------|
| `<input type="range">` | 2 | 1 | 1 |
| 可拖拽 / 可点击 SVG | 7 | 1 | 1 |
| 状态颜色指示（warn / fault / measure） | 26 | 6 | 6 |
| GlobalKeybindings 新增快捷键 | 1 | n/a | 2 (新增) |
| **合计** | **36** | **8** | **9** |

> 已被 CLAUDE.md 明确禁止改动的 `src/components/charts/MotorAnatomy2D.tsx` 未审查，按动画 agent 并行工作约定保持原状。

---

## 2. `<input type="range">` 修复明细

| 文件 | 元素类型 | 原问题 | 修复方式 | 行号 |
|------|--------|------|------|------|
| `src/modules/hfi-sensorless/HfiSignalChainCard.tsx` | `<input type="range">` "假定角度估计误差" | 仅有 `aria-label`，缺 `aria-valuemin`/`max`/`now`/`text` 四个属性 | 添加 `aria-valuemin={0}`、`aria-valuemax={30}`、`aria-valuenow={thetaErrDeg}`、`aria-valuetext={\`${thetaErrDeg.toFixed(0)}°\`}`，aria-label 补单位 | 81–85 |
| `src/components/ui/Slider.tsx` | 通用 `<input type="range">` | 已合规（全 5 个 aria-* 齐全） | 无需修改 | 29–34 |

> 通过 `Grep type="range"` 共找到 2 个原始 `<input>`；其余 100+ 处 Slider 都走 `Slider.tsx` 封装，自动具备 5 个 aria-* 属性。

---

## 3. 可拖拽 / 可点击 SVG 修复明细

| 文件 | 元素类型 | 原问题 | 修复方式 | 行号 |
|------|--------|------|------|------|
| `src/components/workshop/SystemSchematic.tsx` | `<g>` BlockShell（搭积木 6 个块壳） | 仅 `onClick` + `cursor:pointer`，无 `tabIndex` / `role` / `aria-label` / `onKeyDown`，键盘用户完全无法操作 | 添加 `tabIndex={0}` + `role="button"` + `aria-pressed={active}` + 拼装 `aria-label={title + statusSr}`（active/fault/warn 三态语义化）+ `onKeyDown` 处理 Enter/Space | 282–303 |
| `src/components/charts/VectorPlane.tsx` | `<svg>` αβ 拖拽矢量 | 已合规（参考实现） | 无需修改 | 86–105 |
| `src/components/charts/SpaceVectorHexagon.tsx` | `<svg>` SVPWM 拖拽矢量 | 已合规 | 无需修改 | 124–143 |
| `src/components/charts/PhDiagram.tsx` | `<circle>` 状态点 [1]/[3] 拖动 | 已合规（点级 tabIndex / role / aria-label / onKeyDown） | 无需修改 | 274–284 |
| `src/modules/field-weakening/FieldWeakeningModule.tsx` | `<svg>` Id-Iq 工作点拖动 | 已合规 | 无需修改 | 174–191 |
| `src/components/workshop/AssemblyWorkshop.tsx` | `<button draggable>` 各 chip | 已是 `<button>`，键盘可触发；拖拽是可选增强 | 无需修改 | 522–544 |
| `src/components/layout/GuidedExperimentBar.tsx` | 所有交互均是 `<button>` | 无问题 | 无需修改 | — |

---

## 4. 状态颜色（warn / fault / measure）三通道修复明细

| 文件 | 元素类型 | 原问题 | 修复方式 | 行号 |
|------|--------|------|------|------|
| `src/modules/hfi-sensorless/HfiSignalChainCard.tsx` | `Metric` 卡片（凸极比 / 误差信号 / 解调 SNR） | 仅 `text-accent-{fault/warn/measure}` 着色 | 引入 `lucide-react` 图标（CheckCircle2 / AlertTriangle / AlertOctagon）+ `<span className="sr-only">{srLabel}</span>` | 108–125 |
| `src/modules/refrigeration-bench/EnvelopeProbeCard.tsx` | `EnvelopeCell`（包线 4 单元格） | 颜色 + sr-only 双通道，缺形状 | 增加状态对应图标（fault=⬢ AlertOctagon / warn=△ AlertTriangle / measure=✓ CheckCircle2 / primary 无） | 64–82 |
| `src/modules/refrigeration-bench/EevControlCard.tsx` | 头部 metric（稳态偏差 / 收敛时间） | 仅颜色区分 measure/warn/fault | IIFE 包装，加图标 + sr-only "收敛/偏差偏大/严重偏离" 等 | 86–122 |
| `src/modules/refrigeration-bench/EnergyFlowCard.tsx` | 总效率 / PFC 损耗 / FOC 损耗 metric | 仅颜色 | 加图标 + sr-only；损耗 metric 用 Zap 图标统一表达"能耗" | 54–88 |
| `src/modules/refrigeration-bench/SnapshotComparePanel.tsx` | 最高 COP 列单元 | 仅 `text-accent-measure font-semibold` | 加 Crown 图标 + sr-only "本组最高" | 274–296 |
| `src/modules/refrigeration-bench/SystemFaultPanel.tsx` | 偏差列（5 行 × N 故障） | 颜色字符串 `deltaColor()` 输出 | 新增 `<DeltaCell>` 组件：根据 `delta` 符号选 ArrowUpRight / ArrowDownRight / Minus 图标 + sr-only "异常偏差/正向偏差/基本无变化" | 53–70, 252 |
| `src/components/charts/DeadTimeWaveform.tsx` | 平均误差电压 / 占额定百分比 | 仅颜色 | IIFE 包装，加图标 + sr-only "正常/偏大/严重" | 23–57 |

> 参考实现：`BenchKpiStrip.tsx::KpiTile`（lucide icon + sr-only + sparkline 三通道）、`EnvelopeCell`（修复前）、`AnnualPerformanceCard::ratingGlyph`。

---

## 5. GlobalKeybindings 新增快捷键

| 键位 | 类别 | 用途 | 实现 |
|------|------|------|------|
| `m` | 布局 | 切换深色 / 明色主题（之前需鼠标点击右上 ThemeToggle 按钮） | 调 `useThemeStore.toggle()` |
| `t` | 模式 | 在 教学 / 实验 模式之间切换（之前需通过参数面板顶部 chips） | 读 `simulationStore.mode` → 调 `setMode()` 切到另一态 |

附带改动：
- `src/utils/useKeyboardShortcuts.ts` 第 12 行：`Shortcut['category']` 联合类型新增 `'模式'`。
- `src/components/layout/KeyHelpOverlay.tsx` 第 11 行：`CATEGORY_ORDER` 新增 `'模式'` 让 `?` 帮助叠层正确分组渲染。

两个键都未与现有 `Space / r / s / f / ←→ / 1-9 / 0 / j / k / ?` 冲突，且无修饰键（Shift 对字母字符不计入修饰，与 `useKeyboardShortcuts::eventLookup` 既有行为一致）。

---

## 6. 验证清单

| 命令 | 结果 | 备注 |
|------|------|------|
| `npm test` | 196 通过 / 8 失败 | 失败全部位于 `src/simulation/math/__tests__/`（vaporCycle / svpwm / observer / inverterModel），与 a11y 修复无关；math 文件按 CLAUDE.md 约定不在本次改动范围 |
| `npm run build` | 失败（pre-existing） | TS 错误集中在 `src/components/three/*`（缺 R3F 类型）+ `src/content/challenges/*`（旧 type cast）+ `src/content/walkthroughs/assembly-workshop.ts`（types.ts 缺 'assembly-workshop'），与本次 a11y 改动无关 |
| `npm run verify` | 通过（61 必需文件，16 路由模块） | — |

> 上述 build 与 test 的 pre-existing 失败在动手前就存在（checkpoint 历史多 agent 留下的不一致状态），本次仅做 a11y 范围内的修复，未触及 math、types 或 three 目录。

---

## 7. 后续建议

1. 桥接 `<DeltaCell>` 模式到所有 SystemFaultPanel 之外仍仅靠颜色的故障对比表（若日后扩展）。
2. `KpiTile` 的 `sparkDash` "实线/虚线/点线" 也是优秀的形状通道范例，可推广到 BenchScope.tsx 的"已冻结"指示。
3. 当前 `?` 帮助叠层只展示了 `'布局' / '模式' / '导航' / '帮助' / '运行控制'` 五类，未来如增加 `g` 聚焦引导栏、`/` 全局搜索、`l` 锁定参数等，复用 `Shortcut.category` 直接扩展即可，无需改 Overlay 组件。
