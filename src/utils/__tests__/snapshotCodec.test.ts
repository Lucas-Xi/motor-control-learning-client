import { describe, expect, it } from 'vitest';
import {
  decodeSnapshot,
  encodeSnapshot,
  packAppState,
  type AppStateInput,
} from '../snapshotCodec';
import {
  apfDefault,
  clarkeDefault,
  controlLoopDefault,
  faultDefault,
  focDefault,
  hfiDefault,
  inverterDefault,
  motorBasicsDefault,
  parkDefault,
  pidDefault,
  refrigerationDefault,
  sensorlessDefault,
  startupDefault,
  svpwmDefault,
  threePhaseDefault,
  weakFieldDefault,
} from '../../simulation/engine/presets';

function defaultInput(): AppStateInput {
  return packAppState(
    {
      motorBasics: motorBasicsDefault,
      threePhase: threePhaseDefault,
      clarke: clarkeDefault,
      park: parkDefault,
      pid: pidDefault,
      svpwm: svpwmDefault,
      inverter: inverterDefault,
      sensorless: sensorlessDefault,
      weakField: weakFieldDefault,
      fault: faultDefault,
      controlLoop: controlLoopDefault,
      foc: focDefault,
      hfi: hfiDefault,
      startup: startupDefault,
      apf: apfDefault,
      refrigeration: refrigerationDefault,
    },
    {
      compressorBundleId: 'bundle-x',
      inverterPartNo: 'inv-y',
      strategyId: 'strat-z',
      loadId: 'load-a',
      pfcId: 'pfc-b',
      separatorId: 'sep-c',
    },
    { 'chal-001': 12.34, 'chal-002': 5.5 },
  );
}

describe('snapshotCodec', () => {
  it('encode → decode 双向无损（数值容差 0.001）', () => {
    const input = defaultInput();
    const token = encodeSnapshot(input);
    const out = decodeSnapshot(token);
    expect(out.ok).toBe(true);
    expect(out.state).toBeTruthy();
    if (!out.state) throw new Error('unreachable');

    // 抽检若干字段
    expect((out.state.sim.motorBasics as Record<string, unknown>).polePairs).toBe(
      motorBasicsDefault.polePairs,
    );
    // 浮点 trim 后误差 < 1e-3
    expect((out.state.sim.motorBasics as Record<string, number>).flux).toBeCloseTo(
      motorBasicsDefault.flux,
      3,
    );
    expect((out.state.sim.pid as Record<string, unknown>).antiWindup).toBe(pidDefault.antiWindup);
    expect((out.state.sim.refrigeration as Record<string, unknown>).refrigerant).toBe(
      refrigerationDefault.refrigerant,
    );
    expect(out.state.asm?.compressorBundleId).toBe('bundle-x');
    expect(out.state.ch?.['chal-001']).toBeCloseTo(12.34, 3);
  });

  it('默认参数 token 长度 ≤ 1200 字符', () => {
    const input = defaultInput();
    const token = encodeSnapshot(input);
    // 实测约 1085 字符；上限 1200 给后续追加字段留点余量
    expect(token.length).toBeLessThanOrEqual(1200);
    expect(token.length).toBeGreaterThan(100);
  });

  it('版本头 = "1"', () => {
    const token = encodeSnapshot(defaultInput());
    expect(token[0]).toBe('1');
  });

  it('未知版本被拒绝', () => {
    const token = encodeSnapshot(defaultInput());
    const tampered = '9' + token.slice(1);
    const out = decodeSnapshot(tampered);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/版本/);
  });

  it('空 token / 太短 token 被拒绝', () => {
    expect(decodeSnapshot('').ok).toBe(false);
    expect(decodeSnapshot('1').ok).toBe(false);
  });

  it('损坏的 base64 被拒绝', () => {
    // '1' + 非法 base64 字符
    const out = decodeSnapshot('1!!!@@@###');
    expect(out.ok).toBe(false);
  });

  it('合法 base64 但 JSON 不是对象 → 拒绝', () => {
    // 编码 "null"
    const malformed = '1' + btoa('null').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '~');
    const out = decodeSnapshot(malformed);
    expect(out.ok).toBe(false);
  });

  it('JSON 顶层对象但缺 sim 字段 → 拒绝', () => {
    const malformed = '1' + btoa('{"x":1}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '~');
    const out = decodeSnapshot(malformed);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/sim/);
  });

  it('无 asm / ch 的精简快照也能成功 round-trip', () => {
    const input = packAppState({
      motorBasics: motorBasicsDefault,
      threePhase: threePhaseDefault,
      clarke: clarkeDefault,
      park: parkDefault,
      pid: pidDefault,
      svpwm: svpwmDefault,
      inverter: inverterDefault,
      sensorless: sensorlessDefault,
      weakField: weakFieldDefault,
      fault: faultDefault,
      controlLoop: controlLoopDefault,
      foc: focDefault,
      hfi: hfiDefault,
      startup: startupDefault,
      apf: apfDefault,
      refrigeration: refrigerationDefault,
    });
    const token = encodeSnapshot(input);
    const out = decodeSnapshot(token);
    expect(out.ok).toBe(true);
    expect(out.state?.asm).toBeUndefined();
    expect(out.state?.ch).toBeUndefined();
  });

  it('未知短 key 在 sim 段里被静默忽略（向前兼容）', () => {
    // 手工造一个含未知短 key 'zz' 的 payload
    const payload = JSON.stringify({
      sim: {
        mb: { polePairs: 5 },
        zz: { future: 1 },
      },
    });
    const token = '1' + btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '~');
    const out = decodeSnapshot(token);
    expect(out.ok).toBe(true);
    expect(out.state?.sim.motorBasics).toBeTruthy();
    // 未知 key 被忽略：不会出现在 sim 上
    expect(Object.keys(out.state?.sim ?? {})).not.toContain('zz');
  });
});
