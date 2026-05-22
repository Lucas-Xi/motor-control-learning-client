import { describe, expect, it } from 'vitest';
import {
  createComplianceState,
  maxSpeedLoopBandwidth,
  resonanceFrequencies,
  sampleComplianceParams,
  stepCompliance,
} from './mechanicalCompliance';

describe('stepCompliance - 静止初始', () => {
  it('零输入 → 状态保持静止', () => {
    let st = createComplianceState();
    for (let k = 0; k < 100; k += 1) {
      st = stepCompliance({
        Tem: 0,
        TloadExt: 0,
        dt: 1e-4,
        params: sampleComplianceParams.directDriveCompressor,
        state: st,
      });
    }
    expect(Math.abs(st.omegaMotor)).toBeLessThan(1e-6);
    expect(Math.abs(st.omegaLoad)).toBeLessThan(1e-6);
  });
});

describe('stepCompliance - 稳态平衡', () => {
  it('恒定 T_em = T_load 时 ω_motor 与 ω_load 同步', () => {
    const params = sampleComplianceParams.directDriveCompressor;
    let st = createComplianceState();
    for (let k = 0; k < 30000; k += 1) {
      st = stepCompliance({ Tem: 0.5, TloadExt: 0.5, dt: 1e-4, params, state: st });
    }
    // 稳态时电机与负载角速度应基本同步
    expect(Math.abs(st.omegaMotor - st.omegaLoad)).toBeLessThan(0.01);
  });
});

describe('resonanceFrequencies - 直驱', () => {
  it('家用压缩机直驱共振 > 1 kHz（不影响 FOC 带宽）', () => {
    const r = resonanceFrequencies(sampleComplianceParams.directDriveCompressor);
    expect(r.resonanceHz).toBeGreaterThan(1000);
  });
});

describe('resonanceFrequencies - 皮带传动', () => {
  it('工业风机皮带共振 200-400 Hz', () => {
    const r = resonanceFrequencies(sampleComplianceParams.industrialFanBelt);
    expect(r.resonanceHz).toBeGreaterThan(100);
    expect(r.resonanceHz).toBeLessThan(500);
  });
});

describe('resonanceFrequencies - 公式自洽', () => {
  it('ω_res > ω_antires 始终成立', () => {
    for (const key of Object.keys(sampleComplianceParams) as Array<keyof typeof sampleComplianceParams>) {
      const r = resonanceFrequencies(sampleComplianceParams[key]);
      expect(r.resonanceHz).toBeGreaterThanOrEqual(r.antiResonanceHz);
    }
  });
});

describe('maxSpeedLoopBandwidth', () => {
  it('速度环带宽上限 = 反共振 / 5', () => {
    const params = sampleComplianceParams.industrialFanBelt;
    const fAR = resonanceFrequencies(params).antiResonanceHz;
    expect(maxSpeedLoopBandwidth(params)).toBeCloseTo(fAR / 5, 6);
  });
});

describe('stepCompliance - backlash 死区', () => {
  it('小角度差时 backlash 区无弹性扭矩传递', () => {
    const params = sampleComplianceParams.roboticJoint; // backlashRad=0.012
    // 制造一个小的角度差（< backlash/2 = 0.006）
    let st = { ...createComplianceState(), thetaMotor: 0.003 };
    const r = stepCompliance({ Tem: 0, TloadExt: 0, dt: 1e-4, params, state: st });
    // Tspring 仅来自阻尼（ω 都为 0，所以阻尼项也为 0），弹性项被吃掉
    expect(Math.abs(r.Tspring)).toBeLessThan(1e-6);
  });

  it('大角度差 → 弹性扭矩生效', () => {
    const params = sampleComplianceParams.roboticJoint;
    let st = { ...createComplianceState(), thetaMotor: 0.05 }; // 远大于 backlash/2
    const r = stepCompliance({ Tem: 0, TloadExt: 0, dt: 1e-4, params, state: st });
    // 弹性扭矩 = Ks × (dTheta - backlash/2) = 1500 × (0.05 - 0.006) = 66
    expect(r.Tspring).toBeCloseTo(1500 * (0.05 - 0.006), 0);
  });
});

describe('stepCompliance - 共振激发', () => {
  it('阶跃 T_em → 相对运动 (ω_m - ω_l) 振荡', () => {
    // 共振体现在电机与负载的相对运动；ω_motor / ω_load 各自含线性漂移，差值才是 AC 模式。
    const params = { ...sampleComplianceParams.industrialFanBelt, Ds: 0.3 };
    let st = createComplianceState();
    const history: number[] = [];
    const dt = 1e-5;
    for (let k = 0; k < 3000; k += 1) {
      st = stepCompliance({ Tem: 0.5, TloadExt: 0, dt, params, state: st });
      if (k % 3 === 0) history.push(st.omegaMotor - st.omegaLoad);
    }
    let directionChanges = 0;
    for (let i = 2; i < history.length; i += 1) {
      const a = history[i] - history[i - 1];
      const b = history[i - 1] - history[i - 2];
      if (a * b < 0) directionChanges += 1;
    }
    expect(directionChanges).toBeGreaterThan(3);
  });
});

describe('stepCompliance - 加速合理', () => {
  it('施加 T_em > T_load 时电机与负载平均速度上升', () => {
    const params = sampleComplianceParams.directDriveCompressor;
    let st = createComplianceState();
    for (let k = 0; k < 5000; k += 1) {
      st = stepCompliance({ Tem: 1.0, TloadExt: 0.2, dt: 1e-4, params, state: st });
    }
    expect(st.omegaMotor).toBeGreaterThan(0);
    expect(st.omegaLoad).toBeGreaterThan(0);
  });
});
