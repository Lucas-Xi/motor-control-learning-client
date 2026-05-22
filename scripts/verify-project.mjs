import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];
const evidence = [];

function file(path) {
  return readFileSync(join(root, path), 'utf8');
}

function requireFile(path) {
  if (!existsSync(join(root, path))) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  evidence.push(`file:${path}`);
  return file(path);
}

function requireIncludes(name, text, needles) {
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${name} missing: ${needle}`);
  }
}

const requiredFiles = [
  'src/main.tsx',
  'src/App.tsx',
  'src/components/layout/AppShell.tsx',
  'src/components/layout/Sidebar.tsx',
  'src/components/layout/TopBar.tsx',
  'src/components/layout/SimulationPanel.tsx',
  'src/components/layout/ParameterPanel.tsx',
  'src/components/layout/WaveformPanel.tsx',
  'src/components/layout/AssetHero.tsx',
  'src/components/layout/ConceptNotes.tsx',
  'src/components/layout/ModuleLayout.tsx',
  'src/components/layout/GuidedExperimentBar.tsx',
  'src/content/parameterSchemas.ts',
  'src/components/ui/Button.tsx',
  'src/components/ui/Card.tsx',
  'src/components/ui/Slider.tsx',
  'src/components/ui/Tabs.tsx',
  'src/components/charts/ThreePhaseWaveform.tsx',
  'src/components/charts/DQWaveform.tsx',
  'src/components/charts/PWMChart.tsx',
  'src/components/charts/StepResponseChart.tsx',
  'src/components/charts/VectorPlane.tsx',
  'src/components/charts/SpaceVectorHexagon.tsx',
  'src/components/charts/SafeResponsiveContainer.tsx',
  'src/components/three/Motor3D.tsx',
  'src/components/three/MagneticField3D.tsx',
  'src/components/three/Inverter3D.tsx',
  'src/components/three/RotorFluxScene.tsx',
  'src/simulation/math/transforms.ts',
  'src/simulation/math/pid.ts',
  'src/simulation/math/svpwm.ts',
  'src/simulation/math/motorModel.ts',
  'src/simulation/math/inverterModel.ts',
  'src/simulation/math/observer.ts',
  'src/simulation/math/weakField.ts',
  'src/simulation/math/refrigerantProps.ts',
  'src/simulation/math/vaporCycle.ts',
  'src/simulation/math/seasonalPerformance.ts',
  'src/modules/refrigeration-bench/SeasonalCopCard.tsx',
  'src/modules/refrigeration-bench/DefrostCycleCard.tsx',
  'src/modules/refrigeration-bench/PartLoadEfficiencyCard.tsx',
  'src/modules/refrigeration-bench/FourQuadrantCard.tsx',
  'src/simulation/engine/focFlow.ts',
  'src/simulation/engine/types.ts',
  'src/simulation/engine/presets.ts',
  'src/store/simulationStore.ts',
  'src/store/uiStore.ts',
  'src/content/lessons.ts',
  'src/content/lessonsEn.ts',
  'src/content/faultCases.ts',
  'src/content/guidedExperiments.ts',
  'src/content/visualAssets.ts',
  'src/content/curriculum/index.ts',
  'src/store/curriculumStore.ts',
  'src/components/curriculum/CurriculumPanel.tsx',
  'src/content/stm32Export/projectGenerator.ts',
  'src/content/stm32Export/types.ts',
  'src/content/stm32Export/mcuTemplate.ts',
  'src/content/stm32Export/stm32g4Templates.ts',
  'src/content/stm32Export/stm32f4Templates.ts',
  'src/content/stm32Export/stm32h7Templates.ts',
  'src/components/lab/ProjectExporter.tsx',
  // 关于 / 许可证 / 隐私声明（round-9 商业化要件）
  'src/components/about/AboutModal.tsx',
  'LICENSE',
  'LICENSE-COMMERCIAL.md',
  'docs/PRIVACY.md',
  // round-10 物理真实化 Tier 1：饱和电感 / 铁损 / 齿槽 + BEMF 谐波
  'src/simulation/math/saturation.ts',
  'src/simulation/math/ironLoss.ts',
  'src/simulation/math/cogging.ts',
  // round-10 接入 UI 的可视化卡片
  'src/modules/motor-basics/SaturationMapCard.tsx',
  'src/modules/motor-basics/CoggingTorqueCard.tsx',
  'src/modules/control-loops/IronLossBreakdownCard.tsx',
  // round-11 物理真实化扩展（A+B+C+D）：温度补偿 / 摩擦 / 开关损耗+结温 / Wagner 高精度制冷剂 / HD 集成模型
  'src/simulation/math/thermalRsFlux.ts',
  'src/simulation/math/friction.ts',
  'src/simulation/math/switchingLoss.ts',
  'src/simulation/math/wagnerEq.ts',
  'src/simulation/math/motorModelHd.ts',
  // round-11 接入 UI 的可视化卡片
  'src/modules/motor-basics/ModelComparisonCard.tsx',
  'src/modules/inverter/SwitchingLossCompareCard.tsx',
  'src/modules/refrigeration-bench/WagnerVsAntoineCard.tsx',
  // round-11 Tier 3 + B + C：传感器噪声 + vaporCycle HD + focLoop HD
  'src/simulation/math/sensorNoise.ts',
  'src/modules/sensorless-foc/SensorNoiseCard.tsx',
  // round-13 工业最后一公里：ε-NTU 换热器
  'src/simulation/math/heatExchanger.ts',
  'src/modules/refrigeration-bench/HeatExchangerSizingCard.tsx',
  // round-14 工业最后一公里：PWM 开关瞬态 + 死区可视化
  'src/simulation/math/pwmTransient.ts',
  'src/modules/inverter/PwmTransientCard.tsx',
  // 轻量 i18n 框架（shell + 3 个核心模块双语；自研无新依赖）
  'src/i18n/types.ts',
  'src/i18n/translations.ts',
  'src/i18n/useI18n.ts',
  'src/i18n/LanguageChip.tsx',
  'src/i18n/index.ts',
  'src/store/i18nStore.ts',
  // Phase C：解题路径回放 / 历史对比 / 标定单 + 真 zip
  'src/store/replayStore.ts',
  'src/utils/zipMinimal.ts',
  'src/components/workshop/SolutionReplay.tsx',
  'src/components/workshop/SnapshotDiffPanel.tsx',
  'src/components/workshop/CalibrationDocExporter.tsx',
  // 实测对照（Web Serial 实板对接）
  'src/utils/serialBridge.ts',
  'src/store/serialStore.ts',
  'src/components/lab/SerialBenchPanel.tsx',
  // 模块内 SerialCompare 卡片：16 张分布在各模块的 probe slot
  'src/components/lab/SerialCompareCardShell.tsx',
  'src/utils/serialMockGenerators.ts',
  'src/modules/foc-flow/SerialCompareIqIdCard.tsx',
  'src/modules/motor-basics/SerialCompareThetaCard.tsx',
  'src/modules/inverter/SerialCompareDeadTimeCard.tsx',
  'src/modules/faults-debugging/SerialFaultInjectionCard.tsx',
  'src/modules/control-loops/SerialCompareSpeedLoopCard.tsx',
  'src/modules/hfi-sensorless/SerialCompareHFICard.tsx',
  'src/modules/startup-statemachine/SerialCompareStartupCard.tsx',
  'src/modules/apf-frontend/SerialComparePFCCard.tsx',
  // Round 9 新增 8 张：覆盖剩余基础 / 控制 / 调制 / 进阶 / 系统模块
  'src/modules/three-phase/SerialCompareThreePhaseCard.tsx',
  'src/modules/clarke-transform/SerialCompareClarkeCard.tsx',
  'src/modules/park-transform/SerialCompareParkCard.tsx',
  'src/modules/pid-control/SerialComparePIDCard.tsx',
  'src/modules/svpwm/SerialCompareSvpwmCard.tsx',
  'src/modules/sensorless-foc/SerialCompareSensorlessCard.tsx',
  'src/modules/field-weakening/SerialCompareFieldWeakeningCard.tsx',
  'src/modules/refrigeration-bench/SerialCompareRefrigerationCard.tsx',
  // 数字孪生分享 token：URL-safe base64 编解码 + 生成 / 接收 modal
  'src/utils/snapshotCodec.ts',
  'src/components/share/ShareSnapshotPanel.tsx',
  'src/components/share/ReceiveSnapshotModal.tsx',
  // 数字孪生 V2 · 云协作（GitHub Gist + BroadcastChannel + Markdown 评论）
  'src/utils/gistCloud.ts',
  'src/utils/broadcastShare.ts',
  'src/store/cloudShareStore.ts',
  'src/components/share/GistCredentialsPanel.tsx',
  'src/components/share/CloudSharePanel.tsx',
  'src/components/share/CommentRenderer.tsx',
  // 数字孪生 V3 · PR-style review（参数级评论 + 建议改动 + 修订时间线）
  'src/utils/reviewModel.ts',
  'src/store/reviewersStore.ts',
  'src/components/share/SnapshotReviewPanel.tsx',
  'src/components/share/SnapshotTimeline.tsx',
  'src/components/share/SnapshotPickerDialog.tsx',
  // 学习洞察：错题本 + 步骤热力图 + 弱项推荐（zustand persist，仅本地）
  'src/store/insightsStore.ts',
  'src/components/insights/MistakeBookPanel.tsx',
  'src/components/insights/HeatmapPanel.tsx',
  'src/components/insights/WeaknessAdvicePanel.tsx',
  'src/components/insights/InsightsView.tsx',
  // 本地教学助手：纯前端 RAG（BM25 + 启发式拼装），不调外部 LLM
  'src/utils/ragIndex.ts',
  'src/store/assistantStore.ts',
  'src/components/assistant/AssistantPanel.tsx',
  'src/components/assistant/FloatingChatButton.tsx',
  'src/components/assistant/CitationLink.tsx',
  'src/components/assistant/LLMSettingsModal.tsx',
  'docs/ASSET_PIPELINE.md',
  'docs/MODULE_EXTENSION.md',
  'scripts/generate-image-assets.ps1',
  'scripts/generate-image-assets-raw.mjs',
  'scripts/optimize-image-assets.py',
  'scripts/capture-screenshots.mjs',
  'scripts/package-electron-dir.mjs',
  'scripts/release-audit.mjs',
  'scripts/e2e-smoke.mjs',
  'scripts/verify-project.mjs',
  'scripts/ci-local.mjs',
  'scripts/build-docsite.mjs',
  'scripts/verify-docsite.mjs',
  // GitHub Actions CI / 模板（与 README badge、PR / Issue 流程对齐）
  '.github/workflows/pr.yml',
  '.github/workflows/release-audit.yml',
  '.github/workflows/nightly-desktop.yml',
  '.github/ISSUE_TEMPLATE/bug-report.md',
  '.github/ISSUE_TEMPLATE/feature-request.md',
  '.github/ISSUE_TEMPLATE/walkthrough-feedback.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/CODEOWNERS',
  'playwright.config.ts',
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/menu.cjs',
  'electron/tray.cjs',
  'electron/splash.cjs',
  'electron/update.cjs',
  'src/utils/desktopBridge.ts',
  'src/components/desktop/UpdateBanner.tsx',
  'docs/ELECTRON_AUTOUPDATE.md',
  '.github/workflows/release.yml',
  'tests/e2e/smoke.spec.ts',
  // a11y R2：focus trap util + 17 模块 axe 扫描 + CI workflow + 二期审计文档
  'src/utils/useFocusTrap.ts',
  'src/utils/__tests__/useFocusTrap.test.ts',
  'tests/e2e/a11y-full.spec.ts',
  '.github/workflows/a11y.yml',
  'docs/A11Y_AUDIT_R2.md',
  'docs/SECTION_508_COMPLIANCE.md',
  'README.md',
];

for (const path of requiredFiles) requireFile(path);

const requiredBinaryFiles = [
  'public/assets/generated/motor-exploded-cover.png',
  'public/assets/generated/motor-exploded-cover.webp',
  'public/assets/generated/foc-flow-console.png',
  'public/assets/generated/foc-flow-console.webp',
  'public/assets/generated/svpwm-sector-map.png',
  'public/assets/generated/svpwm-sector-map.webp',
  'public/assets/generated/inverter-power-stage.png',
  'public/assets/generated/inverter-power-stage.webp',
  'public/assets/generated/sensorless-observer-console.png',
  'public/assets/generated/sensorless-observer-console.webp',
  'public/assets/generated/field-weakening-limit-map.png',
  'public/assets/generated/field-weakening-limit-map.webp',
  'public/assets/generated/fault-debug-board.png',
  'public/assets/generated/fault-debug-board.webp',
];

for (const path of requiredBinaryFiles) {
  if (!existsSync(join(root, path))) {
    failures.push(`Missing generated asset: ${path}`);
  }
}

const moduleIds = [
  'motor-basics',
  'three-phase',
  'clarke-transform',
  'park-transform',
  'pid-control',
  'foc-flow',
  'svpwm',
  'inverter',
  'control-loops',
  'sensorless-foc',
  'field-weakening',
  'faults-debugging',
  'hfi-sensorless',
  'startup-statemachine',
  'apf-frontend',
  'refrigeration-bench',
];

const moduleFiles = {
  'motor-basics': 'src/modules/motor-basics/MotorBasicsModule.tsx',
  'three-phase': 'src/modules/three-phase/ThreePhaseModule.tsx',
  'clarke-transform': 'src/modules/clarke-transform/ClarkeTransformModule.tsx',
  'park-transform': 'src/modules/park-transform/ParkTransformModule.tsx',
  'pid-control': 'src/modules/pid-control/PIDControlModule.tsx',
  'foc-flow': 'src/modules/foc-flow/FOCFlowModule.tsx',
  svpwm: 'src/modules/svpwm/SVPWMModule.tsx',
  inverter: 'src/modules/inverter/InverterModule.tsx',
  'control-loops': 'src/modules/control-loops/ControlLoopsModule.tsx',
  'sensorless-foc': 'src/modules/sensorless-foc/SensorlessFOCModule.tsx',
  'field-weakening': 'src/modules/field-weakening/FieldWeakeningModule.tsx',
  'faults-debugging': 'src/modules/faults-debugging/FaultsDebuggingModule.tsx',
  'hfi-sensorless': 'src/modules/hfi-sensorless/HFISensorlessModule.tsx',
  'startup-statemachine': 'src/modules/startup-statemachine/StartupStateMachineModule.tsx',
  'apf-frontend': 'src/modules/apf-frontend/APFFrontendModule.tsx',
  'refrigeration-bench': 'src/modules/refrigeration-bench/RefrigerationBenchModule.tsx',
};

const renderer = requireFile('src/modules/ModuleRenderer.tsx');
for (const id of moduleIds) {
  if (!renderer.includes(`moduleId === '${id}'`) && !renderer.includes(`moduleId === "${id}"`)) {
    failures.push(`ModuleRenderer does not route module: ${id}`);
  }
  requireFile(moduleFiles[id]);
}

const lessons = requireFile('src/content/lessons.ts');
for (const id of moduleIds) {
  if (!lessons.includes(`'${id}':`)) failures.push(`Missing lesson content: ${id}`);
}
for (const section of ['learningGoals', 'concepts', 'formulas', 'engineeringMeaning', 'stm32Guide', 'commonMistakes', 'debugMethods', 'experiments', 'summary', 'nextSteps', 'codeExample']) {
  if (!lessons.includes(section)) failures.push(`Lesson schema missing section: ${section}`);
}

const store = requireFile('src/store/simulationStore.ts');
for (const key of ['motorBasics', 'threePhase', 'clarke', 'park', 'pid', 'svpwm', 'inverter', 'controlLoop', 'sensorless', 'weakField', 'fault']) {
  if (!store.includes(key)) failures.push(`Simulation store missing key: ${key}`);
}

const parameterSchemas = requireFile('src/content/parameterSchemas.ts');
for (const id of moduleIds) {
  const hasSchema =
    parameterSchemas.includes(`'${id}': {`) ||
    parameterSchemas.includes(`${id}: {`);
  if (!hasSchema && !['foc-flow'].includes(id)) {
    warnings.push(`parameterSchemas missing schema for module: ${id}`);
  }
}

const transforms = requireFile('src/simulation/math/transforms.ts');
requireIncludes('transforms.ts', transforms, ['clarkeTransform', 'parkTransform', 'inverseParkTransform', 'generateThreePhaseCurrent']);
const pid = requireFile('src/simulation/math/pid.ts');
requireIncludes('pid.ts', pid, ['pidStep', 'piStep', 'simulatePidStepResponse', 'calculateStepMetrics']);
const svpwm = requireFile('src/simulation/math/svpwm.ts');
requireIncludes('svpwm.ts', svpwm, ['determineSvpwmSector', 'calculateSvpwm', 'dutyA', 'dutyB', 'dutyC']);
const motorModel = requireFile('src/simulation/math/motorModel.ts');
requireIncludes('motorModel.ts', motorModel, ['stepPmsmModel', 'simulateCurrentLoop', 'simulateSpeedLoop']);
const observer = requireFile('src/simulation/math/observer.ts');
requireIncludes('observer.ts', observer, ['estimateBackEmf', 'pllTrack']);
const weakField = requireFile('src/simulation/math/weakField.ts');
requireIncludes('weakField.ts', weakField, ['checkVoltageLimit', 'estimateTorque', 'suggestWeakeningId']);

const packageJson = JSON.parse(requireFile('package.json'));
for (const script of ['dev', 'build', 'verify', 'preview', 'e2e', 'e2e:optional', 'qa:screenshots', 'release:audit', 'desktop:pack', 'desktop:dist', 'ci:local']) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json missing script: ${script}`);
}
for (const dep of ['react', 'typescript', 'vite', 'tailwindcss', 'zustand', 'recharts', 'three', '@react-three/fiber', '@react-three/drei', 'framer-motion', 'electron', 'electron-builder', 'electron-updater']) {
  if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) failures.push(`package.json missing dependency: ${dep}`);
}
if (packageJson.main !== 'electron/main.cjs') failures.push('package.json main must point to electron/main.cjs');
if (packageJson.build?.productName !== '电机控制学习客户端') failures.push('package.json missing Electron productName');

const viteConfig = requireFile('vite.config.ts');
if (!viteConfig.includes("base: './'")) failures.push("vite.config.ts must use base './' for file:// Electron loading");

const electronMain = requireFile('electron/main.cjs');
requireIncludes('electron/main.cjs', electronMain, ['BrowserWindow', 'contextIsolation: true', 'nodeIntegration: false', 'loadFile', 'initAutoUpdater']);
const preload = requireFile('electron/preload.cjs');
requireIncludes('electron/preload.cjs', preload, ['contextBridge', 'motorControlDesktop', 'desktop:update-event', 'subscribeUpdateEvents']);
const electronUpdate = requireFile('electron/update.cjs');
requireIncludes('electron/update.cjs', electronUpdate, ['buildUpdateEvent', 'initAutoUpdater', 'desktop:update-event']);

const visualAssets = requireFile('src/content/visualAssets.ts');
for (const id of ['motor-basics', 'foc-flow', 'svpwm', 'inverter', 'sensorless-foc', 'field-weakening', 'faults-debugging']) {
  if (!visualAssets.includes(`moduleId: '${id}'`)) failures.push(`Missing visual asset prompt: ${id}`);
}
for (const optimized of ['motor-exploded-cover.webp', 'foc-flow-console.webp', 'svpwm-sector-map.webp', 'inverter-power-stage.webp', 'sensorless-observer-console.webp', 'field-weakening-limit-map.webp', 'fault-debug-board.webp']) {
  if (!visualAssets.includes(optimized)) failures.push(`Missing optimized visual asset reference: ${optimized}`);
}
const assetPipeline = requireFile('docs/ASSET_PIPELINE.md');
requireIncludes('ASSET_PIPELINE.md', assetPipeline, ['gpt-image-2', 'OPENAI_API_KEY', 'codex.ciii.club', 'scripts/generate-image-assets.ps1', 'scripts/generate-image-assets-raw.mjs', 'scripts\\optimize-image-assets.py']);
const moduleExtension = requireFile('docs/MODULE_EXTENSION.md');
requireIncludes('MODULE_EXTENSION.md', moduleExtension, ['ModuleRenderer', 'src/content/lessons.ts', 'src/store/simulationStore.ts', 'npm run verify', 'npm run build']);

const readme = requireFile('README.md');
requireIncludes('README.md', readme, ['npm install', 'npm run dev', 'npm run build', 'npm run verify', 'src/', 'STM32', 'docs/MODULE_EXTENSION.md']);
const e2e = requireFile('tests/e2e/smoke.spec.ts');
for (const id of ['电机基础', 'SVPWM', '故障与调试', '参数控制台']) {
  if (!e2e.includes(id)) failures.push(`E2E smoke missing assertion for: ${id}`);
}

if (failures.length) {
  console.error('Verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length) {
    console.error('Warnings:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log(`Verification passed: ${requiredFiles.length} required files, ${moduleIds.length} routed modules, ${Object.keys(moduleFiles).length} dedicated module pages.`);
if (warnings.length) {
  console.log('Warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
console.log(`Evidence checked: ${evidence.length} file reads plus algorithms, lessons, store, README, and asset pipeline coverage.`);
