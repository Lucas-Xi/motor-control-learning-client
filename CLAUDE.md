# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

交互式 BLDC / PMSM / FOC / SVPWM 学习客户端，面向初中级嵌入式工程师。同时支持 Vite Web 与 Electron Windows 桌面打包，产物为免安装运行目录 `release/win-unpacked/电机控制学习客户端.exe`。所有教学文案、UI、参数与提示语都使用中文。

技术栈：React 19 + TypeScript + Vite 7 + Tailwind 3 + Zustand 5 + React Three Fiber + Recharts + Framer Motion + Electron 42。

## 常用命令

```bash
npm run dev              # Vite 开发服务器（http://127.0.0.1:5173）
npm run build            # vite build（CI / 发布前必跑）
npm run typecheck        # tsc -b --noEmit 独立类型检查
npm run test             # vitest run（全部 82 个文件 842 个测试）
npm run test:watch       # vitest watch 模式
npm run coverage         # vitest run --coverage（含 v8 覆盖率报告）
npm run verify           # node 脚本，检查必须文件齐全 + 关键 import 存在
npm run e2e              # Playwright 冒烟测试（自动起 dev server，复用已有实例）
npm run e2e:optional     # Playwright 未装时安全跳过的兜底入口
npm run qa:screenshots   # 16 个模块的桌面/移动双端截图，输出到 output/screenshots/
npm run release:audit    # 顺序跑 verify → build → e2e → screenshots，发布前必跑
npm run desktop:pack     # build 后调用 scripts/package-electron-dir.mjs，产出 win-unpacked 目录
npm run desktop:dist     # 当前等价于 desktop:pack（稳定的免安装目录形式）
```

跑单个 Playwright 测试：`npx playwright test tests/e2e/smoke.spec.ts -g "<标题>"`。

`desktop:portable:builder`（electron-builder 单文件 portable）属于可选尝试，遇到网络/安全策略阻塞时优先用 `desktop:pack` 交付。

## 架构（六层分离）

新模块严格按"内容 / 参数 / 算法 / 页面 / 路由 / 实验"六层接入，**不要回退到任何 GenericModule fallback**。完整流程见 `docs/MODULE_EXTENSION.md`，简述：

1. **类型** — `src/simulation/engine/types.ts`：扩展 `ModuleId` 联合类型 + 模块独立参数 interface。
2. **预设** — `src/simulation/engine/presets.ts`：`moduleMetas` 元数据 + 默认参数 + 一个或多个 `experimentPresets`。
3. **状态** — `src/store/simulationStore.ts`（Zustand）：新增 state 字段、`update<Module>` patch 函数、`resetActiveParams` 分支、`applyExperimentPreset` 分支。
4. **算法** — `src/simulation/math/` 下的纯函数。**UI 层不写控制算法**；迭代状态显式传入 / 返回，方便平移到 STM32 / MATLAB。所有角度统一电角度 rad，三角函数前归一化。
5. **教学内容** — `src/content/lessons.ts` 中文讲义；如涉及新公式/术语同步更新 `formulas.ts` 和 `glossary.ts`。
6. **页面** — `src/modules/<module-id>/<ModuleName>Module.tsx`，目录用 kebab-case，组件 PascalCase。
7. **路由** — `src/modules/ModuleRenderer.tsx` 显式 `if (moduleId === ...)` 分支接入。

### 关键约束

- 算法纯函数集中在 `src/simulation/math/`：`transforms.ts`（Clarke/Park/反 Park）、`pid.ts`、`svpwm.ts`、`motorModel.ts`（PMSM dq 模型）、`inverterModel.ts`、`observer.ts`（反电动势 + PLL）、`weakField.ts`。每个核心函数都需带公式来源、单位和工程意义注释。
- 全局唯一 store 是 `useSimulationStore`（Zustand）。`activeModule` 决定渲染哪个页面，`mode: 'teach' | 'lab'` 区分教学 / 实验模式，`running` + `time` + `step()` 驱动仿真时钟。
- Vite `base: './'` 是给 Electron `file://` 协议用的，不要改成 `/`。
- Vite 构建已手动 chunk：`charts`（recharts）、`three`（three + R3F）、`motion`（framer-motion）。新加大依赖时考虑是否扩展 `manualChunks`。
- 视觉令牌定义在 `tailwind.config.js` 的 `colors.bg/line/ink/accent` 与 `src/index.css` 的 CSS 变量中——`accent.primary`（cyan，交互主态）、`accent.measure`（mint，测量值/正确）、`accent.warn`（amber，警告）、`accent.fault`（rose，故障）。**禁止**重新引入 `shadow-neon` / `shadow-mint` 累积发光、`backdrop-blur`、`bg-radial-grid` 等装饰，也不要在每模块自己写入场动画 / AssetHero / 公式面板。
- 布局壳层 `AppShell.tsx` 组合：`Sidebar`（导航）/ `TopBar`（运行控制）/ `SimulationPanel`（中央：模块标题 + `GuidedExperimentBar` + 模块内容）/ `ParameterPanel`（右侧两段：参数 schema 驱动 / 案例）/ `WaveformPanel`（底部波形）。`ModuleLayout` 是模块统一三槽外壳（primary / probe / concept），`ConceptNotes` 是教学讲义折叠区，`GuidedExperimentBar` 合并了原来的引导/流程/HUD 三处。
- 组件订阅 store **必须用切片选择器** `useSimulationStore((s) => s.xxx)`，不要 `useSimulationStore()` 整把抓——会被每帧 `time` 推送拉爆重渲染。
- 拖拽交互（SVPWM 矢量、Park αβ 矢量、弱磁 Id-Iq 工作点）的 pointermove 必须经 `useRafThrottle`，每帧最多一次 store 写入。
- 模块页通过 `lazy()` 自动按模块拆分独立 chunk；`ModuleRenderer.tsx` 内保留 `moduleId === '<id>'` 字面（即使是注释）以满足 `verify-project.mjs` 静态校验。
- `verify-project.mjs` 用文件路径 + 关键字符串白名单做静态检查。**新增/重命名/删除核心 layout 或算法文件时，必须同步更新该脚本的 `requiredFiles` 列表**，否则 `release:audit` 会红。

### Electron 集成

- 主进程 `electron/main.cjs`，预加载桥 `electron/preload.cjs`（`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`）。
- 渲染入口：开发态优先 `process.env.ELECTRON_START_URL || VITE_DEV_SERVER_URL`，生产态 `dist/index.html`。
- `scripts/package-electron-dir.mjs` 会清空 `release/win-unpacked/`，复制 `node_modules/electron/dist`，把 `electron.exe` 重命名为 `电机控制学习客户端.exe`，然后把 `dist/`、`electron/`、`package.json` 拷进 `resources/app/`。打包前必须先 `npm run build` 生成 `dist/`。
- IPC 仅暴露 `desktop:get-metadata`（name / version / platform / isPackaged）。

## AI 视觉素材管线

`src/content/visualAssets.ts` 是素材清单；`AssetHero` 优先加载 `public/assets/generated/` 下的产物，缺失时自动回退到代码生成的工程仿真视觉。生成走 `scripts/generate-image-assets.ps1`（PowerShell，需在当前会话设置 `$env:OPENAI_API_KEY`，**禁止把密钥写入仓库**）。优化走 `scripts/optimize-image-assets.py`。详细见 `docs/ASSET_PIPELINE.md`。

## STM32 / C 迁移参考

迁移优先级：`transforms.ts` → `pid.ts` → `svpwm.ts`。ADC 中断只跑快环（采样 → Clarke → Park → PI → 反 Park → SVPWM → 更新 CCR），速度环 / 位置环 / 通信 / 日志放低频任务。关键观测变量：`Ia/Ib/Ic`、`Iα/Iβ`、`Id/Iq`、`Vd/Vq`、`sector`、`dutyA/B/C`、`theta`、`speed`、`fault flags`。
