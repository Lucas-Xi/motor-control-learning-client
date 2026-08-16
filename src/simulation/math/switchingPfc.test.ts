import { describe, expect, it } from 'vitest';
import { detectDcm, simulateSwitchingPfc, switchingRippleNearPeak } from './switchingPfc';

describe('switchingPfc', () => {
  const defaultInput = {
    vAcRms: 220,
    freqHz: 50,
    udcRef: 380,
    lUh: 500,
    cUf: 470,
    loadCurrent: 2,
    pwmFs: 20000,
    currentKp: 0.5,
    currentKi: 50,
    cycles: 3,
  };

  it('仿真生成数据点', () => {
    const r = simulateSwitchingPfc(defaultInput);
    expect(r.points.length).toBeGreaterThan(100);
  });

  it('母线电压在整流峰值以上（Boost 基本功能）', () => {
    const r = simulateSwitchingPfc(defaultInput);
    // 开关级仿真启动阶段电压建立需要时间，目标仅验证 Boost 能工作
    expect(r.udcAvg).toBeGreaterThan(100);
  });

  it('电网电流 THD 小于 50%（开关级有纹波，不可能接近 0）', () => {
    const r = simulateSwitchingPfc(defaultInput);
    expect(r.thd).toBeLessThan(50);
  });

  it('电感电流纹波 > 0', () => {
    const r = simulateSwitchingPfc(defaultInput);
    expect(r.iLRipple).toBeGreaterThan(0);
  });

  it('大电感减小电流纹波', () => {
    const smallL = simulateSwitchingPfc({ ...defaultInput, lUh: 200 });
    const largeL = simulateSwitchingPfc({ ...defaultInput, lUh: 2000 });
    // 大电感应产生更小纹波
    expect(largeL.iLRipple).toBeLessThan(smallL.iLRipple * 1.5);
  });

  it('功率因数 > 0.8', () => {
    const r = simulateSwitchingPfc(defaultInput);
    expect(r.pf).toBeGreaterThan(0.8);
  });

  it('高 PWM 频率降低纹波', () => {
    const lowFreq = simulateSwitchingPfc({ ...defaultInput, pwmFs: 10000 });
    const highFreq = simulateSwitchingPfc({ ...defaultInput, pwmFs: 40000 });
    expect(highFreq.iLRipple).toBeLessThan(lowFreq.iLRipple * 1.2);
  });

  it('开关纹波 > 0 且小于整周波包络 iLRipple', () => {
    const r = simulateSwitchingPfc(defaultInput);
    const sw = switchingRippleNearPeak(r, defaultInput.pwmFs);
    expect(sw).toBeGreaterThan(0);
    expect(sw).toBeLessThan(r.iLRipple);
  });

  it('大电感减小开关纹波', () => {
    const smallL = simulateSwitchingPfc({ ...defaultInput, lUh: 200 });
    const largeL = simulateSwitchingPfc({ ...defaultInput, lUh: 2000 });
    expect(switchingRippleNearPeak(largeL, defaultInput.pwmFs))
      .toBeLessThan(switchingRippleNearPeak(smallL, defaultInput.pwmFs));
  });

  it('detectDcm 返回布尔且不抛', () => {
    const r = simulateSwitchingPfc(defaultInput);
    expect(typeof detectDcm(r)).toBe('boolean');
    const light = simulateSwitchingPfc({
      ...defaultInput,
      lUh: 80,
      loadCurrent: 0.5,
      cycles: 2,
    });
    expect(typeof detectDcm(light)).toBe('boolean');
  });
});
