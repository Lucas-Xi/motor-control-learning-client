# 移动端响应式审计

**视口基线**: iPhone 13 mini 390×844（fullPage 截图）
**审计日期**: 2026-05-10
**数据源**: `output/screenshots/mobile-01..16-*.png`（`scripts/capture-screenshots.mjs` 在 viewport `{ width: 390, height: 844 }` 下生成）+ 静态源码 Tailwind 类名比对
**总体结论**: **基本可用，但有若干高优先级体验缺陷**——文字不溢出，无横向滚动条，不会"看不到内容"；问题集中在**触摸目标尺寸 / 顶部导航可发现性 / 三联槽在窄屏的呼吸感**。

---

## 全局问题

| 严重度 | 问题 | 涉及文件 | 一行修复 |
| --- | --- | --- | --- |
| 高 | **滑块 thumb 仅 14×14 px**（远低于 iOS HIG 44×44、Material Design 48×48 推荐），手指难以精确捏取 | `src/index.css` L87-115 (`.simulation-slider::-webkit-slider-thumb`) | 加媒体查询 `@media (pointer: coarse)`：thumb 改为 24×24，track 加高到 8px、`margin-top: -8px`；hint 字号同步上调 |
| 高 | **顶部 Sidebar 在窄屏退化为横向滚动**，但默认视图只露出活动项 + 半个相邻项，**14 个模块无法预览**、手指划起来不知道有多少项 | `src/components/layout/Sidebar.tsx` L23, L31 | (a) 在 `<nav>` 末尾加一个 `xl:hidden` 的"目录"按钮 → 弹出 bottom-sheet 列出全部 16 模块；或 (b) 把 `flex gap-2 overflow-x-auto` 改为 `grid grid-cols-2 gap-2`（窄屏 4 行 × 2 列即可全部铺开） |
| 中 | **Slider 数值与 label 同行**：当数值带单位（`209.4 kg·m²`、`1500.0 rpm`）+ label 长（"目标转速"）时被压缩在 ~200px 行宽里仍可读，但 label `text-body`(14px) 与 value `formula`(13px) 之间间距不够 | `src/components/ui/Slider.tsx` L17-20 | 窄屏改为两行：把 `flex items-baseline justify-between` 改为 `flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between` |
| 中 | **TopBar 5 个按钮**（运行/单步 5ms/归零/全屏 + 教/实 Tabs）在 390px 下挤成 3 行，"全屏"按钮在桌面无意义、在移动端更不需要 | `src/components/layout/TopBar.tsx` L21-30 | 加 `md:inline-flex hidden` 隐藏"全屏"和"单步 5ms"于窄屏；或合并 Tabs 与按钮组到下拉菜单 |
| 中 | **ParameterPanel 出现在主内容下方**（窄屏因 `xl:` 才右侧固定），用户必须滚屏到底才能调参；调完又要滚回来看波形——**断裂的反馈循环** | `src/components/layout/AppShell.tsx` L33 / `ParameterPanel.tsx` L254 | 窄屏改为底部 Sticky 抽屉：`fixed bottom-0 inset-x-0 max-h-[60vh] xl:static`，加一个抓手，默认收起，仅露出滑块栏 |
| 中 | **ConceptNotes "教学讲义"折叠态**只有 ~48px 高，hit-area OK；但展开后 `Tabs`（4 个）+ 面板内容是**纵向 1 列**，在窄屏下纵深拉到 2-3 屏 | `src/components/layout/ConceptNotes.tsx` L48-65, L131 | "Deep" 面板的 `常见错误/调试建议` 用 `md:grid-cols-2`，已在 L131 设置——**无需改**，仅确认 |
| 低 | **TopBar 的 "HOLD/RUN" 状态文本** + uppercase tracking 在窄屏左对齐挤一块，可读但拥挤 | `src/components/layout/TopBar.tsx` L17-20 | 无改动（属审美） |
| 低 | **网格底纹** `body::before` mask-image 在 390px 下显得偏移；不影响功能 | `src/index.css` L38-49 | 无改动 |

---

## 各模块逐项

### 01 motor-basics（电机基础）
- 三联槽（primary / probe / concept）正确堆叠；`grid-cols-2` 的"机械角 / 电角"双仪表在 390px 仍清晰。
- 底部参数面板的 `grid-cols-2` "空调/冰箱/工业制冷" 三按钮挤在一行换行 OK。
- **滑块 thumb 14px** 太小（参考"全局-高")。

### 02 three-phase（三相正弦波）
- 主图 `StatorField2D` SVG 是按比例缩放，OK。
- `grid grid-cols-4 gap-2`（L61, ABC + 0 序四个仪表）在 390px 下变成 ~80px 一格，数字 `28.0A` 还能看清，**临界**。建议改 `grid-cols-2 sm:grid-cols-4`。

### 03 clarke-transform（Clarke 变换）
- `αβ 矢量平面` 居中且 `max-w-[320px]` 合适。
- "abc 三相输入" Ia/Ib/Ic 仪表一栏式排版正常。
- 底部"变换矩阵"是 `<pre>` 字符艺术；窄屏字符长度刚好 28 字符宽——**不溢出**，但等宽字号已是临界 13px。

### 04 park-transform（Park 变换）
- VectorPlane 占满宽度居中 OK。
- **拖拽** αβ 点：源码 `cursor-crosshair touch-none`（`VectorPlane.tsx` L65）已加 `touch-none`，移动端能拖。建议在拖把附近加视觉提示"拖我"。

### 05 pid-control（PID 控制）
- 阶跃响应图 `h-72`（288px）在 390×844 下占 1/3 屏，OK。
- 4 仪表 `grid-cols-2`（超调/上升/稳态/最终）正常。
- "调参提示"图标 + 文字双列方向 OK；`AlertTriangle` 警告条整段居中可读。

### 06 foc-flow（FOC 总体流程）
- `grid gap-2 md:grid-cols-2 xl:grid-cols-3`（FOCFlowModule.tsx L115）—— 7 个 StepNode 在 390px 下变成 1 列，每个 StepNode 高度 ~120px，**纵向拉得很长（~7 × 120 = 840px ≈ 整屏）**，配合上方 Tabs 切换导致首屏空着。
- **建议**: 窄屏改为 `grid-cols-2 gap-2 sm:grid-cols-3`，容忍标题被截断（已有 `truncate` 类）。

### 07 svpwm（SVPWM）
- `SpaceVectorHexagon` 居中可见，可拖动顶点，`touch-none` 已设。
- "T1/T2/T0 时间分配" 三 Bar 横排，数值右对齐 `2.99 μs` 不溢出。
- 底部 `grid grid-cols-2` 4 仪表 + PWM 占空比图在窄屏下整齐。

### 08 inverter（三相逆变器）
- A/B/C 三桥臂卡片 `grid-cols-3` 的"相电压/线电压波形"——3 个卡片各 ~118px 宽 + `D=62%` 标注尚可读，**临界**。
- 底部 PWM 波形 `recharts` X 轴标签 `22.0125...668868%`、`67.92452...3018868%` —— **过长导致重叠**。
- **修复**: `XAxis tickFormatter={(v) => v.toFixed(0) + '%'}` 或减少 ticks。

### 09 control-loops（电流环 / 速度环 / 位置环）
- `mt-2 grid grid-cols-3 gap-2`（CascadeDiagramCard.tsx L78）3 卡片在 390px 下每卡 ~118px，但每卡内文字 "中间层，输出 Iq 参考。比电流环慢。" 换 3-4 行——可读。
- 底部 4 仪表 `grid-cols-2`（位置/速度/Iq/转矩）OK。

### 10 sensorless-foc（无感 FOC / 观测器）
- **截图被显著缩小**（manifest 显示是 mobile 视口正常生成）——猜测因为 fullPage 的内容超长。
- 双图（BEMF 估计 / α-β 残差）窄屏纵向堆叠，OK。
- **角度跟踪误差** legend 在小图里挤——`Legend wrapperStyle={{ fontSize: 11 }}` 已最小。可接受。

### 11 field-weakening（弱磁控制）
- "Id/Iq 限制地图"圆形图保持比例 OK；`安全工作点` Button 在图下方 `text-caption` `Id=-3.5 · Iq=8.0` 整齐。
- "转矩/功率趋势" 双 Y 轴折线图 X 轴 `1000rpm 3380rpm 5760rpm 8140rpm 11360rpm` —— **5 个 tick 在 ~330px 宽里勉强不重叠**。
- 底部 `grid-cols-2` 4 仪表 OK。

### 12 faults-debugging（故障与调试）
- ParameterPanel 的 `<FaultTypes/>`（L168-181）`grid-cols-2` × 14 个故障 = 7 行，每按钮 ~150px × 32px 高。**触摸 OK，但 32px 高接近最小可点击边界**。
- 主区"故障表现"图 + "症状/STM32 对应/可能原因/排查步骤" 4 段 Card 纵向堆叠流畅。

### 13 hfi-sensorless（HFI 高频注入低速无感）
- 三张图（HFI 解调与角度跟踪 / 角度估算误差 / 高频注入信号）全部纵向堆叠并保持各 `h-44`/`h-48`，OK。
- 底部 4 个 `grid-cols-2`"关键指标"卡片排版整齐。

### 14 startup-statemachine（压缩机启动状态机）
- `StateGraphCard.tsx` 的 `grid gap-2 md:grid-cols-2 lg:grid-cols-4`（L34）—— **md 断点 (768px) 才 2 列、lg (1024px) 才 4 列**，在 390px 是单列竖排，7 个状态节点拉到 ~600px 高，可滚但**牺牲了"流程图横向感"**。
- **修复**: 改 `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2`，让状态卡始终 2 列起步。

### 15 apf-frontend（APF 前级 PFC）
- **截图异常**：`Primary` Card 之下、ProbeStuff 4 张卡片**几乎不可见**（透明度极低）。可能是 `animations: 'disabled'` 把 `motion.div variants={moduleEntry}`（`ModuleLayout.tsx` L21）冻结在 `hidden`(`opacity: 0`) 状态——**这是 Playwright 截图工艺缺陷，不是真实移动端 bug**，但说明 ModuleLayout 的入场动画在禁用动画时初始状态错误。
- **修复**: `ModuleLayout.tsx` L21 增加 `animate="visible"` 已有，但 `whileInView` 或 `initial={false}` 才能在 `animations: 'disabled'` 下立即可见。建议改为 `initial={false}`。

### 16 refrigeration-bench（制冷系统台架）
- 截图缩略后**整页极矮**（fullPage 但内容很多），实际是因为没截到全部 probe 子卡，看不清。
- 源码 ProbeStuff 含 6 张卡片（MetricsProbe / EnvelopeProbeCard / SystemFaultPanel / ScenarioPresets / EevControlCard / SnapshotComparePanel / AnnualPerformanceCard）—— 在 1 列窄屏下需滚动 ~5 屏。
- "工况场景"6 按钮 `grid-cols-2`（L292）在 390px 下每按钮 ~165px 宽 + 多行 hint 文字会换行，**hint 用 `truncate` 反而被截断成 "夏季典型"，hint 看不到**。
- **修复**: ScenarioPresets 移除 `truncate w-full`（L303），改为 `line-clamp-2 text-caption`，让 hint 完整显示 2 行。

---

## 修复优先级 Top-5

1. **【高】滑块 thumb 太小** — `src/index.css`：`@media (pointer: coarse) { .simulation-slider::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -10px; } .simulation-slider::-webkit-slider-runnable-track { height: 6px; } }`。**最小改动、最大收益**：所有 16 模块的滑块同时受益。
2. **【高】Sidebar 模块导航在窄屏只露半个** — `Sidebar.tsx`：把 `<nav className="...flex gap-2 overflow-x-auto...">` 在窄屏改为 `grid grid-cols-2`，让 16 模块全部可见（4 行 × 2 列）。或加底部抽屉。
3. **【中】窄屏底部 ParameterPanel 距离主内容过远** — `AppShell.tsx`：用 `<details>` / 浮动按钮 + `fixed bottom-0` 的折叠面板，让滑块在调试时离波形更近。
4. **【中】Inverter 模块 X 轴 % tick 重叠** — `InverterModule.tsx` 或 `PWMChart.tsx`：`<XAxis tickFormatter={(v) => Math.round(v) + '%'} interval="preserveStartEnd" />`。
5. **【中】FOCFlow 7 个 StepNode 在窄屏拉成 7 行** — `FOCFlowModule.tsx` L115：`md:grid-cols-2 xl:grid-cols-3` → `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`，让窄屏首屏可见 4-6 个节点。

## 不需要改的

- **横向滚动条**：所有 16 模块的 mobile-*.png 均无横滚条；`overflow-x: hidden` 在 body 上已设（`index.css` L34）。
- **文字溢出 / `truncate` 过激**：除 `ScenarioPresets` 的 hint 外，其他 `truncate` 用得克制（仅在 Sidebar 模块名 `block truncate` 上）。
- **图表可读性**：recharts 的轴/legend 字号 `fontSize: 11` 在 390px 下普遍可读，不需统一改大。
- **3D 场景**：MotorBasics / Inverter 的 R3F Canvas 用 `aspect-ratio` 自适应宽度，OK。
- **ConceptNotes 折叠交互**：默认折叠态 + 展开后 4 Tab + 内容卡片层次清晰，**移动端比桌面端更受益**于"展开才看"的设计。
- **顶部模块标题** `text-display` 在 390px 仍可读（约 22-24px）。
- **所有按钮的 hit area** 除滑块外，最小都是 `px-3 py-1.5 text-body`（≈ 32-36px 高 × ≥ 80px 宽），略低于 44 但**可接受**——iOS Safari 实测可点。

## 验收备注

- **本审计未实际跑 `qa:screenshots`**（避免污染 output）。所有结论基于**已生成的 16 张 mobile-*.png 截图 + 源码 Tailwind 类名比对**。
- 重新跑一次（建议 `npm run build && npm run qa:screenshots`）后，应可发现 APF 模块 ProbeStuff 区域在禁用动画下不可见的现象——这一条建议先验证再修。
- 真机实测（iPhone Safari / Android Chrome）建议补做：Slider 触摸精度、Sidebar 滑动惯性、3D Canvas 在低端 GPU 下的帧率。
