import type { Locale } from '../i18n/types';
import type { ModuleId } from '../simulation/engine/types';

export interface VisualAssetSpec {
  id: string;
  moduleId: ModuleId;
  title: string;
  /** 图注 / alt 英文（en-US 下优先展示；缺失回退 title） */
  titleEn?: string;
  filename: string;
  optimizedFilename?: string;
  status: 'fallback' | 'generated' | 'planned';
  prompt: string;
}

/** 按 locale 取素材图注（同时充当 img alt）：en-US 优先 titleEn，缺失回退中文。 */
export function pickAssetTitle(asset: VisualAssetSpec, locale: Locale): string {
  return locale === 'en-US' && asset.titleEn !== undefined ? asset.titleEn : asset.title;
}

const sharedStyle = 'dark engineering simulation software aesthetic, premium technical education product, cinematic 3D render blended with precise scientific diagram, cyan and mint instrument lighting, matte black graphite materials, no English UI text, no logos, no watermark';

export const visualAssets: VisualAssetSpec[] = [
  {
    id: 'motor-exploded-cover',
    moduleId: 'motor-basics',
    title: 'PMSM 电机结构爆炸图',
    titleEn: 'PMSM Motor Exploded View',
    filename: 'assets/generated/motor-exploded-cover.png',
    optimizedFilename: 'assets/generated/motor-exploded-cover.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: module cover image for a motor control learning client\nPrimary request: Create a high-end educational 3D exploded-view illustration of a PMSM / BLDC motor showing stator teeth, copper windings, rotor permanent magnets, shaft, encoder disk, and Hall sensors.\nScene/backdrop: dark engineering lab dashboard background with faint grid and glow rings.\nSubject: motor parts separated along the shaft axis, clean labels as small abstract callout lines without readable text.\nStyle/medium: ${sharedStyle}.\nComposition/framing: wide landscape, central motor, enough negative space for overlay UI cards.\nLighting/mood: cyan rim lights, warm copper highlights, crisp professional simulation mood.\nConstraints: no text, no brand marks, physically plausible motor structure, avoid cartoon style.`,
  },
  {
    id: 'foc-flow-console',
    moduleId: 'foc-flow',
    title: 'FOC 控制流水线总览',
    titleEn: 'FOC Control Pipeline Overview',
    filename: 'assets/generated/foc-flow-console.png',
    optimizedFilename: 'assets/generated/foc-flow-console.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: hero image for FOC process module\nPrimary request: Visualize the complete field oriented control data pipeline as a futuristic control console: current sampling, Clarke transform, Park transform, Id/Iq PI controllers, inverse Park, SVPWM, inverter, motor response, angle feedback.\nScene/backdrop: dark command center with transparent glass panels and glowing signal paths.\nSubject: modular blocks connected by animated-looking light trails, motor silhouette at the output, feedback loop returning angle to Park block.\nStyle/medium: ${sharedStyle}.\nComposition/framing: landscape 16:9, left-to-right flow, no readable text, use icons and abstract blocks instead of words.\nLighting/mood: precise, high-tech, educational, not cluttered.\nConstraints: no English text, no logos, keep the control-flow direction readable.`,
  },
  {
    id: 'svpwm-sector-map',
    moduleId: 'svpwm',
    title: 'SVPWM 六扇区空间矢量图',
    titleEn: 'SVPWM Six-Sector Space Vector Diagram',
    filename: 'assets/generated/svpwm-sector-map.png',
    optimizedFilename: 'assets/generated/svpwm-sector-map.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: module cover and background illustration\nPrimary request: Create an accurate six-sector SVPWM space vector diagram as a premium 3D technical visualization: hexagon boundary, six active vectors, two zero-vector center states, one highlighted voltage vector, and subtle PWM timing bars.\nScene/backdrop: dark oscilloscope-like grid and vector-plane glow.\nSubject: six-sector hexagon, highlighted sector wedge, cyan target vector arrow, small abstract timing blocks.\nStyle/medium: ${sharedStyle}.\nComposition/framing: square-to-landscape adaptable, centered vector diagram, no readable text.\nLighting/mood: crisp neon instrument panel.\nConstraints: no text, no brand marks, geometric accuracy, avoid decorative random shapes.`,
  },
  {
    id: 'inverter-power-stage',
    moduleId: 'inverter',
    title: '三相逆变器功率级',
    titleEn: 'Three-Phase Inverter Power Stage',
    filename: 'assets/generated/inverter-power-stage.png',
    optimizedFilename: 'assets/generated/inverter-power-stage.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: cover image for inverter module\nPrimary request: Render a three-phase inverter power stage with six MOSFET/IGBT switches, DC bus capacitors, gate-drive traces, phase outputs A/B/C, and PWM glow pulses.\nScene/backdrop: dark PCB and power electronics lab visualization.\nSubject: three bridge legs, complementary high-side and low-side switch pairs, bus rails, abstract load motor at the output.\nStyle/medium: ${sharedStyle}.\nComposition/framing: wide landscape, circuit readable from left DC bus to right motor output.\nLighting/mood: cyan and amber electrical pulses, serious engineering tone.\nConstraints: no text, no logos, avoid unsafe sparks or fantasy lightning.`,
  },
  {
    id: 'sensorless-observer-console',
    moduleId: 'sensorless-foc',
    title: '无感观测器与 PLL 锁相',
    titleEn: 'Sensorless Observer and PLL Lock',
    filename: 'assets/generated/sensorless-observer-console.png',
    optimizedFilename: 'assets/generated/sensorless-observer-console.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: module cover for sensorless FOC observer\nPrimary request: Visualize sensorless motor angle estimation: noisy back-EMF waveforms, sliding-mode observer block, PLL lock ring, estimated rotor angle chasing true rotor flux.\nScene/backdrop: dark diagnostic dashboard with oscilloscope traces.\nSubject: motor rotor flux arrow, ghosted estimated angle arrow, PLL circular lock indicator, waveform panels.\nStyle/medium: ${sharedStyle}.\nComposition/framing: landscape, rotor on right, observer signal chain on left, no readable text.\nLighting/mood: precise diagnostic, slightly tense low-speed uncertainty.\nConstraints: no text, no logos, make the true vs estimated angle concept visually clear.`,
  },
  {
    id: 'field-weakening-limit-map',
    moduleId: 'field-weakening',
    title: '弱磁电压/电流极限圆',
    titleEn: 'Field Weakening Voltage/Current Limit Circles',
    filename: 'assets/generated/field-weakening-limit-map.png',
    optimizedFilename: 'assets/generated/field-weakening-limit-map.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: module cover for field weakening control\nPrimary request: Create a premium technical visualization of the Id/Iq plane with current limit circle, voltage limit ellipse/circle, negative Id field-weakening trajectory, constant torque region and constant power region represented by color zones without text.\nScene/backdrop: dark vector-control map over a subtle grid.\nSubject: Id/Iq coordinate plane, highlighted operating point moving into negative Id, shrinking voltage limit at high speed.\nStyle/medium: ${sharedStyle}.\nComposition/framing: landscape with the map as the hero object.\nLighting/mood: analytical, high-speed control, cyan/mint/amber alerts.\nConstraints: no text, no logos, keep the chart scientifically plausible.`,
  },
  {
    id: 'fault-debug-board',
    moduleId: 'faults-debugging',
    title: '故障诊断波形看板',
    titleEn: 'Fault Diagnosis Waveform Dashboard',
    filename: 'assets/generated/fault-debug-board.png',
    optimizedFilename: 'assets/generated/fault-debug-board.webp',
    status: 'generated',
    prompt: `Use case: scientific-educational\nAsset type: troubleshooting module cover\nPrimary request: Render an engineering fault diagnosis dashboard for motor control: overcurrent spikes, phase-loss waveform, encoder angle mismatch, SVPWM sector jump anomaly, and a protected inverter board.\nScene/backdrop: dark diagnostic bench, oscilloscope traces, warning accents.\nSubject: multiple waveform panels and a compact inverter/motor silhouette, red fault markers as abstract icons without text.\nStyle/medium: ${sharedStyle}.\nComposition/framing: wide landscape, dense but readable dashboard.\nLighting/mood: urgent but professional, not alarmist.\nConstraints: no readable text, no logos, no unrealistic explosions.`,
  },
];

export function getVisualAssetForModule(moduleId: ModuleId): VisualAssetSpec | undefined {
  return visualAssets.find((asset) => asset.moduleId === moduleId);
}
