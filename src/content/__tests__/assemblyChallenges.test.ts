import { describe, expect, it } from 'vitest';
import {
  assemblyChallenges,
  checkChallengePass,
  challengeProgress,
  lookupChallengeIndices,
} from '../assemblyChallenges';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
  runAssembly,
} from '../assemblyLibraries';
import { compressorBundles } from '../compressorLibrary';

describe('assemblyChallenges', () => {
  it('every challenge initial config resolves to valid indices', () => {
    for (const c of assemblyChallenges) {
      const idx = lookupChallengeIndices(c);
      expect(idx, `challenge ${c.id} 初始配置无效`).not.toBeNull();
    }
  });

  it('every challenge initial config FAILS (otherwise no point in challenge)', () => {
    for (const c of assemblyChallenges) {
      const idx = lookupChallengeIndices(c)!;
      const result = runAssembly({
        compressor: compressorBundles[idx.compressorIdx].compressor,
        inverter: inverterPlatforms[idx.inverterIdx],
        strategy: controlStrategies[idx.strategyIdx],
        load: loadConditions[idx.loadIdx],
        pfc: pfcPlatforms[idx.pfcIdx],
        separator: liquidSeparators[idx.separatorIdx],
      });
      expect(checkChallengePass(c, result), `challenge ${c.id} 初始就已通关，题目无效`).toBe(false);
    }
  });

  it('every challenge has at least one valid solution', () => {
    // 穷举 6 槽位组合（受限：固定 pfc=boost-single + sep=standard 作为基线，因不是所有题都关心这两个）
    // 实际上对 6 槽位完全穷举 = 5×7×4×5×4×3 = 8400 — 跑得动但有点慢
    for (const c of assemblyChallenges) {
      let found = false;
      outer: for (let ci = 0; ci < compressorBundles.length; ci += 1) {
        for (let ii = 0; ii < inverterPlatforms.length; ii += 1) {
          for (let si = 0; si < controlStrategies.length; si += 1) {
            for (let li = 0; li < loadConditions.length; li += 1) {
              for (let pi = 0; pi < pfcPlatforms.length; pi += 1) {
                for (let sep = 0; sep < liquidSeparators.length; sep += 1) {
                  const result = runAssembly({
                    compressor: compressorBundles[ci].compressor,
                    inverter: inverterPlatforms[ii],
                    strategy: controlStrategies[si],
                    load: loadConditions[li],
                    pfc: pfcPlatforms[pi],
                    separator: liquidSeparators[sep],
                  });
                  if (checkChallengePass(c, result)) {
                    found = true;
                    break outer;
                  }
                }
              }
            }
          }
        }
      }
      expect(found, `challenge ${c.id} 8400 种 6 槽组合里都没找到通关解`).toBe(true);
    }
  });

  it('challengeProgress counts resolved keywords correctly', () => {
    const c = assemblyChallenges.find((c) => c.id === 'undersized-inverter')!;
    const idx = lookupChallengeIndices(c)!;

    // 初始：电流余量不够，progress.resolved 应该是 0
    const initialResult = runAssembly({
      compressor: compressorBundles[idx.compressorIdx].compressor,
      inverter: inverterPlatforms[idx.inverterIdx],
      strategy: controlStrategies[idx.strategyIdx],
      load: loadConditions[idx.loadIdx],
    });
    const initialProg = challengeProgress(c, initialResult);
    expect(initialProg.total).toBeGreaterThan(0);
    expect(initialProg.resolved).toBe(0);

    // 把 inverter 换成大的，progress 应该上升
    const sankenIdx = inverterPlatforms.findIndex((i) => i.ipmPartNo === 'SCM1241MF');
    const fixedResult = runAssembly({
      compressor: compressorBundles[idx.compressorIdx].compressor,
      inverter: inverterPlatforms[sankenIdx],
      strategy: controlStrategies[idx.strategyIdx],
      load: loadConditions[idx.loadIdx],
    });
    const fixedProg = challengeProgress(c, fixedResult);
    expect(fixedProg.resolved).toBeGreaterThanOrEqual(initialProg.resolved + 1);
  });

  it('checkChallengePass returns true when verdict meets and faults cleared', () => {
    const c = assemblyChallenges.find((c) => c.id === 'undersized-inverter')!;
    const idx = lookupChallengeIndices(c)!;
    const sankenIdx = inverterPlatforms.findIndex((i) => i.ipmPartNo === 'SCM1241MF');

    const result = runAssembly({
      compressor: compressorBundles[idx.compressorIdx].compressor,
      inverter: inverterPlatforms[sankenIdx],
      strategy: controlStrategies[idx.strategyIdx],
      load: loadConditions[idx.loadIdx],
    });
    expect(checkChallengePass(c, result)).toBe(true);
  });
});
