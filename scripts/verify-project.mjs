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
  'playwright.config.ts',
  'electron/main.cjs',
  'electron/preload.cjs',
  'tests/e2e/smoke.spec.ts',
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
for (const script of ['dev', 'build', 'verify', 'preview', 'e2e', 'e2e:optional', 'qa:screenshots', 'release:audit', 'desktop:pack', 'desktop:dist']) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json missing script: ${script}`);
}
for (const dep of ['react', 'typescript', 'vite', 'tailwindcss', 'zustand', 'recharts', 'three', '@react-three/fiber', '@react-three/drei', 'framer-motion', 'electron', 'electron-builder']) {
  if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) failures.push(`package.json missing dependency: ${dep}`);
}
if (packageJson.main !== 'electron/main.cjs') failures.push('package.json main must point to electron/main.cjs');
if (packageJson.build?.productName !== '电机控制学习客户端') failures.push('package.json missing Electron productName');

const viteConfig = requireFile('vite.config.ts');
if (!viteConfig.includes("base: './'")) failures.push("vite.config.ts must use base './' for file:// Electron loading");

const electronMain = requireFile('electron/main.cjs');
requireIncludes('electron/main.cjs', electronMain, ['BrowserWindow', 'contextIsolation: true', 'nodeIntegration: false', 'loadFile']);
const preload = requireFile('electron/preload.cjs');
requireIncludes('electron/preload.cjs', preload, ['contextBridge', 'motorControlDesktop']);

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
