import { describe, expect, it } from 'vitest';
import { estimateBackEmf } from '../observer';

describe('BEMF observer angle', () => {
  // Domain audit bug: 原实现 atan2(eβ,eα) + π/2 让转子位置反向 180°（电角度差 π）。
  // PMSM 反电动势：e_α = -ψf·ω·sin(θ), e_β = ψf·ω·cos(θ)
  //   → atan2(e_β, e_α) = θ + π/2
  //   → θ = atan2(e_β, e_α) - π/2
  // 这组测试给定已知 θ 与 ω，构造对应的电流变化，验证 estimateBackEmf 反推出的 angle 与 θ 一致。

  it('给定 θ=0 → 估算 angle ≈ 0', () => {
    const psi = 0.05;       // 磁链 Wb
    const omega = 100;      // 电角速度 rad/s
    const theta = 0;
    // 构造稳态：v - R*i - L*di/dt = ψf·ω·[-sin θ, cos θ]
    const eAlphaExpected = -psi * omega * Math.sin(theta);
    const eBetaExpected = psi * omega * Math.cos(theta);
    // 简化：让 v = e + R*i + L*di/dt 直接成立，di/dt = 0，i = 0
    const result = estimateBackEmf({
      vAlpha: eAlphaExpected, vBeta: eBetaExpected,
      iAlpha: 0, iBeta: 0,
      prevIAlpha: 0, prevIBeta: 0,
      rs: 0.5, ls: 0.001, dt: 1e-4,
    });
    // angle 经 wrapAngleRad 后会落到 [0, 2π) 区间
    const normalized = ((result.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // θ=0 对应 angle≈0 或 2π
    const diff = Math.min(normalized, Math.abs(normalized - 2 * Math.PI));
    expect(diff).toBeLessThan(0.01);
  });

  it('给定 θ=π/3 → 估算 angle ≈ π/3', () => {
    const psi = 0.05;
    const omega = 200;
    const theta = Math.PI / 3;
    const result = estimateBackEmf({
      vAlpha: -psi * omega * Math.sin(theta),
      vBeta: psi * omega * Math.cos(theta),
      iAlpha: 0, iBeta: 0, prevIAlpha: 0, prevIBeta: 0,
      rs: 0.5, ls: 0.001, dt: 1e-4,
    });
    const normalized = ((result.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(Math.abs(normalized - theta)).toBeLessThan(0.01);
  });

  it('给定 θ=π → 估算 angle ≈ π（不是 0；这是 +π/2 bug 会触发的边界）', () => {
    const psi = 0.05;
    const omega = 150;
    const theta = Math.PI;
    const result = estimateBackEmf({
      vAlpha: -psi * omega * Math.sin(theta),
      vBeta: psi * omega * Math.cos(theta),
      iAlpha: 0, iBeta: 0, prevIAlpha: 0, prevIBeta: 0,
      rs: 0.5, ls: 0.001, dt: 1e-4,
    });
    const normalized = ((result.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // 老 bug 会让这个值 = 0，新的应该 ≈ π
    expect(Math.abs(normalized - Math.PI)).toBeLessThan(0.01);
  });
});
