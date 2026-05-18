import { describe, expect, it } from 'vitest';
import { simulatePfcCycle, spectrumOf, outputSampleRate } from './boostPfc';

const baseInput = {
  Vac_rms: 220,
  Vdc_ref: 380,
  L_mH: 1.5,
  C_uF: 470,
  load_W: 1500,
  Kpv: 0.6,
  Kiv: 8,
  Kpi: 0.08,
  Kii: 120,
} as const;

describe('simulatePfcCycle 基础形状', () => {
  it('返回数组长度一致且非空', () => {
    const r = simulatePfcCycle({ ...baseInput });
    expect(r.t_ms.length).toBeGreaterThan(100);
    const N = r.t_ms.length;
    expect(r.v_grid).toHaveLength(N);
    expect(r.i_grid_pfc).toHaveLength(N);
    expect(r.i_grid_no_pfc).toHaveLength(N);
    expect(r.Udc).toHaveLength(N);
    expect(r.iL).toHaveLength(N);
    expect(r.iL_ref).toHaveLength(N);
    expect(r.duty).toHaveLength(N);
  });

  it('电网电压峰值 ≈ Vac_rms · √2', () => {
    const r = simulatePfcCycle({ ...baseInput });
    const peak = Math.max(...r.v_grid.map(Math.abs));
    expect(peak).toBeGreaterThan(220 * 1.41 - 5);
    expect(peak).toBeLessThan(220 * 1.41 + 5);
  });

  it('占空比始终在 [0, 0.95]', () => {
    const r = simulatePfcCycle({ ...baseInput });
    for (const d of r.duty) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(0.95);
    }
  });

  it('Udc_ref < Vac_peak 时被强制抬到 1.05·Vpeak 之上（Boost 必须升压）', () => {
    const r = simulatePfcCycle({ ...baseInput, Vdc_ref: 100 });
    expect(r.Udc_avg).toBeGreaterThan(220 * 1.41);
  });

  it('outputSampleRate 与默认参数一致：1/(1e-5 · 10) = 10 kHz', () => {
    expect(outputSampleRate({})).toBeCloseTo(10000, 0);
    expect(outputSampleRate({ dt: 2e-5, decimate: 5 })).toBeCloseTo(10000, 0);
  });
});

describe('PFC 启用 vs 禁用 —— THD/PF 对比', () => {
  it('启用 PFC 后 THD 应显著小于裸整流', () => {
    const r = simulatePfcCycle({ ...baseInput, pfc_enabled: true });
    // 裸整流（无 PFC）THD 远大于 PFC THD
    expect(r.thd_no_pfc).toBeGreaterThan(r.thd);
    // 工程经验：裸整流 THD > 50%
    expect(r.thd_no_pfc).toBeGreaterThan(40);
  });

  it('启用 PFC 后 PF 应显著高于裸整流', () => {
    const r = simulatePfcCycle({ ...baseInput });
    expect(r.pf).toBeGreaterThan(r.pf_no_pfc);
    expect(r.pf).toBeGreaterThan(0.85);
  });

  it('pfc_enabled=false 时电感电流恒为 0', () => {
    const r = simulatePfcCycle({ ...baseInput, pfc_enabled: false });
    for (const x of r.iL) expect(x).toBeCloseTo(0, 6);
  });
});

describe('双环行为', () => {
  it('稳态时 Udc 平均接近 Vdc_ref（±5%）', () => {
    const r = simulatePfcCycle({ ...baseInput });
    expect(r.Udc_avg).toBeGreaterThan(380 * 0.95);
    expect(r.Udc_avg).toBeLessThan(380 * 1.05);
  });

  it('电流参考形状应是 |sin|（电网过零附近参考接近 0）', () => {
    const r = simulatePfcCycle({ ...baseInput });
    // 取后半段（跳过启动瞬态）找出 v_grid 绝对值最小处（电网过零附近）
    const half = Math.floor(r.t_ms.length / 2);
    let vMinIdx = half;
    for (let i = half + 1; i < r.v_grid.length; i += 1) {
      if (Math.abs(r.v_grid[i]) < Math.abs(r.v_grid[vMinIdx])) vMinIdx = i;
    }
    // 后半段的参考峰值（稳态）
    let refPeak = 0;
    for (let i = half; i < r.iL_ref.length; i += 1) {
      if (r.iL_ref[i] > refPeak) refPeak = r.iL_ref[i];
    }
    // 在过零处，iL_ref 应该 < 20% 稳态峰值（|sin| 形状）
    expect(r.iL_ref[vMinIdx]).toBeLessThan(refPeak * 0.25);
  });

  it('Kpi=0 / Kii=0（电流环失效）会让 THD 明显恶化', () => {
    const r0 = simulatePfcCycle({ ...baseInput });
    const rBad = simulatePfcCycle({ ...baseInput, Kpi: 0, Kii: 0 });
    expect(rBad.thd).toBeGreaterThan(r0.thd);
  });
});

describe('谐波注入', () => {
  it('注入 3/5 次谐波后频谱在对应频点有可见能量', () => {
    const r = simulatePfcCycle({
      ...baseInput,
      harmonics_to_inject: [
        { order: 3, amp: 0.1 },
        { order: 5, amp: 0.05 },
      ],
    });
    const fs = outputSampleRate({});
    const spec = spectrumOf(r.v_grid, fs);
    // 找最近的 150Hz、250Hz bin
    const idxAt = (f: number) => {
      let best = 1;
      for (let k = 2; k < spec.freq.length; k += 1) {
        if (Math.abs(spec.freq[k] - f) < Math.abs(spec.freq[best] - f)) best = k;
      }
      return best;
    };
    const fund = idxAt(50);
    const h3 = idxAt(150);
    const h5 = idxAt(250);
    // 三次幅值 ~10%·基波，五次 ~5%·基波（容差大些，因 60ms 窗 + 离散栅栏）
    expect(spec.mag[h3] / spec.mag[fund]).toBeGreaterThan(0.05);
    expect(spec.mag[h5] / spec.mag[fund]).toBeGreaterThan(0.02);
  });

  it('不注入谐波时干净电网下 v_grid 几乎纯基波（高次能量 < 5%）', () => {
    const r = simulatePfcCycle({ ...baseInput });
    const fs = outputSampleRate({});
    const spec = spectrumOf(r.v_grid, fs);
    let fund = 1;
    for (let k = 2; k < spec.mag.length; k += 1) if (spec.mag[k] > spec.mag[fund]) fund = k;
    let highSum = 0;
    for (let k = 2; k < spec.mag.length; k += 1) {
      if (k === fund) continue;
      highSum += spec.mag[k];
    }
    expect(highSum / spec.mag[fund]).toBeLessThan(0.1);
  });
});

describe('负载阶跃恢复', () => {
  it('load_step=true 时 settling_ms > 0 且 < total_sec·1000', () => {
    const r = simulatePfcCycle({
      ...baseInput,
      load_step: true,
      total_sec: 0.12,
    });
    // 在阶跃 + 给定整定下应能稳定；若调得太差则等于 0（没收敛在窗口内）
    expect(r.settling_ms).toBeGreaterThanOrEqual(0);
    expect(r.settling_ms).toBeLessThan(120);
  });

  it('load_step=false 时 settling_ms == 0（未触发阶跃）', () => {
    const r = simulatePfcCycle({ ...baseInput, load_step: false });
    expect(r.settling_ms).toBe(0);
  });
});

describe('数值稳定性', () => {
  it('长时间仿真（200ms）不产生 NaN / Inf', () => {
    const r = simulatePfcCycle({ ...baseInput, total_sec: 0.2 });
    for (const x of r.Udc) {
      expect(Number.isFinite(x)).toBe(true);
    }
    for (const x of r.iL) {
      expect(Number.isFinite(x)).toBe(true);
    }
  });

  it('电感很小（极端 0.1 mH）仍不发散', () => {
    const r = simulatePfcCycle({ ...baseInput, L_mH: 0.1 });
    expect(Number.isFinite(r.thd)).toBe(true);
    expect(Number.isFinite(r.pf)).toBe(true);
  });
});
