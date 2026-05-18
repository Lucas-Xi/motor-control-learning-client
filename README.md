# 压缩机变频器控制学习客户端

![PR CI](https://github.com/<OWNER>/<REPO>/actions/workflows/pr.yml/badge.svg)
![Release Audit](https://github.com/<OWNER>/<REPO>/actions/workflows/release-audit.yml/badge.svg)
![Nightly Desktop](https://github.com/<OWNER>/<REPO>/actions/workflows/nightly-desktop.yml/badge.svg)

> 上面三个 badge 的 `<OWNER>/<REPO>` 占位请在 GitHub 上 fork / 创建仓库后替换为真实 `owner/repo`（例如 `vincent-xi/motor-control-learning-client`）。CI 由 GitHub Actions 驱动：
>
> - **PR CI**（`.github/workflows/pr.yml`）：每个指向 `main` 的 PR 触发，跑 `verify + fault-waves + tsc + vitest + build`，目标 5 分钟内反馈。
> - **Release Audit**（`.github/workflows/release-audit.yml`）：`push` 到 `main` + 手动触发，PR CI 全部 + Playwright e2e，上传 `test-results` 工件。
> - **Nightly Desktop Pack**（`.github/workflows/nightly-desktop.yml`）：每日 UTC 18:00（北京 02:00）+ 手动触发，在 `windows-latest` 上 `npm run desktop:pack` 并把 `release/win-unpacked` 压成 zip 上传 7 天。
>
> 本机想完整预跑 PR CI 的等价步骤：`npm run ci:local`（等价于 `npm ci → verify → fault-waves → tsc → vitest → build`，默认跳过 `npm ci`，加 `-- --with-install` 才会装依赖）。

面向初中级嵌入式工程师的**压缩机变频器**专项学习客户端，覆盖空调 / 冰箱 / 工业制冷三类典型压缩机驱动。基础部分讲清 BLDC / PMSM / FOC / SVPWM / Park-Clarke 等通用电机控制；进阶部分围绕压缩机特有场景：V/f 软启动 + HFI 高频注入低速无感 + MTPA + 弱磁过渡 + 共振点避让 + 转矩脉动抑制 + 反液击 + APF 前级 + 压缩机典型故障。

当前项目同时支持 Vite Web 运行与 Electron Windows 客户端打包，产出免安装目录 `release/win-unpacked/电机控制学习客户端.exe`（产物文件名暂保持兼容，下一波会同步换名）。

## 当前完成内容

- 深色科技风工程仿真 UI：左侧模块导航、中间交互教学区、右侧参数控制台、底部波形观察区；右侧控制台已拆成“参数 / 引导 / 案例”三段，避免把教学卡片和滑块堆在一起。
- 全局状态管理：基于 Zustand 管理当前模块、运行/暂停、教学/实验模式、参数和时间轴。
- 真实算法模块：Clarke、Park、反 Park、PI/PID、SVPWM、PMSM 简化模型、逆变器平均模型、反电动势观测、PLL、弱磁电压限制。
- 可交互模块：
  - 三相正弦波与旋转磁场：幅值、频率、相位、不平衡、谐波、噪声实时影响三相波形、αβ 矢量和 3D 电机磁场。
  - Clarke 变换：平衡三相/手动 Ia Ib Ic，实时显示 Iα、Iβ、I0 和投影矩阵。
  - Park 变换：电角度、Iα、Iβ、转速和负载参数调节，实时显示 Id/Iq、dq 旋转轴和 3D 转子磁链。
  - PID 控制：Kp/Ki/Kd、目标值、负载扰动、限幅、采样周期和抗积分饱和实时影响阶跃响应、超调、上升时间和稳态误差。
  - SVPWM：Uα/Uβ、母线电压、电角度、调制比实时驱动六边形空间矢量图、扇区高亮、T1/T2/T0 和三相 duty；可直接点击/拖拽空间矢量白点修改电压矢量。
  - FOC 总体流程：按 PWM 中断周期拆解采样、Clarke、Park、电流 PI、反 Park、SVPWM、逆变器和角度反馈，每一步显示输入/输出探针；可点击流程块锁定探针观察输入输出。
  - 逆变器：Udc、PWM 频率、死区、三相占空比和负载电感驱动桥臂、相电压/线电压与死区畸变可视化。
  - 无感 FOC：转速、Ke、Rs、Ls、观测器增益、PLL Kp/Ki 和噪声驱动真实角度/估算角度/反电动势曲线。
  - 弱磁控制：Udc、目标转速、Id/Iq、Ld/Lq、磁链和电流限制驱动电流/电压极限地图、转矩功率曲线；Id/Iq 工作点支持直接拖拽，实时判断电压饱和和电流限制。
  - 故障调试：8 类故障注入，展示波形现象、可能原因、排查步骤、解决建议和 STM32 对应关系。
- 主要模块页面：电机基础、三相磁场、Clarke、Park、PID、FOC 流程、SVPWM、逆变器、三闭环、无感 FOC、弱磁、故障调试均已接入导航和中文教学内容；其中电机基础、三相磁场、Clarke、Park、PID、FOC、SVPWM、逆变器、三闭环、无感、弱磁、故障调试都已经具备专属交互页。
- 图表与 3D：Recharts 波形图、SVG 矢量平面、React Three Fiber 电机/磁链/磁场场景；三相磁场模块的 3D 定子绕组亮度会随 Ia/Ib/Ic 实时变化。
- 动态实验引导：每个核心模块提供 Guided Lab 步骤，点击步骤会加载对应实验参数，并通过 Signal Path 流程轨道展示采样、变换、PI、SVPWM、逆变器等链路状态。
- 内置实验案例：12 个实验入口，覆盖三相磁场、Clarke、Park、PI 响应、SVPWM、弱磁、无感低速失败、相序错误、电流偏置等。

## 安装与运行

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

生产构建：

```bash
npm run build
```

## Windows 客户端 EXE

当前项目已经接入 Electron + electron-builder。先安装依赖并完成 Web 构建，然后执行桌面打包：

```bash
npm install
npm run desktop:pack
```

该命令会先执行 `npm run build`，再用本项目内置脚本 `scripts/package-electron-dir.mjs` 复制 Electron 运行时并生成免安装运行目录：

```text
release/win-unpacked/电机控制学习客户端.exe
```

如果希望使用“发布命令”名称，也可以执行：

```bash
npm run desktop:dist
```

当前 `desktop:dist` 会调用同一套稳定的免安装目录打包流程，产物仍是：

```text
release/win-unpacked/电机控制学习客户端.exe
```

说明：

- `desktop:pack` 生成带 `resources/` 的客户端目录，最稳定，适合本机交付和快速验收。
- `desktop:dist` 是稳定打包入口，当前等价于 `desktop:pack`，生成可运行的 Windows 客户端 exe 目录。
- `desktop:portable:builder` 是可选的 electron-builder 单文件便携版尝试；如果网络、安全策略或打包辅助组件阻塞，优先使用 `desktop:pack` / `desktop:dist` 生成的 exe 目录交付。
- Electron 主进程在 `electron/main.cjs`，预加载桥接在 `electron/preload.cjs`。
- Vite 已配置 `base: './'`，确保生产资源可以在 `file://` 协议下被 Electron 正确加载。

项目完整性验证：

```bash
npm run verify
```

端到端冒烟测试：

```bash
npm run e2e
```

截图 QA 证据：

```bash
npm run qa:screenshots
```

该命令会逐个打开 12 个模块，在桌面端和移动端各截一组图，输出到 `output/screenshots/`，用于交付前快速检查 UI 是否破版。

离线文档站点：

```bash
npm run docsite       # 生成 docs/site/ 静态 HTML 站点（17 模块 + walkthrough + 术语 / 公式 / 故障速查）
node scripts/verify-docsite.mjs   # 校验产物完整性
```

`docs/site/index.html` 可直接双击打开或托管到 GitHub Pages；每个详情页右上角有"打印"按钮可输出纸质教材。

发布前完整审计：

```bash
npm run release:audit
```

该命令会依次运行 `verify`、`build`、`e2e` 和截图采集，适合每次交付或封装 Electron 前使用。

可选端到端冒烟测试：

```bash
npm run e2e:optional
```

如果未安装 Playwright，该命令会安全跳过并给出安装提示；安装后会自动启动 Vite dev server，逐个打开 12 个学习模块并检查基础交互。

本项目已在当前环境验证 `npm run build` 通过。


## GPT Image 2 素材管线

项目已接入可维护的 AI 视觉素材体系：

- 素材清单：`src/content/visualAssets.ts`
- 批量提示词：`tmp/imagegen/motor-control-prompts.jsonl`
- 生成脚本：`scripts/generate-image-assets.ps1`
- 素材优化脚本：`scripts/optimize-image-assets.py`
- 生成说明：`docs/ASSET_PIPELINE.md`
- 最终素材目录：`public/assets/generated/`

使用用户提供的 OpenAI 兼容供应商时，请不要把密钥写入代码或提交到仓库，只在当前 PowerShell 会话中设置：

```powershell
$env:OPENAI_API_KEY="你的密钥"
.\scripts\generate-image-assets.ps1 -BaseUrl "https://codex.ciii.club/v1" -Concurrency 3
```

如果该供应商要求不带 `/v1` 的完整地址，可把 `-BaseUrl` 改成 `https://codex.ciii.club`。应用中的 `AssetHero` 会优先加载生成素材；没有素材时会自动显示代码生成的工程仿真 fallback 视觉。

## 项目结构

```text
src/
  main.tsx
  App.tsx

  components/
    layout/
      AppShell.tsx          # 总体客户端壳层
      Sidebar.tsx           # 12 个学习模块导航
      TopBar.tsx            # 运行/暂停/单步/模式切换
      SimulationPanel.tsx   # 中间仿真教学区
      ParameterPanel.tsx    # 右侧参数控制台
      WaveformPanel.tsx     # 底部波形观察区
      FormulaPanel.tsx      # 可折叠公式、代码、教学讲义
      ExperimentGuideCard.tsx # 动态实验步骤与一键参数加载
      InteractionHud.tsx     # 参数-现象实时联动监视器
      ModuleFlowRail.tsx     # 模块信号流动画轨道

    ui/
      Button.tsx
      Card.tsx
      Slider.tsx
      Tabs.tsx

    charts/
      ThreePhaseWaveform.tsx
      DQWaveform.tsx
      PWMChart.tsx
      StepResponseChart.tsx
      VectorPlane.tsx
      SpaceVectorHexagon.tsx

    three/
      Motor3D.tsx
      MagneticField3D.tsx
      Inverter3D.tsx
      RotorFluxScene.tsx

  modules/
    motor-basics/
    three-phase/
    clarke-transform/
    park-transform/
    pid-control/
    foc-flow/
    svpwm/
    inverter/
    control-loops/
    sensorless-foc/
    field-weakening/
    faults-debugging/
    ModuleRenderer.tsx
    pid-control/PIDControlModule.tsx
    svpwm/SVPWMModule.tsx

  simulation/
    math/
      transforms.ts       # Clarke / Park / 反 Park / 三相电流生成
      pid.ts              # PI / PID / 阶跃响应仿真
      svpwm.ts            # 扇区、T1/T2/T0、占空比、母线利用率
      motorModel.ts       # 简化 PMSM dq 模型、电流环、速度环
      inverterModel.ts    # 三相逆变器平均模型、死区影响
      observer.ts         # 反电动势估算、PLL 跟踪
      weakField.ts        # 弱磁电压限制、转矩估算

    engine/
      SimulationEngine.ts
      types.ts
      presets.ts

  content/
    lessons.ts            # 12 个模块中文教学内容
    formulas.ts
    glossary.ts

  store/
    simulationStore.ts
    uiStore.ts

  utils/
    format.ts
    clamp.ts
    signal.ts

docs/
  ASSET_PIPELINE.md       # gpt-image-2 素材生成与回退策略
  MODULE_EXTENSION.md     # 新教学模块接入、路由与参数扩展说明
```

## 算法模块说明

算法全部放在 `src/simulation/math`，UI 不直接写控制算法，方便后续移植到 C / STM32 / MATLAB。

- `transforms.ts`
  - `clarkeTransform`
  - `parkTransform`
  - `inverseParkTransform`
  - `generateThreePhaseCurrent`
- `pid.ts`
  - `piStep`
  - `pidStep`
  - `simulatePidStepResponse`
- `svpwm.ts`
  - `determineSvpwmSector`
  - `calculateSvpwm`
  - `compareSpwmUtilization`
- `motorModel.ts`
  - `stepPmsmModel`
  - `simulateCurrentLoop`
  - `simulateSpeedLoop`
- `observer.ts`
  - `estimateBackEmf`
  - `pllTrack`
- `weakField.ts`
  - `checkVoltageLimit`
  - `estimateTorque`

每个核心函数都带有公式来源、变量单位和工程意义注释。

## 如何扩展一个新教学模块

1. 在 `src/simulation/engine/types.ts` 中扩展 `ModuleId`。
2. 在 `src/simulation/engine/presets.ts` 中添加模块元数据和实验案例。
3. 在 `src/content/lessons.ts` 中添加中文教学内容。
4. 在 `src/modules/<module-name>/` 下添加专属交互页面。
5. 在 `src/modules/ModuleRenderer.tsx` 中接入新页面。
6. 如需新参数，在 `src/store/simulationStore.ts` 中添加参数结构和更新函数。
7. 如需新算法，放入 `src/simulation/math/`，保持纯函数或显式状态输入输出。

更完整的接入流程、页面模板和维护约定，见 `docs/MODULE_EXTENSION.md`。

## 模块扩展说明

这个项目的模块设计遵循“内容、参数、算法、页面、路由、实验”六层分离：

- 内容层：在 `src/content/lessons.ts` 中补充中文讲义、公式和 STM32 调试建议。
- 参数层：在 `src/simulation/engine/types.ts` 与 `src/store/simulationStore.ts` 中增加独立参数结构。
- 算法层：在 `src/simulation/math/` 中新增纯函数，不把控制逻辑写进 UI。
- 页面层：在 `src/modules/<module-id>/` 中实现独立模块页，图表、3D 和文案都在该页完成组合。
- 路由层：在 `src/modules/ModuleRenderer.tsx` 中接入新模块，避免走泛化 fallback。
- 实验层：在 `src/simulation/engine/presets.ts` 中增加预设案例，让用户一键进入典型调试场景。

建议新增模块时按照 `docs/MODULE_EXTENSION.md` 的顺序执行，这样可以保证代码结构、教学内容和交互体验同步落地，而不是只加一个静态页面。

## STM32 / C 迁移建议

- 先迁移 `transforms.ts`、`pid.ts`、`svpwm.ts` 中的纯函数。
- 所有角度统一使用电角度 rad，进入三角函数前做归一化。
- ADC 中断中只做快环必要计算：采样、Clarke、Park、PI、反 Park、SVPWM、更新 CCR。
- 速度环、位置环、通信和日志放在低频任务中。
- 保留关键变量观测：Ia/Ib/Ic、Iα/Iβ、Id/Iq、Vd/Vq、sector、dutyA/B/C、theta、speed、fault flags。

## 后续阶段建议

1. 为 FOC 流程模块增加可单步执行的数据流动画和每步输入/输出探针。
2. 为逆变器模块增加更完整的三相桥开关动画、死区失真曲线和相电压/线电压切换。
3. 为无感 FOC 增加真实角度 vs 估算角度、PLL 锁相过程和低速失败曲线。
4. 为弱磁模块增加电压极限圆、电流极限圆、恒转矩/恒功率分区图。
5. 增加 Electron 打包配置，形成离线桌面客户端。
6. 为所有模块补充截图级视觉回归测试和端到端交互测试。
