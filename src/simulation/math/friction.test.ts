import { describe, expect, it } from 'vitest';
import { canOvercomeStatic, compoundFriction, sampleFrictionParams } from './friction';

describe('compoundFriction - 零速', () => {
  it('ω=0 时摩擦为 0（符号项 sign(0)=0）', () => {
    expect(compoundFriction(0, sampleFrictionParams.hitachi15HP)).toBe(0);
  });
});

describe('compoundFriction - Stribeck 峰', () => {
  it('极低速 (0.1 rad/s) 接近 T_static', () => {
    const T = compoundFriction(0.1, sampleFrictionParams.hitachi15HP);
    // Stribeck 项几乎未衰减，Tcoulomb + (Tstatic - Tcoulomb) × ≈1 ≈ Tstatic
    expect(T).toBeGreaterThan(0.14);
    expect(T).toBeLessThanOrEqual(0.151);
  });
});

describe('compoundFriction - 高速主要是黏性', () => {
  it('高速 (200 rad/s) 摩擦明显大于低速（黏性主导）', () => {
    const low = compoundFriction(50, sampleFrictionParams.hitachi15HP);
    const high = compoundFriction(200, sampleFrictionParams.hitachi15HP);
    expect(high).toBeGreaterThan(low);
    // 200 rad/s × B=0.0008 = 0.16, + Coulomb 0.10 = 0.26 量级
    expect(high).toBeGreaterThan(0.25);
  });
});

describe('compoundFriction - 反向对称', () => {
  it('反向速度产生反向摩擦', () => {
    const pos = compoundFriction(10, sampleFrictionParams.hitachi15HP);
    const neg = compoundFriction(-10, sampleFrictionParams.hitachi15HP);
    expect(neg).toBeCloseTo(-pos, 6);
  });
});

describe('canOvercomeStatic - 启动失歩判定', () => {
  it('驱动力矩 < T_static → 卡死', () => {
    expect(canOvercomeStatic(0.10, sampleFrictionParams.hitachi15HP)).toBe(false);
    expect(canOvercomeStatic(0.15, sampleFrictionParams.hitachi15HP)).toBe(false);
    expect(canOvercomeStatic(0.16, sampleFrictionParams.hitachi15HP)).toBe(true);
  });
});

describe('compoundFriction - 老化压缩机更难启动', () => {
  it('老化样本 T_static 比新机高', () => {
    expect(sampleFrictionParams.agedCompressor.Tstatic).toBeGreaterThan(
      sampleFrictionParams.hitachi15HP.Tstatic,
    );
    // 老化样本启动需要 > 0.35 N·m 驱动
    expect(canOvercomeStatic(0.20, sampleFrictionParams.agedCompressor)).toBe(false);
    expect(canOvercomeStatic(0.40, sampleFrictionParams.agedCompressor)).toBe(true);
  });
});

describe('compoundFriction - 摩擦谷形状', () => {
  it('扫描 0..50 rad/s 应该看到先下降（Stribeck）再上升（黏性）', () => {
    const samples: number[] = [];
    for (let w = 0.5; w <= 50; w += 2) {
      samples.push(compoundFriction(w, sampleFrictionParams.hitachi15HP));
    }
    // 谷底位置应在低速段（前 1/3 区域）
    let minIdx = 0;
    for (let i = 0; i < samples.length; i += 1) {
      if (samples[i] < samples[minIdx]) minIdx = i;
    }
    expect(minIdx).toBeGreaterThan(2);   // 不是开头
    expect(minIdx).toBeLessThan(samples.length / 2);
  });
});
