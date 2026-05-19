# Section 508 §1194.22 合规性映射

> 美国 1973 Rehabilitation Act §508，1998 修订强制联邦机构采购的 ICT 产品需满足无障碍要求。
> §1194.22 是 "Web-based intranet and internet information and applications" 子条款，共 21 条
> （subsection (a) - (p)，2017 年 Section 508 refresh 后已对齐 WCAG 2.0 A/AA；本仓库同时按
> WCAG 2.2 AA 校验，见 `docs/A11Y_AUDIT_R2.md`）。
>
> 本文档逐条标 OK / WARN / NG，引用代码位置。任何 WARN / NG 必须配修复计划。

| Legend | 含义 |
| ------ | ---- |
| **OK**   | 已合规 |
| **WARN** | 部分合规 / 需要场景判定 |
| **NG**   | 未合规 |

## 1. §1194.22 (a) - (p) 逐条核查

### (a) Text equivalent / 非文本内容替代

- **状态**: **OK**
- **代码位置**:
  - `AssetHero.tsx` 所有 `<img>` 标 `alt`
  - `MotorAnatomy2D.tsx` SVG 图整体 `aria-label`，装饰元素 `aria-hidden="true"`
  - lucide-react `<Icon>` 全部带 `aria-hidden="true"`，紧邻文本提供语义
  - 拖拽 SVG（VectorPlane / SVPWM hexagon / PhDiagram）都有 `aria-label` 描述当前值

### (b) Multimedia / 多媒体替代

- **状态**: **OK** (N/A)
- 项目目前不含音/视频；未来若加 webm 演示视频，需配 caption track。

### (c) Color / 不仅靠颜色传递信息

- **状态**: **OK**
- **代码位置**:
  - `KpiTile.tsx` / `EnvelopeCell.tsx` / `MetricRow.tsx`：warn/fault 同时用颜色 + 图标 + sr-only 文本三通道
  - `index.css` 新增 `html.colorblind` 主题，把 fault 改朱红 + 斜纹背景，measure 改深蓝，warn 改橙
  - `ReceiveSnapshotModal.tsx`：变更字段除颜色外加 `●` 标记 + `<span class="sr-only">已变更：</span>`

### (d) Style sheets / 移除 CSS 仍可读

- **状态**: **OK**
- **代码位置**:
  - DOM 顺序 = 阅读顺序（移动端 `order-*` 也保证 Sim → Params → Wave）
  - 无依赖 CSS background-image 传递信息（fault 斜纹仅是冗余通道）
  - `<header> / <main> / <aside> / <nav>` 语义化标签让 reader mode 自动结构化

### (e) Image map server-side / 服务端 image map

- **状态**: **OK** (N/A)
- 不使用 `<map>` 元素。

### (f) Image map client-side / 客户端 image map

- **状态**: **OK** (N/A)
- 不使用 `<map>` 元素；交互式 SVG 用 `<g role="button" tabindex="0">` 替代。

### (g) Data tables · row/col headers / 数据表行列头

- **状态**: **OK**
- **代码位置**:
  - `ReceiveSnapshotModal.tsx`：diff 表 `<th scope="col">` + `<th scope="row">`
  - `SnapshotReviewPanel.tsx`：summary 表同样规则

### (h) Data tables · complex headers / 复杂表头

- **状态**: **OK** (N/A)
- 项目未出现需要 `headers=`/`id=` 关联的复杂多级表头。

### (i) Frames title / `<frame>` 标题

- **状态**: **OK** (N/A)
- 项目不使用 `<frame>` / `<frameset>`；Electron WebView 也不用 iframe。

### (j) Flicker rate / 闪烁频率（2-55 Hz 禁用）

- **状态**: **OK**
- **代码位置**:
  - `index.css` 全局 `@media (prefers-reduced-motion: reduce)` 把所有动画压到 0.001ms
  - 仿真波形帧率受 `requestAnimationFrame` 控制，不会超过显示器刷新率；不主动 flash
  - 故障告警 chip 不闪烁，仅用颜色 + 图标

### (k) Text-only alternative / 纯文本替代

- **状态**: **OK** (N/A)
- 整站语义化 HTML，无需独立 text-only 版本；所有可视信息都有等价文本（aria-label / sr-only）

### (l) Scripting accessible / 脚本动态内容可访问

- **状态**: **OK**
- **代码位置**:
  - 所有 React event handler 同时支持 click + keydown（如 SVG `<g onClick onKeyDown>`）
  - 动态 toast 用 `role="alert"` 让 reader 立即朗读
  - 流式 LLM 输出 chip 用 `role="status"`（非打断式）

### (m) Plug-ins / 插件需可访问

- **状态**: **OK** (N/A)
- 不依赖 Flash / Java Applet 等外部插件；Electron 自带 Chromium。

### (n) Electronic forms / 表单可访问

- **状态**: **OK**
- **代码位置**:
  - 所有 `<input>` 关联 `<label>` 或 `aria-label`（Slider / FaultTypes / RefrigerantPicker 都验证过）
  - 错误提示用 `aria-live="polite"` + `role="alert"`
  - Required 字段（如 PAT 输入）显式 `aria-required="true"`

### (o) Skip navigation / 跳过重复导航

- **状态**: **OK**
- **代码位置**:
  - `App.tsx` 第一个 focusable 元素：
    ```jsx
    <a href="#main" className="sr-only focus:not-sr-only ...">跳到主内容</a>
    ```
  - `AppShell.tsx` 主区：`<main id="main" tabIndex={-1}>`
  - Tab 一次即可激活 skip link，Enter 跳过 Sidebar + TopBar 直达模块内容
  - **focus trap**（`useFocusTrap`）保证 modal 内 Tab/Shift+Tab 不会逃出 → 避免焦点落到背后的 sidebar

### (p) Timed response · 超时给用户充足时间响应

- **状态**: **OK**
- **代码位置**:
  - 仿真无 timeout；用户可随时暂停（Space）/ 单步（s）
  - LLM 请求 `abortRef`，用户关闭面板自动取消
  - toast 3.2 秒自动关闭（仅装饰性 fallback 提示，非强制性输入）

## 2. 不符合 / 部分符合的修复计划

> 当前所有 21 条均为 **OK** 或 **OK (N/A)**。未来若引入下列场景需补：

| 触发场景 | 影响条款 | 修复计划 |
| -------- | -------- | -------- |
| 引入演示 webm 视频 | (b) | 配 VTT caption track + 转写文档 |
| 引入身份登录 | (p) + WCAG 2.2 SC 3.3.7 | session timeout 提前 20s 提示 + 一次延期机会 |
| 引入复杂数据表（如多级汇总） | (h) | `headers=` / `id=` / `scope=colgroup` 显式关联 |
| 引入外部 PDF 报告 | (a) | 提供同等 HTML 版本或 tagged PDF（PDF/UA） |

## 3. 自动化校验

| 工具 | 跑法 | 失败门 |
| ---- | ---- | ------ |
| axe-core 4.10.2 | `npx playwright test tests/e2e/a11y-full.spec.ts` | critical + serious = 0 |
| axe-core 抽样 | `npx playwright test tests/e2e/a11y.spec.ts` | 同上 |
| GitHub Actions | `.github/workflows/a11y.yml`（PR + 手动） | 同上 |
| useFocusTrap 单测 | `npx vitest run src/utils/__tests__/useFocusTrap.test.ts` | 100% 分支覆盖 |

## 4. 与 WCAG 2.2 AA 的关系

Section 508 (2017 refresh) 把 §1194.22 (a)-(p) 21 条全部映射到 WCAG 2.0 A/AA 38 条；本仓库
按 WCAG 2.2 AA（64 条）做更严标准，自然覆盖 §508。详见 `docs/A11Y_AUDIT_R2.md` 的 SC 抽样表。

## 5. 维护承诺

- 新增 modal → 必须接入 `useFocusTrap`，并在 A11Y_AUDIT_R2.md `5 modal 表`追加一行
- 新增颜色 token → 必须同时更新 `html.colorblind` 段，并验证 deuteranopia 模拟下可区分
- 新增数据表 → 显式标 `scope`；axe 若报 `td-headers-attr` 必须修复
- CI 失败 → 不允许 merge；通过 `npm run release:audit` 在本地复现
