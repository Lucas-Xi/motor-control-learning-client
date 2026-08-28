# Motor Control Learning Client (电机控制学习客户端)

[![PR CI](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/pr.yml/badge.svg)](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/pr.yml)
[![Release Audit](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/release-audit.yml/badge.svg)](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/release-audit.yml)
[![Nightly Desktop](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/nightly-desktop.yml/badge.svg)](https://github.com/Lucas-Xi/motor-control-learning-client/actions/workflows/nightly-desktop.yml)

English | **[简体中文](README.md)**

An **interactive motor-control learning client** for junior and mid-level embedded engineers: learn BLDC / PMSM / FOC / SVPWM by turning sliders and watching waveforms — in the browser or as a Windows desktop app. The fundamentals track covers reference-frame transforms, PID, SVPWM, inverters, and observers; the advanced track is built around real variable-speed compressor duty: V/f and I/F startup, HFI (high-frequency-injection) low-speed sensorless control, MTPA, field weakening, resonance suppression, cogging compensation, liquid-slugging protection, APF front-end PFC, and systematic fault debugging.

Every algorithm is a pure function under `src/simulation/math/` — explicit state in/out, electrical angle in radians everywhere, normalization before any trig call — so it can be ported line-by-line to STM32 / MATLAB. Each core function carries comments on formula provenance, units, and engineering meaning.

> **Note on language**: the in-app teaching content, UI copy, lesson notes, and quizzes are in Chinese (the primary audience is Chinese-speaking embedded engineers). Source code identifiers, this README, and code comments mixing English/Chinese are designed to stay approachable for international readers.

![Motor Basics module](output/screenshots/desktop-01-motor-basics.png)

## Feature Overview: 16 Learning Modules

| # | Module | Contents |
|---|--------|----------|
| 01 | Motor Basics | Construction, pole pairs, electrical/mechanical angles, winding connections (wye/delta), temperature demagnetization and thermal derating |
| 02 | Three-Phase Sine & Rotating Field | Amplitude/frequency/phase/imbalance/harmonics drive three-phase waveforms, αβ vectors, and a 3D magnetic field in real time |
| 03 | Clarke Transform | abc → αβ projection, zero-sequence component, spectrum analysis |
| 04 | Park Transform | αβ → dq synchronous frame: AC quantities become DC |
| 05 | PID Control | Step response / Bode plots, anti-windup comparison, **current-loop PI auto-tuning (magnitude optimum)** |
| 06 | FOC Pipeline | Cycle-by-cycle PWM interrupt breakdown: sample → Clarke → Park → PI → inverse Park → SVPWM, with clickable probe locks |
| 07 | SVPWM | Hexagon vector diagram, sector detection, T1/T2/T0, overmodulation; drag the voltage vector directly |
| 08 | Three-Phase Inverter | Bridge switching, dead-time distortion and compensation, PWM transients |
| 09 | Current / Speed / Position Loops | Three-loop tuning, servo positioning with motion profiles, two-mass resonance Bode, anti-resonance notch, cogging feedforward and adaptive compensation |
| 10 | Sensorless FOC / Observers | Back-EMF + SMO + PLL, noise robustness, observer handover timing |
| 11 | Field Weakening | Voltage/current limit circles, MTPA, draggable Id-Iq operating point |
| 12 | Faults & Debugging | 8 fault injections: waveform symptom → root cause → triage steps → STM32 mapping |
| 13 | HFI High-Frequency Injection | Saliency demodulation, zero-speed sensorless start, noisy scenarios |
| 14 | Compressor Startup State Machine | Full V/f → HFI → BEMF → field-weakening sequence, I/F open-loop current drag, Stribeck friction valley |
| 15 | APF Front-End PFC | Single-phase rectification → Boost PFC, switching-level simulation, harmonic mitigation and power-factor correction |
| 16 | Refrigeration Bench | Vapor-compression cycle, two-stage compression, energy-flow Sankey, coupled with FOC in a system-level simulation |

Each module ships with Chinese lesson notes (collapsible `ConceptNotes`), one-click experiment presets, quiz challenges, and desktop + mobile responsive layouts.

![Control loops module](output/screenshots/desktop-09-control-loops.png)

## Getting Started

```bash
git clone https://github.com/Lucas-Xi/motor-control-learning-client.git
cd motor-control-learning-client
npm install
npm run dev          # http://127.0.0.1:5173
```

### Common Commands

```bash
npm run dev              # Vite dev server
npm run build            # production build (vite build)
npm run typecheck        # standalone tsc -b --noEmit type check
npm run test             # full vitest suite (83 files / 867 tests)
npm run coverage         # v8 coverage report
npm run verify           # static guard: 224 required files + key imports
npm run e2e              # Playwright smoke tests (auto-starts dev server)
npm run qa:screenshots   # desktop + mobile screenshots of all 16 modules → output/screenshots/
npm run release:audit    # release audit: verify → build → e2e → screenshots
npm run desktop:pack     # build + Electron portable (unpacked) packaging
npm run docsite          # generate offline doc site into docs/site/ (GitHub Pages ready)
```

### Windows Desktop Client

```bash
npm run desktop:pack     # builds first, then produces a portable run directory
release/win-unpacked/电机控制学习客户端.exe
```

See [docs/ELECTRON_AUTOUPDATE.md](docs/ELECTRON_AUTOUPDATE.md) for packaging details (including auto-update).

## Architecture: Six-Layer Separation

New modules must follow the "content / parameters / algorithm / page / routing / experiment" six-layer recipe — see [docs/MODULE_EXTENSION.md](docs/MODULE_EXTENSION.md) for the full walkthrough:

```
1. Types       src/simulation/engine/types.ts     ModuleId union + parameter interfaces
2. Presets     src/simulation/engine/presets.ts   module metadata + defaults + experiment presets
3. State       src/store/simulationStore.ts       Zustand: state + patch + reset branches
4. Algorithms  src/simulation/math/               pure functions only — no control math in UI
5. Content     src/content/lessons.ts             lesson notes / formulas / glossary (Chinese)
6. Pages       src/modules/<module-id>/           dedicated interactive page + explicit route
```

Shell layout: `AppShell` = Sidebar (navigation) + TopBar (run controls) + SimulationPanel (central teaching area) + ParameterPanel (right-hand parameters) + WaveformPanel (bottom waveform scope). There is a single global store, `useSimulationStore`; components must subscribe with slice selectors to avoid per-frame re-renders.

## Algorithm Inventory (src/simulation/math/)

| File | Contents |
|------|----------|
| `transforms.ts` | Clarke / Park / inverse Park / three-phase current generation |
| `pid.ts` | PI / PID stepping, anti-windup, step-response simulation |
| `pidFrequency.ts` | PI frequency response (Bode magnitude & phase) |
| `svpwm.ts` | sector, T1/T2/T0, duty cycles, overmodulation, bus utilization comparison |
| `motorModel.ts` | PMSM dq model, current loop, speed loop |
| `inverterModel.ts` | averaged inverter model, dead-time effects |
| `deadtime.ts` | dead-time distortion modeling and compensation |
| `observer.ts` | back-EMF estimation + SMO + PLL |
| `weakField.ts` | field-weakening voltage circle, MTPA, torque estimation |
| `mtpa.ts` | analytic maximum-torque-per-ampere |
| `focLoop.ts` | closed-loop FOC chain simulation |
| `currentLoopTuning.ts` | current-loop PI auto-tuning (magnitude optimum) + one-step-delay discrete verification |
| `motionProfile.ts` | trapezoidal / S-curve motion planning |
| `mechanicalCompliance.ts` | two-mass elastic drive model |
| `twoMassResonance.ts` | two-mass resonance Bode analysis |
| `resonanceSuppression.ts` | biquad notch anti-resonance suppression |
| `autoNotch.ts` | frequency-sweep identification + adaptive notch alignment |
| `cogging.ts` / `coggingCompensation.ts` / `coggingAdaptive.ts` | cogging torque modeling / feedforward compensation / adaptive harmonic identification |
| `ifStartup.ts` | I/F open-loop current-drag startup + handover criteria |
| `startup.ts` | compressor startup state-machine timing |
| `hfi.ts` | high-frequency injection demodulation |
| `smo.ts` | sliding-mode observer |
| `thermalSim.ts` | first-order thermal network (copper loss → temperature rise → parameter drift) |
| `apf.ts` / `switchingPfc.ts` | APF harmonic detection / switching-level Boost PFC |
| `vaporCycle.ts` | vapor-compression refrigeration cycle |

## Testing & CI

- **Unit tests**: vitest, 83 files / 867 tests, covering convergence, monotonicity, unit consistency, and fixed-point (q15) portability preconditions for every algorithm module.
- **Static guard**: `scripts/verify-project.mjs` checks 224 required files and key imports so modules can't silently regress to a generic fallback.
- **E2E**: Playwright smoke suite plus a full accessibility (a11y) scan.
- **GitHub Actions** (`.github/workflows/`):
  - `pr.yml` — on PRs: verify + fault-waves + typecheck + vitest + build
  - `release-audit.yml` — on push to main: everything in PR CI + e2e
  - `nightly-desktop.yml` — daily at 18:00 UTC, packages the Windows client
  - `a11y.yml` — accessibility regression

To replay CI locally: `npm run ci:local`.

## Documentation

| Document | Contents |
|----------|----------|
| [README.md](README.md) | 简体中文文档（full Chinese documentation) |
| [docs/MODULE_EXTENSION.md](docs/MODULE_EXTENSION.md) | six-layer recipe for adding a module (Chinese) |
| [docs/ELECTRON_AUTOUPDATE.md](docs/ELECTRON_AUTOUPDATE.md) | Electron packaging & auto-update (Chinese) |
| [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | AI visual asset pipeline (Chinese) |
| [docs/PRIVACY.md](docs/PRIVACY.md) | privacy statement: local-only, no telemetry (Chinese) |
| [docs/SECTION_508_COMPLIANCE.md](docs/SECTION_508_COMPLIANCE.md) / [A11Y_AUDIT_R2.md](docs/A11Y_AUDIT_R2.md) | accessibility audits (Chinese) |
| [docs/PERFORMANCE_AUDIT_R2.md](docs/PERFORMANCE_AUDIT_R2.md) | performance audit (Chinese) |
| [docs/site/](docs/site/index.html) | offline doc site (regenerate with `npm run docsite`) |

Deep-dive docs are written in Chinese to match the in-app teaching language; they are code-heavy and followable without fluent Chinese.

## STM32 / C Porting

Suggested order: `transforms.ts` → `pid.ts` → `svpwm.ts`. Keep the ADC interrupt to the fast loop only (sample → Clarke → Park → PI → inverse Park → SVPWM → update CCR); run the speed loop, position loop, communication, and logging in lower-priority tasks. Key observables: `Ia/Ib/Ic`, `Iα/Iβ`, `Id/Iq`, `Vd/Vq`, `sector`, `dutyA/B/C`, `theta`, `speed`, `fault flags`. Use electrical angle in radians everywhere and normalize before trig; for fixed-point ports, the finiteness preconditions asserted in each algorithm's tests double as q15 safety checks.

## License

- [Apache License 2.0](LICENSE) — free for self-study, teaching, academic research, blog/talk attribution, and in-house learning use.
- Commercial redistribution (repackaged sales, OEM embedding, closed-source integration) requires a commercial license — see [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

## Contributing

Issues and PRs are welcome. Before adding a module, read [docs/MODULE_EXTENSION.md](docs/MODULE_EXTENSION.md); please attach before/after UI screenshots (ideally produced by `npm run qa:screenshots`) and make `npm run ci:local` pass.
