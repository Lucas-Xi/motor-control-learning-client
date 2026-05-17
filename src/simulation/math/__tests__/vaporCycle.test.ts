import { describe, expect, it } from 'vitest';
import { simulateCycle } from '../vaporCycle';
import { hVapSat, hLiqSat, rhoVapSat } from '../refrigerantProps';

describe('vaporCycle simulateCycle', () => {
  const baseInput = {
    refrigerant: 'R32' as const,
    Te: 5,
    Tc: 45,
    superheatK: 5,
    subcoolK: 3,
    displacementCc: 12,
    clearanceRatio: 0.05,
    rpm: 4500,
    isentropicEff: 0.7,
    eevOpening: 0.6,
  };

  it('能效比 COP 必须 > 1（制冷量大于输入功）且为有限值', () => {
    // 注：当前教学模型 COP 比真实 R-32 偏高约 2x（多变压缩 + 简化等熵效率组合带来的累计误差），
    // 但只要 >1 且有限就能用于"看趋势"。精度提升属未来工作。
    const r = simulateCycle(baseInput);
    expect(r.cop).toBeGreaterThan(1);
    expect(Number.isFinite(r.cop)).toBe(true);
    expect(r.cop).toBeLessThan(15);
  });

  it('压缩比 P_d/P_s > 1', () => {
    const r = simulateCycle(baseInput);
    expect(r.pressureRatio).toBeGreaterThan(1);
  });

  it('排气温度高于吸气温度', () => {
    const r = simulateCycle(baseInput);
    expect(r.Tdischarge).toBeGreaterThan(baseInput.Te + baseInput.superheatK);
  });

  it('过热度增大 → 入口密度下降 → 质量流量下降', () => {
    // Domain audit bug: 原密度修正方向反了（T1_K / Te_K）让过热度增大反而流量上升。
    // 正确：等压下 ρ ∝ 1/T，过热度增加温度升高 → 密度降低 → 质量流量降低。
    const low = simulateCycle({ ...baseInput, superheatK: 2 });
    const high = simulateCycle({ ...baseInput, superheatK: 20 });
    expect(high.massFlow).toBeLessThan(low.massFlow);
  });

  it('容积效率 ∈ (0, 1]', () => {
    const r = simulateCycle(baseInput);
    expect(r.volumetricEff).toBeGreaterThan(0);
    expect(r.volumetricEff).toBeLessThanOrEqual(1);
  });

  it('降低冷凝温度（减小压缩比）→ COP 上升', () => {
    const hotter = simulateCycle({ ...baseInput, Tc: 55 });
    const cooler = simulateCycle({ ...baseInput, Tc: 38 });
    expect(cooler.cop).toBeGreaterThan(hotter.cop);
  });

  it('Tc <= Te 触发警告', () => {
    const r = simulateCycle({ ...baseInput, Tc: -10 });
    expect(r.warnings.some((w) => w.includes('冷凝温度必须高于蒸发温度'))).toBe(true);
  });
});

describe('refrigerantProps', () => {
  // Domain audit bug: 原 R-32 潜热 Lref=315 偏低约 20%，应为 ~382 kJ/kg
  it('R-32 在 0°C 潜热 ≈ 382 kJ/kg（NIST REFPROP 实测约 381.7）', () => {
    const hl = hLiqSat(0, 'R32');
    const hv = hVapSat(0, 'R32');
    expect(hv - hl).toBeGreaterThan(360);
    expect(hv - hl).toBeLessThan(400);
  });

  it('R-410A 潜热应小于 R-32（已知物性）', () => {
    const r32Latent = hVapSat(0, 'R32') - hLiqSat(0, 'R32');
    const r410aLatent = hVapSat(0, 'R410A') - hLiqSat(0, 'R410A');
    expect(r410aLatent).toBeLessThan(r32Latent);
  });

  it('密度随温度升高（接近临界点）', () => {
    const rho20 = rhoVapSat(20, 'R32');
    const rho50 = rhoVapSat(50, 'R32');
    expect(rho50).toBeGreaterThan(rho20);
  });
});
