import { describe, expect, it } from 'vitest';
import { runChallenge } from './runner';
import { clarkeChallenge } from '../../content/codelab/clarke';

describe('codelab runner', () => {
  it('正确实现 → 全部通过', () => {
    const r = runChallenge(clarkeChallenge, clarkeChallenge.starter.replace(/const (alpha|beta|zero) = 0;/g,
      'const $1 = 1;')); // placeholder：starter 本身是错的，用真实实现替换
    // 用真实公式直接验证
    const good = `function clarkeTransform(ia, ib, ic) {
      return [ia, (ia + 2 * ib) / Math.sqrt(3), (ia + ib + ic) / 3];
    }
    return clarkeTransform;`;
    const r2 = runChallenge(clarkeChallenge, good);
    expect(r2.ok).toBe(true);
    expect(r2.passed).toBe(clarkeChallenge.cases.length);
    expect(r.fatalError).toBeUndefined();
    void r;
  });

  it('错误实现 → 失败且给出期望/实际', () => {
    const bad = `function clarkeTransform(ia, ib, ic) {
      return [ia, ib, ic];
    }
    return clarkeTransform;`;
    const r = runChallenge(clarkeChallenge, bad);
    expect(r.ok).toBe(false);
    expect(r.passed).toBe(0);
    expect(r.results[0].reason).toBe('mismatch');
    expect(r.results[0].expected.length).toBe(3);
  });

  it('语法错误 → fatalError，不抛出', () => {
    const r = runChallenge(clarkeChallenge, 'function broken( {');
    expect(r.ok).toBe(false);
    expect(r.fatalError).toBeTruthy();
  });

  it('返回非数字 → error 结果', () => {
    const r = runChallenge(clarkeChallenge, 'function clarkeTransform() { return "oops"; } return clarkeTransform;');
    expect(r.ok).toBe(false);
    expect(r.results[0].reason).toBe('error');
  });

  it('运行时错误 → 该用例 error 但不影响其他用例', () => {
    // 第 2 个用例 ib=0 时引用未声明变量触发错误；其余用例正常
    const r = runChallenge(clarkeChallenge,
      'function clarkeTransform(ia, ib) { if (ib === 0) { return [oops]; } return [ia, ib, 0]; } return clarkeTransform;');
    expect(r.ok).toBe(false);
    expect(r.results.some((x) => x.reason === 'error')).toBe(true);
    expect(r.results.some((x) => x.reason !== 'error')).toBe(true);
  });

  it('容差判定：1e-5 偏差在默认容差内通过', () => {
    const good = `function clarkeTransform(ia, ib, ic) {
      return [ia + 1e-5, (ia + 2 * ib) / Math.sqrt(3), (ia + ib + ic) / 3];
    }
    return clarkeTransform;`;
    const r = runChallenge(clarkeChallenge, good);
    expect(r.ok).toBe(true);
  });
});
