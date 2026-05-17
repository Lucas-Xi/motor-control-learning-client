import { describe, expect, it } from 'vitest';
import { makeAntiWindupPI } from './antiwindup';

describe('makeAntiWindupPI - 基本行为', () => {
  it('零误差应输出 0（无历史积分时）', () => {
    const pi = makeAntiWindupPI(1, 10, 0, -100, 100);
    expect(pi.step(0, 0.001)).toBe(0);
    expect(pi.saturated).toBe(false);
  });

  it('小误差不饱和：u ≈ Kp·e + Ki·∫e·dt', () => {
    const pi = makeAntiWindupPI(2, 100, 0, -100, 100);
    const e = 0.5;
    const dt = 0.001;
    const u1 = pi.step(e, dt);
    // 第一拍：积分 = e·dt = 0.0005, u = 2·0.5 + 100·0.0005 = 1.05
    expect(u1).toBeCloseTo(1.05, 4);
    expect(pi.saturated).toBe(false);
  });

  it('reset() 后积分清零', () => {
    const pi = makeAntiWindupPI(1, 50, 10, -10, 10);
    for (let i = 0; i < 100; i += 1) pi.step(1, 0.01);
    expect(Math.abs(pi.integral)).toBeGreaterThan(0);
    pi.reset();
    expect(pi.integral).toBe(0);
    expect(pi.saturated).toBe(false);
  });
});

describe('makeAntiWindupPI - 饱和检测', () => {
  it('正大误差应触发上限饱和', () => {
    const pi = makeAntiWindupPI(10, 100, 0, -5, 5);
    const u = pi.step(10, 0.01);
    expect(u).toBe(5);
    expect(pi.saturated).toBe(true);
  });

  it('负大误差应触发下限饱和', () => {
    const pi = makeAntiWindupPI(10, 100, 0, -5, 5);
    const u = pi.step(-10, 0.01);
    expect(u).toBe(-5);
    expect(pi.saturated).toBe(true);
  });
});

describe('makeAntiWindupPI - back-calculation vs clamping', () => {
  /**
   * 标志性对比：饱和阶段后误差反号，看输出多久脱离饱和。
   * - clamping：积分始终冻结在 ~0，反号误差立刻把 Kp·err 拉出饱和。
   * - back-calc：积分在饱和期被主动倒灌成负值（与 Kp·err 同号反向），辅助快速脱饱和。
   *
   * 更现实的对比应当是：饱和释放后能恢复多少**ki·integral 残余**。
   */
  function simulateOvershoot(ka: number) {
    const pi = makeAntiWindupPI(1, 200, ka, -1, 1);
    const dt = 0.001;
    // 阶段 1：大正误差，持续 500 ms（饱和到上限 +1）
    for (let i = 0; i < 500; i += 1) pi.step(5, dt);
    return { integralAfterSat: pi.integral };
  }

  it('back-calc (ka>0) 在长时间饱和后应让积分远离 0（主动倒灌），与 clamping 的 0 区分明显', () => {
    const clamp = simulateOvershoot(0);
    const backCalc = simulateOvershoot(500);
    // clamping 时积分被冻结在 0 附近
    expect(Math.abs(clamp.integralAfterSat)).toBeLessThan(0.01);
    // back-calc 时积分被驱到负值（教学要点：饱和释放后会快速带 u_sat 回中性区）
    expect(backCalc.integralAfterSat).toBeLessThan(0);
  });

  it('ka=0 (clamping) 时积分被冻结，不会无限增长', () => {
    const pi = makeAntiWindupPI(1, 200, 0, -1, 1);
    const dt = 0.001;
    for (let i = 0; i < 5000; i += 1) pi.step(5, dt);
    // 候选积分会试图增长（5·5=25），但 ka<=0 路径冻结积分
    expect(Math.abs(pi.integral)).toBeLessThan(1);
  });
});

describe('makeAntiWindupPI - Ki=0 退化为纯 P', () => {
  it('纯 P 控制器：输出 = Kp·err（即使 integral 内部累加也不影响输出，因 Ki=0）', () => {
    const pi = makeAntiWindupPI(3, 0, 10, -100, 100);
    for (let i = 0; i < 50; i += 1) pi.step(2, 0.001);
    // Ki=0 时 integral 累积值与控制无关，输出始终是 Kp·err
    const u = pi.step(1, 0.001);
    expect(u).toBeCloseTo(3, 9);
  });
});

describe('makeAntiWindupPI - 数值边界', () => {
  it('dt=0 不应除零或 NaN', () => {
    const pi = makeAntiWindupPI(1, 100, 10, -10, 10);
    const u = pi.step(2, 0);
    expect(Number.isFinite(u)).toBe(true);
  });

  it('outMin > outMax 这种病态输入下仍能跑（不抛错）', () => {
    // 行为未定义但不能 crash
    const pi = makeAntiWindupPI(1, 1, 1, 10, -10);
    expect(() => pi.step(5, 0.01)).not.toThrow();
  });
});
