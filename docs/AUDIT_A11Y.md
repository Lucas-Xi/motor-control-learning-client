# 无障碍审查报告

> 审查范围：F:\电机控制（深色仪表盘 + 16 个学习模块）
> 工具链：Playwright（Chromium）+ axe-core 4.10.2（CDN 注入）+ 静态代码审查
> 测试脚本：`tests/e2e/a11y.spec.ts` — 已加入仓库
> 原始结果：`tmp/a11y-results.json`、`tmp/a11y-keyboard.json`
> 审查日期：2026-05-10

## 0. 总评

| 维度 | 评分 | 备注 |
|------|------|------|
| ARIA / 语义结构 | 中 | 6 个核心 SVG 已有 role/aria-label，但 ~8 个 SVG 没有；landmark 没有 aria-label；form input 100% 缺 aria-label |
| 键盘导航 | 中上 | 全局快捷键扎实，Tab 顺序合理，但拖拽可视化无键盘替代，焦点环全部走浏览器默认 |
| 色彩对比 | 不达标 | `text-ink-muted` 在所有深色背景上对比度 3.11–3.80，未达 WCAG AA 4.5:1（这是项目里最高频违规） |
| 触摸目标 | 不达标 | slider thumb 14×14、ProgressBadge 重置按钮 20×20、ThemeToggle 32×32 均 < 44×44 |
| 动效降级 | 不支持 | 全项目 0 处 `prefers-reduced-motion` 处理；framer-motion + SVG `<animate>` 强制播放 |
| 屏幕阅读器 | 中下 | 缺 aria-live；运行/暂停状态、当前值变化都不会被朗读 |

---

## 1. 自动化扫描结果（axe-core 4.10.2）

对 6 个代表性模块（覆盖纯 UI、滑块密集、SVG 密集、拖拽、台架）注入 axe.run 跑全套 WCAG 2.0/2.1 AA + best-practice 规则。

| 模块 | critical | serious | moderate | minor | 唯一违规 ID |
|------|---------:|--------:|---------:|------:|-------------|
| 01 电机基础      | 5 | 5 | 1 | 0 | label, color-contrast, landmark-unique |
| 03 Clarke 变换   | 2 | 5 | 1 | 0 | label, color-contrast, landmark-unique |
| 05 PID 控制      | 5 | 5 | 1 | 0 | label, color-contrast, landmark-unique |
| 07 SVPWM         | 5 | 5 | 2 | 0 | label, color-contrast, landmark-unique, **heading-order** |
| 11 弱磁控制      | 5 | 5 | 1 | 0 | label, color-contrast, landmark-unique |
| 16 制冷台架      | 5 | 5 | 1 | 0 | label, color-contrast, landmark-unique |
| **合计**         | **27** | **30** | **7** | **0** | 4 个唯一规则 |

> 备注：每个模块顶部 `node` 数被裁剪到 5 条，实际全站违规节点数远多于上表。

### 1.1 唯一违规规则（按影响等级）

| 规则 ID | 影响 | WCAG | 出现位置 | 根因 |
|---------|------|------|----------|------|
| `label` | critical | 1.3.1 / 4.1.2 | 全部 input[type=range] | `Slider.tsx` 把 `<span>` 当文字标签放在 `<input>` 旁边，没有 `<label htmlFor>`，也没有 `aria-label/labelledby` |
| `color-contrast` | serious | 1.4.3 | `text-ink-muted` (#5d7793) 文本（caption、stage 编号、子标题、tooltip 提示） | 颜色 token 在 #07111f / #0d1929 / #112c3e 上对比度 3.11–3.80，<4.5 |
| `landmark-unique` | moderate | 1.3.1 | `Sidebar.tsx` 的 `<aside>` 与 `ParameterPanel.tsx` 的 `<aside>` | 两个 `complementary` landmark 都没有 `aria-label`，屏幕阅读器无法区分 |
| `heading-order` | moderate | 1.3.1 | SVPWM `SpaceVectorHexagon` 容器内的 `<h3>` | 模块标题用 `<h1>`、Card 用 `<h2>`，但中间出现 `<h3>` 时父级缺 `<h2>` 包裹 |

### 1.2 axe 已通过的关键规则

`button-name`、`document-title`、`html-has-lang`、`page-has-heading-one`、`region`、`tabindex`、`nested-interactive`、`aria-valid-attr*`、`landmark-one-main` 全部通过 — 项目结构骨架是健全的，问题集中在「细节属性」与「视觉色彩 token」。

---

## 2. 键盘导航

实测脚本：`a11y.spec.ts:keyboard tab navigation`，`tmp/a11y-keyboard.json` 记录前 50 个 Tab 焦点。

### 2.1 Tab 顺序（合理）

实测序列：16 个侧栏模块按钮 → 顶栏 Tabs (教学/实验) → 运行/单步/归零 → ProgressBadge → 重置进度 (20×20 小按钮) → 主题切换 → 全屏 → GuidedExperimentBar 收起按钮 → 步骤 1/2/3 按钮 → 加载本步参数 → 教学讲义 → 主图 SVG → 参数控制台重置 → Tabs (参数/案例) → 6 个 input[type=range]。

DOM 顺序与视觉顺序一致，未发现 `tabindex>0` 的强制干预，无键盘陷阱。✅

### 2.2 焦点可见性（不达标 — SC 2.4.7）

- `Button.tsx`、`Tabs.tsx`、`Sidebar.tsx` 内的全部 `<button>` 只设了 `transition-colors`，**没有任何 `focus-visible:` 样式**。Chromium 自带的虚线焦点圈在 #07111f 深色底上几乎不可见。
- `Slider.tsx` 的 input thumb 在 `:focus-visible` 时会从 cyan 变 mint + 放大 1.18 倍 (`src/index.css:99`)，✅ 但仅有这一处。
- `ThemeToggle.tsx` 是全项目唯一显式写了 `focus-visible:ring-2 focus-visible:ring-accent-primary` 的按钮。

### 2.3 拖拽交互的键盘替代（**严重缺失** — SC 2.1.1 Keyboard）

| 拖拽点 | 文件 | 键盘替代 | 状态 |
|--------|------|---------|------|
| P-h 状态点 [1] [3] | `PhDiagram.tsx:218–253` | 无 | ❌ tabindex / 方向键全无 |
| Park αβ 矢量 | `VectorPlane.tsx:63–131` | 仅靠右侧滑块 | ⚠️ 有间接键盘路径但语义不绑定 |
| SVPWM 矢量 | `VectorPlane.tsx`（同上）+ SvpwmPolar 滑块 | 同上 | ⚠️ 间接 |
| 弱磁 Id-Iq 工作点 | `VectorPlane.tsx`（同上） | 同上 | ⚠️ 间接 |
| Clarke 三相点 | `VectorPlane.tsx`（同上） | 同上 | ⚠️ 间接 |

实测：在 16 号台架，对 `svg[aria-label="P-h diagram"]` 内 circle 元素 `tabindex` 检查 → `phDragHasKeyboardAlternative: false`。

### 2.4 全局快捷键 ✅

`?` 打开 KeyHelpOverlay、`Esc` 关闭，已实测通过。`useKeyboardShortcuts.ts` 的 `isEditableTarget` 排除了 input/textarea，不会和滑块输入冲突。Space/r/s/f/数字键/方向键完整。

### 2.5 焦点管理（模态）

- `KeyHelpOverlay`：✅ Esc 关闭、点遮罩关闭、`onClick stopPropagation` 防穿透；❌ **没有 focus trap**（Tab 会跑出对话框到背后的页面）；❌ 关闭后焦点没有归还到原触发元素。
- `ProgressModal`：同上，`role="dialog" aria-modal="true"` 已加；❌ 同样无 focus trap、无焦点归还。
- `KeyHelpOverlay` 打开时 body 仍可滚动（虽然 fixed inset-0 遮罩）。

---

## 3. 屏幕阅读器

### 3.1 SVG 图表 — alt / role 覆盖率

| 图表 | role="img" + aria-label | 评 |
|------|---|---|
| PhDiagram | ✅ "P-h diagram" | 英文且过简，缺当前 (h, P, T) 数值 |
| SystemSchematic | ✅ "refrigeration schematic" | 英文，缺当前工况 |
| CompressorEnvelope | ✅ "Compressor operating envelope" | 英文 |
| MtpaCurve | ✅ 英文长描述 | OK 但英文 |
| EnergyFlowSankey | ✅ "能量流 Sankey 图" | 中文，OK；缺总效率读出 |
| CascadeLoopDiagram | ✅ "三闭环级联控制信号流框图" | OK |
| Sparkline | ✅ "sparkline" | 缺数据范围 |
| **VectorPlane** | ❌ | 共用于 Clarke / Park / SVPWM / 弱磁，全部裸奔 |
| **SpaceVectorHexagon** | ❌ | SVPWM 主图 |
| **ThreePhaseWaveform / DQWaveform / PWMChart** | recharts 内部 SVG，外层无 figure 标注 | |
| **MotorAnatomy2D / RotorFrame2D / StatorField2D** | ❌ | 01 / 02 模块主图 |
| **HfiInjectionWaveform / DeadTimeWaveform / StartupStateGraph / StepResponseChart / FocCurrentLoopChart** | 待逐一确认；grep 结果未出现 aria-label | |

### 3.2 滑块 ARIA — input[type=range] (SC 4.1.2)

`Slider.tsx` 当前只渲染：
```jsx
<span>{label}</span><span>{value}{unit}</span>
<input type="range" value min max step onChange />
```
- ❌ `<input>` 与文字 `<span>` 没有 `<label htmlFor>` / `aria-labelledby` 关联 — axe `label` critical 违规根因。
- ❌ 没有 `aria-valuetext`：屏幕阅读器只会朗读裸数字，不会读出工程单位（如 "12 安培"、"0.42 欧姆"）。
- ✅ `min/max` 已设；`role` 和 `aria-valuenow` 浏览器默认会推断；hint 也只是 `<p>`，没有 `aria-describedby` 关联。

### 3.3 aria-live（**完全缺失**）

全项目 0 处 `aria-live`。下列动态内容无任何朗读：
- TopBar 的 RUN / HOLD 状态（`AppShell.tsx:20`），仅靠 mint 圆点 + uppercase 文字。
- 模块切换后的标题、参数变化后的 Iq/Iα/Iβ/扇区数值。
- 故障注入：警告框出现/消失（`PhPanel`）、`AlertTriangle` 提示。
- Quiz 答题反馈（`Quiz.tsx`）— 答对/答错完全没朗读。

### 3.4 表单元素

`Quiz.tsx` 用 `<button>` 充当选项 → button-name 通过；但缺 `role="radio" aria-checked` 语义，屏幕阅读器会把 4 个选项当独立按钮、不会告知"4 选 1"。

`ParameterPanel.tsx:RefrigerantPicker` / `MotorPresets` / `FaultTypes` 同问题：3-14 个并列按钮没用 `role="radiogroup"`。

### 3.5 landmarks

`AppShell.tsx` 渲染了 `<aside>` × 2（Sidebar + ParameterPanel），无 `aria-label` → axe `landmark-unique` moderate 违规。`<main>` ✅ 唯一。`<header>` 在 TopBar 与 SimulationPanel/ParameterPanel/Card 多处出现，应该考虑外层 banner role 唯一。

---

## 4. 色彩对比测试结果

axe 在深色态下用真实 DOM 渲染 + 计算后色拾取，下表为关键违规对（背景/前景/比值）：

| 前景 | 背景 | 比值 | WCAG | 出现位置 |
|------|------|-----:|------|---------|
| `#5d7793` (ink-muted) | `#07111f` (bg-base) | **3.80** | ❌ AA | sidebar 子标题、stage 编号、模块描述、tooltip、提示文本 |
| `#5d7793` (ink-muted) | `#0d1929` (bg-surface) | **3.80** | ❌ AA | TopBar、Card 内 caption、参数 hint、`text-caption text-ink-muted` 全部位置 |
| `#5d7793` (ink-muted) | `#112c3e`（accent-primary/10 卡片激活态） | **3.11** | ❌ AA | 当前选中模块卡片下方的 stage 编号（最差对比度） |
| `#9eb5cb` (ink-secondary) | `#0d1929` | ~6.9 | ✅ AA | 正文，OK |
| `#e7f3ff` (ink-primary) | `#0d1929` | ~14.6 | ✅ AAA | 主文，OK |
| `rgba(231,243,255,0.35)` (PhDiagram 三相区注释) | bg-surface | < 3 | ❌ AA | `PhDiagram.tsx:181-183` 过冷液 / 两相区 / 过热气 注释字 |
| `rgba(231,243,255,0.05)` (网格虚线) | bg-base | <1.5 | ❌ AA（装饰元素，可豁免，但对仪表数据不达标） | `PhDiagram.tsx` h/p 网格 |
| `#43f7b5` (mint) on `#0d1929` | | ~10 | ✅ | 测量值 |
| `#34d6ff` (cyan) on `#0d1929` | | ~9 | ✅ | 交互主态 |
| `#ffb84d` (warn amber) on `#0d1929` | | ~9 | ✅ | warn |
| `#fb7185` 上 `#0d1929` 描边白字 (PhDiagram 状态点编号) | | OK | ✅ | 用 paintOrder + stroke 增强可读 |

> light 主题的对比情况：`--ink-muted` 设为 #64748b on #ffffff = 4.51（**勉强**达 AA），on #f5f7fb = 4.34（不达标）。

---

## 5. 触摸目标（移动端，SC 2.5.5 AAA / 2.5.8 AA = 24×24）

| 目标 | 实际尺寸 | WCAG 2.5.8 (24px) | WCAG 2.5.5 (44px) | 文件 |
|------|---------:|:-----------------:|:------------------:|------|
| Slider thumb | 14 × 14 px | ❌ | ❌ | `src/index.css:88-115` |
| ProgressBadge 重置按钮 | 20 × 20 (h-5 w-5) | ❌ | ❌ | `ProgressBadge.tsx:73-81` |
| ProgressModal 关闭按钮 | 32 × 32 (h-8 w-8) | ✅ | ❌ | `ProgressModal.tsx:122-129` |
| ThemeToggle | 32 × 32 (h-8 w-8) | ✅ | ❌ | `ThemeToggle.tsx:20` |
| Button 默认 (`px-3 py-1.5 text-body`) | 高度 ~28 px | ✅ | ❌ | `Button.tsx:20` |
| Tabs 子按钮 | ~28 px 高 | ✅ | ❌ | `Tabs.tsx:14` |
| Sidebar 模块卡片 (`px-3 py-2`) | 高度 ~52 px、宽 200/全宽 | ✅ | ✅ | `Sidebar.tsx` |
| GuidedExperimentBar 步骤按钮 (`px-2.5 py-1.5`) | ~28 px 高 | ✅ | ❌ | `GuidedExperimentBar.tsx:54-69` |
| P-h 状态点（拖拽圆） | 半径 6.5 → 13×13 px | ❌ | ❌ | `PhDiagram.tsx:243-254` |

`docs/MOBILE_RESPONSIVE_AUDIT.md` 已识别滑块 thumb 为风险项，本次审查重申。

---

## 6. 动画偏好（`prefers-reduced-motion` — SC 2.3.3 AAA / 优先项）

**全项目搜索 `prefers-reduced-motion` / `useReducedMotion` / `MotionConfig` → 0 命中。**

下列动画在 reduced-motion 下应当被压制或停止，但目前**全部无条件播放**：

| 动画 | 位置 | 现状 |
|------|------|------|
| 模块切换 fade+y=14 | `motion.ts:moduleSwap` + `SimulationPanel.tsx:21-27` | 强制每次切模块都播 0.26s |
| Probe Tab 切换 | `ProbeTabs.tsx:83-93` | AnimatePresence + layoutId 滑块下划线 |
| ProgressModal / KeyHelpOverlay 入场 | `ProgressModal.tsx:96-102` / `KeyHelpOverlay.tsx:73-78` | scale + y 动画 |
| 卡片 stagger 入场 | `ProgressModal.tsx:172-181` `delay: idx*0.015` | 16 张卡片瀑布动画 |
| PhDiagram 4 状态点发光环 | SVG 渐变 + transform scale | 拖拽放大 |
| **SystemSchematic 流体粒子** | `SystemSchematic.tsx:174-176` `<animate>` r=5→7 永久脉冲 | 即使停止仿真也在 SVG 内嵌循环 |
| 流向箭头 / Sankey 过渡 | EnergyFlowSankey 流量带渐变 | OK（无动画），但若用户加 framer 入场需注意 |

唯一例外：CSS `body::before` 网格底纹是静态的，已经无动画。

---

## 7. 修复优先级

> 顺序：先解决 critical（label / 拖拽键盘） → serious（对比度 / 焦点环 / 触摸目标） → moderate（landmark-unique / heading-order / aria-live） → 体验增强（reduced-motion / radiogroup）。

| 优先级 | 问题 | WCAG | 文件 + 改法 |
|:---:|------|------|------|
| P0 | `<input type=range>` 100% 缺标签 | SC 1.3.1 / 4.1.2 (label, critical) | `src/components/ui/Slider.tsx`：把 `<span>{label}</span>` 改为 `<label htmlFor={id}>` 或给 input 加 `aria-label={label}` + `aria-valuetext={\`\${formatNumber(value)}\${unit}\`}`。同时把 `hint` 用 `aria-describedby` 关联。 |
| P0 | P-h 状态点拖拽无键盘替代 | SC 2.1.1 Keyboard (A) | `src/components/charts/PhDiagram.tsx:218-254`：给可拖动 `<circle>` 加 `tabIndex={0} role="slider" aria-label="状态点 1 焓压坐标" aria-valuenow={h} aria-valuemin={H_MIN} aria-valuemax={H_MAX}`，并在 `onKeyDown` 内识别方向键调整 (h, P)，调用同一个 `commit(idx, h, P)` 通路。VectorPlane 同样处理。 |
| P0 | `text-ink-muted` 在所有深色背景上 < 4.5:1 | SC 1.4.3 (color-contrast, serious) | 把 `tailwind.config.js` 的 `ink.muted` 从 `#5d7793` 抬到 `#7d96b3`（→ 5.2:1 on bg-surface）；CSS 变量 `--ink-muted` 同步抬到 `#7d96b3`（dark）/`#475569`（light, vs #f5f7fb 给 4.78:1）。整改后 `text-caption text-ink-muted` 全部模块自动达标。 |
| P0 | 焦点环全局缺失 | SC 2.4.7 Focus Visible (serious) | `src/components/ui/Button.tsx:20`：在 className 末尾追加 `focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface`。同时 `Tabs.tsx`、`Sidebar.tsx` 模块按钮、GuidedExperimentBar 步骤按钮、ProgressBadge、ProbeTabs、KeyHelpOverlay 中的 KeyCap 容器需要相同处理。或在 `src/index.css` 加 `:where(button, [role="button"]):focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; border-radius: inherit; }` 一次覆盖。 |
| P1 | Slider thumb 14px / ProgressBadge 删除 20px 触摸目标过小 | SC 2.5.8 Target Size (Minimum, AA) | `src/index.css:87-95`：`width/height: 24px; margin-top: -10px;`（轨道仍 4px，仅 thumb 放大）。`ProgressBadge.tsx:78`：`h-5 w-5` → `h-7 w-7`；可用 `before:` 伪元素扩大点击 hit area 而不改视觉尺寸。 |
| P1 | 模态焦点 trap + 焦点归还 | SC 2.4.3 Focus Order / 2.1.2 No Keyboard Trap | `KeyHelpOverlay.tsx` / `ProgressModal.tsx`：用 `useEffect` 在 open 时 `previouslyFocused = document.activeElement`，对话框首个 focusable 元素 `.focus()`；监听 Tab 在最后/第一个 focusable 之间循环；onClose 时 `previouslyFocused.focus()`。或引入 `react-focus-lock` / `@radix-ui/react-focus-scope`。 |
| P1 | landmark-unique（双 `<aside>`） | SC 1.3.1 (moderate) | `Sidebar.tsx:17`：`<aside aria-label="模块导航">`。`ParameterPanel.tsx:324`：`<aside aria-label="参数控制台">`。 |
| P1 | VectorPlane / SpaceVectorHexagon / MotorAnatomy2D / RotorFrame2D / StatorField2D / 各 Waveform 缺 role + aria-label | SC 1.1.1 / 4.1.2 (serious) | 在每个 SVG 加 `role="img"` + 中文 `aria-label`，例如 `VectorPlane.tsx:63` 加 `<svg role="img" aria-label={\`\${title}：α=\${alpha.toFixed(2)} β=\${beta.toFixed(2)}\`}>`，让朗读器能播报当前数值。 |
| P1 | 运行/停止状态、错误警告无 aria-live | SC 4.1.3 Status Messages (AA) | `TopBar.tsx:19-22`：`<div role="status" aria-live="polite" aria-atomic="true">{running ? '运行中' : '已暂停'}</div>`。`PhPanel` 警告框 `role="alert"`。Quiz 答题结果 `aria-live="polite"`。 |
| P2 | `prefers-reduced-motion` 全部不尊重 | SC 2.3.3（AAA，但社区共识为基本）| `src/main.tsx` 用 `<MotionConfig reducedMotion="user">` 包裹 `<App/>`（framer-motion 自带）— 一行解决所有 motion.div。 SystemSchematic 内 `<animate>` 用 CSS `@media (prefers-reduced-motion: reduce) { animate { display: none; } }` 或在组件读取 `useReducedMotion()` 决定是否渲染。 |
| P2 | heading-order（SVPWM 出现 h1→h3 跳级） | SC 1.3.1 (moderate) | 把 `SpaceVectorHexagon` 容器内的 `<h3>` 升为 `<h2>`，或外层 Card 添加 `<h2>` 让层级连续。 |
| P2 | 一组按钮（refrigerant / motor presets / fault types / quiz options）缺 radiogroup 语义 | SC 4.1.2 | 包一层 `<div role="radiogroup" aria-label="制冷剂选择">`，子按钮加 `role="radio" aria-checked={refrigerant===r}`，键盘左右切换可选实现。 |
| P3 | PhDiagram 三相区注释 / 网格刻度文字对比度 | SC 1.4.3 | `PhDiagram.tsx:181-183`：把 `rgba(231,243,255,0.35)` 提到 `0.55`+。装饰网格 `0.05` 可保持（非内容）。 |
| P3 | KeyHelpOverlay 标题层级与 dialog ARIA | SC 4.1.2 | `KeyHelpOverlay.tsx:64`：外层 `motion.div` 加 `role="dialog" aria-modal="true" aria-labelledby="key-help-title"`，h2 加 `id="key-help-title"`。 |
| P3 | Quiz 选项语义化 | SC 4.1.2 | 改为 `<fieldset><legend>` + `<input type="radio">` 或 button + `role="radio" aria-checked`，让屏幕阅读器报"4 选 1，第 2 项被选"。 |
| P3 | ProgressBadge 自定义 tooltip 在悬停时 `role="tooltip"` 但没用 `aria-describedby` 绑定到主按钮 | SC 1.3.1 | `ProgressBadge.tsx:49-71`：给 button 加 `aria-describedby="progress-tip-id"`，showTip 由 `:hover/:focus-within` 双触发（目前 onMouseEnter 不响应键盘）。 |

---

## 8. 实测附录

### 8.1 axe-core 测试脚本

`tests/e2e/a11y.spec.ts` — 注入 axe.min.js（缓存到 `node_modules/.cache/axe-core.min.js`），按 6 个关键模块 `axe.run`，结果写入 `tmp/a11y-results.json`。

运行：`npx playwright test tests/e2e/a11y.spec.ts --reporter=line`

实测耗时：axe scan 测试 ~53 秒通过；keyboard 测试在 Tab 50 次后超出默认 30s（不影响数据写入，已落盘 `tmp/a11y-keyboard.json`）。

### 8.2 关键键盘检查结果

```json
{
  "canTabToSlider": true,
  "helpOverlayOpensWithQuestion": true,
  "helpOverlayClosesWithEsc": true,
  "phDragHasKeyboardAlternative": false
}
```

### 8.3 推荐：把 a11y 加入 release 流程

- `package.json` 增加 `"qa:a11y": "playwright test tests/e2e/a11y.spec.ts"`；
- `release:audit` 串入：verify → build → e2e → **qa:a11y** → screenshots。
- 当 axe critical 违规 > 0 时 fail。
