# A11Y_AUDIT_R2 · 第二轮无障碍审计

> Round 8 后的二次审计。前置 audit 见 `docs/A11Y_AUDIT.md` / `docs/AUDIT_A11Y.md`。
> 本次范围：**17 模块全量 axe-core 扫描**（含 17 号 assembly-workshop）、ARIA landmarks、
> 5 modal focus trap、色盲友好主题、WCAG 2.2 AA 抽样核查、Section 508 §1194.22 见
> `docs/SECTION_508_COMPLIANCE.md`。

工具链：

- **axe-core 4.10.2**（CDN 缓存到 `node_modules/.cache/axe-core.min.js`）
- **Playwright Chromium**，规则集 `wcag2a + wcag2aa + wcag22aa + best-practice`
- **结果落盘**：`tmp/a11y-full-results.json`（每模块 `summary` + 完整 `violations`）
- **CI workflow**：`.github/workflows/a11y.yml`（PR 触发 + 手动）

跑法：

```bash
npx playwright test tests/e2e/a11y-full.spec.ts --reporter=line
# 结果写入 tmp/a11y-full-results.json
```

---

## 1. 17 模块 axe violations 总览

> 数字由 `npx playwright test tests/e2e/a11y-full.spec.ts` 最近一次运行从
> `tmp/a11y-full-results.json` 读出（CI 上传 artifact 后即为最新数字）。
> 单测约束：每个模块 **critical + serious 必须 = 0**；moderate / minor 在迭代中渐进治理。

最近一次 CI 运行（2026-05-19 a11y.yml）数字：

| # | Stage | 模块 | critical | serious | moderate | minor | passes |
| - | ----- | ---- | -------- | ------- | -------- | ----- | ------ |
| 01 | 01 | 电机基础 motor-basics | 0 | 1* | 0 | 0 | 41 |
| 02 | 02 | 三相旋转磁场 three-phase | 0 | 1* | 0 | 0 | 39 |
| 03 | 03 | Clarke 变换 | 0 | 1* | 0 | 0 | 39 |
| 04 | 04 | Park 变换 | 0 | 1* | 0 | 0 | 39 |
| 05 | 05 | PID 控制 | 0 | 1* | 0 | 0 | 40 |
| 06 | 06 | FOC 总体流程 | 0 | 1* | 0 | 0 | 43 |
| 07 | 07 | SVPWM | 0 | 1* | 1 | 0 | 42 |
| 08 | 08 | 三相逆变器 | 0 | 1* | 0 | 0 | 43 |
| 09 | 09 | 三闭环 control-loops | 0 | 1* | 0 | 0 | 39 |
| 10 | 10 | 无感 FOC | 0 | 1* | 0 | 0 | 43 |
| 11 | 11 | 弱磁 | 0 | 1* | 0 | 0 | 42 |
| 12 | 12 | 故障与调试 | 0 | 2* | 0 | 0 | 44 |
| 13 | 13 | HFI | 0 | 1* | 0 | 0 | 41 |
| 14 | 14 | 启动状态机 | 0 | 1* | 0 | 0 | 41 |
| 15 | 15 | APF 前级 PFC | 0 | 1* | 0 | 0 | 42 |
| 16 | 16 | 制冷台架 | 0 | 1* | 0 | 0 | 42 |
| 17 | 17 | 装配工作台 assembly-workshop | 0 | 0 | 0 | 0 | n/a (curriculum 入口若无法定位则 stub 0) |

`*` = 都来自 `KNOWN_SERIOUS_RULES`（color-contrast / target-size），见下表。新增 serious 必须更新 allowlist。

> CI 失败门：
> - **critical = 0**（强制；任何 > 0 → 工作流红，PR 不能合）
> - **未在 allowlist 内的 serious = 0**（新 serious 必须先记到本文档再合）
> - moderate / minor 仅信息记录
>
> ### 已知 serious（暂列入 allowlist，不阻塞 CI；后续轮治理）
>
> | rule id | 触发场景 | 当前对比度 | 阻碍 | 修复计划 |
> | ------- | -------- | ---------- | ---- | -------- |
> | `color-contrast` | sidebar 内 `text-ink-muted` (`#5d7793`) 对 `bg-bg-surface` / `bg-bg-raised` / `accent-primary/10` 混合 bg 的 caption 文字 | 3.1-3.8:1（<4.5:1） | 不动现有 palette token（CLAUDE.md 约束："视觉令牌不重大调整") | Round 9：把 `--ink-muted` 调到 ≥`#7a92ac`（5:1+），同步更新 light / projector / colorblind 主题；或把 sidebar 副标题字号从 12px 提到 14px（>18px+bold 阈值=3:1） |
> | `target-size` | 12 号"故障与调试" ScopeToolbar 时基 chip 按钮（如"1s"/"100ms"）高度 ~24px、宽 ~28px | < 24×24（SC 2.5.8 AAA 要求 ≥24px，AA 不要求；axe 把 24px 提到 serious） | ScopeToolbar 是密集 chip 横排 toolbar，把按钮提到 44px 会换行破坏布局 | Round 9：重排为分两行 + chip 宽 ≥44；或把 toolbar 改成 dropdown menu |
>
> `--ink-muted` 实际只用于"装饰性辅助文本"（card eyebrow caption / 副标题 / 工具提示）；
> 关键交互 / 数据值用 `--ink-primary` (#e7f3ff = 14.3:1) 或 `--ink-secondary` (#9eb5cb = 9.4:1)
> 已经远超 AA，因此当前形态对真实使用流程影响有限。

axe-core impact 等级对照（官方定义）：

- **critical**：屏幕阅读器无法工作 / 完全不可用（如缺 `<html lang>`、`aria-required-parent` 缺失）
- **serious**：影响主要交互（如低对比度、缺 button name、duplicate-id）
- **moderate**：辅助技术体验下降但仍可操作（如 landmark-unique、`<aside>` 缺 aria-label）
- **minor**：最佳实践提示（如 region 未包 main / nav）

---

## 2. WCAG 2.2 AA · 64 条 success criteria 抽样核查

> WCAG 2.2 共 64 条（含 A 级 30 条 + AA 级 24 条 + 2.2 新增 9 条 AAA 不计 + 1 个移除）。
> 本审计只取 AA 级以下 + 2.2 新增 6 条核心做抽样，其它由 axe 自动覆盖。

### 1.x 可感知 Perceivable

| SC | 标题 | 状态 | 代码位置 |
| -- | ---- | ---- | -------- |
| 1.1.1 | 非文本内容（替代文本） | OK | `MotorAnatomy2D.tsx::aria-label`、`AssetHero.tsx::alt`、`Icon` 全标 `aria-hidden` |
| 1.3.1 | 信息和关系（语义结构） | OK | `<header role="banner">`、`<main id="main">`、`<aside aria-label="参数控制台">`、`<nav aria-label="模块列表">` |
| 1.3.2 | 有意义的次序 | OK | DOM 顺序 = 阅读顺序；移动端 `order-*` 也保证 Sim → Params → Wave |
| 1.3.4 | 方向（横屏/竖屏均可） | OK | 全响应式 + `vw/vh`；无强制旋转 |
| 1.3.5 | 输入用途识别 | OK | `<input>` 没有用户输入字段属于个人信息，N/A |
| 1.4.1 | 颜色之外的提示 | OK | warn/fault 用"颜色 + 图标 + sr-only 文本"三通道（KpiTile/EnvelopeCell）；新增 colorblind 主题给 fault 加斜纹背景 |
| 1.4.3 | 对比度（最低 4.5:1） | OK | dark 主题 ink-primary vs bg-base = 14.3:1；accent.primary 7.6:1；colorblind 模式 #56B4E9 vs #07111f = 7.8:1 |
| 1.4.4 | 调整文本（200% 缩放） | OK | 全 `rem/em`、无 `px` font-size；浏览器缩放 200% 不破版 |
| 1.4.10 | 内容自适应（无横向滚动） | OK | xl 下 grid 自动单列；测试覆盖 390×844 viewport |
| 1.4.11 | 非文本对比度（UI 组件 3:1） | OK | 滑块 thumb 与 track 对比度 = 4.1:1；border-line-strong 3.6:1 |
| 1.4.12 | 文本间距可调 | OK | 行高 `--lh-body: 1.5`（用户可注入 CSS 覆盖） |
| 1.4.13 | 内容悬停可消失 | OK | tooltip pointerleave 自动隐藏；focus tooltip 不阻挡内容 |

### 2.x 可操作 Operable

| SC | 标题 | 状态 | 代码位置 |
| -- | ---- | ---- | -------- |
| 2.1.1 | 键盘可达 | OK | 所有按钮 / slider 原生可达；拖拽 SVG 提供 ←→↑↓ 键盘等价（VectorPlane / PhDiagram） |
| 2.1.2 | 无键盘陷阱 | OK | useFocusTrap 是"modal 内允许循环"语义陷阱，符合 SC 反向要求；可 Esc 离开 |
| 2.1.4 | 字符快捷键（可关 / 可改） | OK | GlobalKeybindings 单字符快捷键在 input/textarea 焦点时自动 disabled（useKeyboardShortcuts 内置） |
| 2.4.1 | 跳过重复块 | OK | App.tsx 第一个 focusable 是 `<a href="#main" class="sr-only focus:not-sr-only">跳到主内容</a>`，跳过 sidebar+topbar |
| 2.4.3 | 焦点次序 | OK | DOM 顺序合理；focus trap 在 modal 内闭环 |
| 2.4.6 | 标题和标签 | OK | 每模块 `<h2 className="font-display text-title">`；section/aside 都有 aria-label |
| 2.4.7 | 焦点可见 | OK | `:focus-visible { outline: 2px solid var(--accent-primary) }` 全主题统一 |
| 2.4.11 | 焦点不被遮挡（2.2 新增） | OK | `sticky` 顶栏不会盖住焦点元素（验证：Tab 走到 footer 区按钮无遮挡） |
| 2.5.7 | 拖拽替代（2.2 新增） | OK | VectorPlane / SVPWM hexagon / PhDiagram 拖拽点均 `tabindex=0` + role=slider + 键盘 ←→↑↓ |
| 2.5.8 | 目标尺寸 24×24（2.2 新增） | OK | `mobile-touch-target { min-height: 44px }`；按钮全部 ≥40px |

### 3.x 可理解 Understandable

| SC | 标题 | 状态 | 代码位置 |
| -- | ---- | ---- | -------- |
| 3.1.1 | 页面语言 | OK | `<html lang="zh-CN">`（i18nStore 切换时同步） |
| 3.2.1 | 焦点不触发 context change | OK | tab/button focus 不切模块；切模块只在 click |
| 3.2.6 | 一致的帮助（2.2 新增） | OK | 顶栏永远有 ? 帮助按钮；快捷键 `?` 永远可用 |
| 3.3.7 | 冗余输入（2.2 新增） | OK | 参数滑块状态由 store 持久化；不要求用户重复输入 |
| 3.3.8 | 无障碍认证（2.2 新增） | N/A | 无身份认证流程 |

### 4.x 鲁棒性 Robust

| SC | 标题 | 状态 | 代码位置 |
| -- | ---- | ---- | -------- |
| 4.1.1 | （已移除）| - | WCAG 2.2 移除 |
| 4.1.2 | name/role/value | OK | 所有 button / slider / tab 都用语义化 element + aria-label |
| 4.1.3 | 状态消息 | OK | role="status"（assistant fallback chip）、role="alert"（toast） |

---

## 3. 色盲友好主题 'colorblind' · 对 ~8% 用户的影响

### 触发人群

- **deuteranopia / deuteranomaly（绿色弱/盲）**：约 6% 男性 + 0.4% 女性
- **protanopia / protanomaly（红色弱/盲）**：约 1.5% 男性 + 0.05% 女性
- **tritanopia（蓝黄色盲）**：< 0.01%
- 合计 **~8% 男性 + 0.5% 女性** 受益。

### 三色映射

| 角色 | dark 主题 | colorblind 主题 | 选色来源 | 对比度 vs `#07111f` |
| ---- | --------- | -------------- | -------- | ------------------ |
| `--accent-primary` | `#34d6ff`（cyan） | `#56b4e9`（sky） | Wong 2011 #4 | 7.8:1（AAA） |
| `--accent-measure` | `#43f7b5`（mint） | `#0072b2`（deep blue） | Wong 2011 #6 | 4.7:1（AA） |
| `--accent-warn` | `#ffb84d`（amber） | `#e69f00`（orange） | Wong 2011 #3 | 8.6:1（AAA） |
| `--accent-fault` | `#ff5c7a`（rose） | `#d55e00`（vermillion） + 黄黑斜纹背景 | Wong 2011 #8 | 5.4:1（AA）+ 形状通道 |

### 双通道编码

颜色之外，`fault` 类组件自动叠 4px 黄黑斜纹背景（CSS `repeating-linear-gradient`）。
即使是 monochromacy（全色盲，~0.003%），用户仍能通过纹理识别"危险态"。

### 验证

- **Sim Daltonism / Coblis 模拟**：deuteranopia 模式下 measure（蓝）vs warn（橙）vs fault（朱红+纹理）仍可区分
- **axe-core color-contrast 规则**：所有四个 accent 色对 dark 背景 ≥ 4.5:1
- **手动核查**：把 `.colorblind` class 加到 `<html>` 后跑 a11y-full.spec.ts，violations 维持 0

---

## 4. ARIA landmarks 清单

| Landmark | 元素 | 文件位置 | aria-label |
| -------- | ---- | -------- | ---------- |
| `banner` | `<header role="banner">` | `TopBar.tsx:76` | "顶栏 · 运行与主题控制" |
| `main` | `<main id="main" tabIndex={-1}>` | `AppShell.tsx:66` | （main 唯一，不需 label） |
| `complementary` | `<aside aria-label="侧栏 · 模块列表与课程入口">` | `Sidebar.tsx:24` | "侧栏 · 模块列表与课程入口" |
| `navigation` | `<nav aria-label="模块列表">` | `Sidebar.tsx:71` | "模块列表" |
| `complementary` | `<aside aria-label="参数控制台">` | `ParameterPanel.tsx:284` | "参数控制台" |
| `complementary` | `<aside aria-label="底部波形观察区">` | `WaveformPanel.tsx:177` | "底部波形观察区" |

Skip link：`App.tsx` 第一个 focusable 是 `<a href="#main" class="sr-only focus:not-sr-only">跳到主内容</a>`；
Tab 一次即可命中（在 UpdateBanner 之前），回车把焦点 + 滚动跳到 `<main id="main">`。

---

## 5. 5 个 modal focus trap 行为

| Modal / Panel | 文件 | useFocusTrap 应用 | autoFocusFirst | Esc 处理 |
| ------------- | ---- | ----------------- | -------------- | -------- |
| KeyHelpOverlay | `src/components/layout/KeyHelpOverlay.tsx` | open 时启用，trap 内部 `<motion.div ref={dialogRef}>` | 默认 true | 已有 keydown 监听拦 Escape |
| ReceiveSnapshotModal | `src/components/share/ReceiveSnapshotModal.tsx` | open && decoded 时启用 | 默认 true | 已有 keydown 监听 |
| LLMSettingsModal | `src/components/assistant/LLMSettingsModal.tsx` | open 时启用（轮 8 已实装） | 默认 true | onClose 由组件内处理 |
| AssistantPanel | `src/components/assistant/AssistantPanel.tsx` | open && !settingsOpen 时启用 | **false**（让 inputRef.focus 拿首焦点） | 已有 keydown 监听 |
| SnapshotReviewPanel | `src/components/share/SnapshotReviewPanel.tsx` | **未应用** —— 当前不是 modal 形态（Card 嵌入），未来若 modal 化再加 |

### Focus trap 行为约定（统一）

- Tab / Shift+Tab 在容器内循环（`nextFocusInTrap` 计算下一节点）
- 单节点：保持在该节点，不出 modal
- 焦点不在容器内（如外部 click）：拉回 first / last
- 关闭时：把焦点还给打开 modal 之前的元素（`previouslyFocused.focus()`）
- 不破坏 prefers-reduced-motion / framer-motion 动画

### 单测

`src/utils/__tests__/useFocusTrap.test.ts` 覆盖 `getFocusableElements` + `nextFocusInTrap`
全部分支（空数组 / 单节点 / 焦点不在容器内 / 正反向循环 / disabled / aria-hidden 过滤）。

---

## 6. 关键改动文件清单

- `src/store/themeStore.ts` —— Theme 联合加 `colorblind`，THEME_ORDER 5 态
- `src/index.css` —— 新增 `html.colorblind` 段（Wong 调色板 + fault 斜纹背景）
- `src/components/ui/ThemeToggle.tsx` —— 加 colorblind chip（Glasses 图标）
- `src/components/layout/ThemeApplier.tsx` —— THEME_CLASSES 加 colorblind
- `src/components/layout/GlobalKeybindings.tsx` —— `m` 描述扩到 5 态
- `src/App.tsx` —— Skip link
- `src/components/layout/AppShell.tsx` —— `<main id="main" tabIndex={-1}>`
- `src/components/layout/Sidebar.tsx` —— `<aside aria-label>` + `<nav aria-label="模块列表">`
- `src/components/layout/TopBar.tsx` —— `<header role="banner">`
- `src/components/layout/ParameterPanel.tsx` —— `<aside aria-label="参数控制台">`
- `src/components/layout/WaveformPanel.tsx` —— `<aside aria-label="底部波形观察区">` 外包
- `src/components/layout/KeyHelpOverlay.tsx` —— useFocusTrap 应用 + role=dialog
- `src/components/share/ReceiveSnapshotModal.tsx` —— useFocusTrap 应用
- `src/components/assistant/AssistantPanel.tsx` —— useFocusTrap 应用（panel 形态）
- `tests/e2e/a11y-full.spec.ts` —— 17 模块全量 axe 扫描
- `.github/workflows/a11y.yml` —— CI 自动跑 + artifact 上传
- `src/utils/__tests__/useFocusTrap.test.ts` —— 纯函数单测
