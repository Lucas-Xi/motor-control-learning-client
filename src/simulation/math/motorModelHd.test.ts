import { describe, expect, it } from 'vitest';
import { defaultPmsmParameters, createPmsmState, stepPmsmModel } from './motorModel';
import { stepPmsmModelHd, instantaneousBemfHd, type MotorModelHdConfig } from './motorModelHd';

const config: MotorModelHdConfig = {
  base: defaultPmsmParameters,
};

describe('stepPmsmModelHd - 基础语义', () => {
  it('零电压零负载 → 状态保持', () => {
    const r = stepPmsmModelHd({
      vd: 0, vq: 0, loadTorque: 0, dt: 1e-4, windingTempC: 25,
      config, state: createPmsmState(),
    });
    expect(Math.abs(r.state.iq)).toBeLessThan(1e-3);
    expect(Math.abs(r.state.id)).toBeLessThan(1e-3);
  });
});

describe('stepPmsmModelHd - 与简版偏差', () => {
  it('饱和 + 齿槽 + BEMF 谐波让转矩偏离简版 (> 0)', () => {
    let st = createPmsmState();
    // 注入电流让 iq 增到 8A
    for (let k = 0; k < 200; k += 1) {
      const r = stepPmsmModelHd({
        vd: 0, vq: 6, loadTorque: 0.1, dt: 1e-4, windingTempC: 25,
        config, state: st,
      });
      st = r.state;
    }
    // 跑一步看诊断
    const r = stepPmsmModelHd({
      vd: 0, vq: 6, loadTorque: 0.1, dt: 1e-4, windingTempC: 25,
      config, state: st,
    });
    // 在重载下应该有非零偏差
    expect(Math.abs(r.diagnostics.torqueDeviationFromSimplePct)).toBeGreaterThan(0);
  });
});

describe('stepPmsmModelHd - 铁损不为 0', () => {
  it('转动后铁损 > 0', () => {
    let st = createPmsmState();
    st.omegaMechanical = (3000 / 60) * 2 * Math.PI;
    const r = stepPmsmModelHd({
      vd: 0, vq: 5, loadTorque: 0.1, dt: 1e-4, windingTempC: 25,
      config, state: st,
    });
    expect(r.diagnostics.ironLossW).toBeGreaterThan(0);
  });
});

describe('stepPmsmModelHd - 温度补偿', () => {
  it('热机 100°C 时 Rs 明显升高', () => {
    const cold = stepPmsmModelHd({
      vd: 0, vq: 3, loadTorque: 0.1, dt: 1e-4, windingTempC: 25,
      config, state: { ...createPmsmState(), iq: 4 },
    });
    const hot = stepPmsmModelHd({
      vd: 0, vq: 3, loadTorque: 0.1, dt: 1e-4, windingTempC: 100,
      config, state: { ...createPmsmState(), iq: 4 },
    });
    expect(hot.diagnostics.rsCompensated).toBeGreaterThan(cold.diagnostics.rsCompensated);
    expect(hot.diagnostics.copperLossW).toBeGreaterThan(cold.diagnostics.copperLossW);
  });

  it('120°C 退磁告警触发', () => {
    const r = stepPmsmModelHd({
      vd: 0, vq: 3, loadTorque: 0.1, dt: 1e-4, windingTempC: 120,
      config, state: { ...createPmsmState(), iq: 4 },
    });
    expect(r.diagnostics.demagAlarm).toBe(true);
    expect(r.diagnostics.fluxCompensated).toBeLessThan(defaultPmsmParameters.flux);
  });
});

describe('stepPmsmModelHd - enable 开关', () => {
  it('全部物理效应关闭 → 接近简版', () => {
    const st = { ...createPmsmState(), iq: 4, omegaMechanical: 30 };
    const offAll: MotorModelHdConfig = {
      base: defaultPmsmParameters,
      enable: {
        saturation: false,
        ironLoss: false,
        cogging: false,
        bemfHarmonics: false,
        friction: false,
        thermalComp: false,
      },
    };
    const hd = stepPmsmModelHd({ vd: 0, vq: 3, loadTorque: 0.1, dt: 1e-4, windingTempC: 25, config: offAll, state: st });
    const simple = stepPmsmModel({ vd: 0, vq: 3, loadTorque: 0.1, dt: 1e-4, params: defaultPmsmParameters, state: st });
    // 由于 hd 的摩擦 fallback 用 base.damping × ω，结果应该非常接近简版
    expect(Math.abs(hd.state.iq - simple.iq)).toBeLessThan(0.01);
    expect(hd.diagnostics.ironLossW).toBe(0);
    expect(hd.diagnostics.coggingTorqueNm).toBe(0);
  });
});

describe('instantaneousBemfHd', () => {
  it('omega=0 时返回 0', () => {
    expect(instantaneousBemfHd(0.5, 0.045, 0)).toBe(0);
  });

  it('基波周期相同（2π 周期回归）', () => {
    const a = instantaneousBemfHd(0.3, 0.045, 100);
    const b = instantaneousBemfHd(0.3 + 2 * Math.PI, 0.045, 100);
    expect(b).toBeCloseTo(a, 6);
  });
});
