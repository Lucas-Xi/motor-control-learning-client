import { describe, expect, it } from 'vitest';
import { compileUserProgram } from './interpreter';

describe('codelab interpreter', () => {
  it('基础算术 / Math 白名单 / 数组返回', () => {
    const p = compileUserProgram('function f(a, b) { return [Math.sqrt(a * a + b * b), Math.hypot(a, b)]; } return f;');
    const r = p.call('f', [3, 4], 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([5, 5]);
  });

  it('if/else 分支与后续语句不被中断（回归：内层无 return 曾中断外层）', () => {
    const p = compileUserProgram(`function f(x) {
      let v = Math.abs(x);
      if (x < 0) v += 100;
      if (x > 1000) return [-1];
      return [v, x];
    } return f;`);
    expect(p.call('f', [-5], 1000)).toEqual({ ok: true, value: [105, -5] });
    expect(p.call('f', [5], 1000)).toEqual({ ok: true, value: [5, 5] });
    expect(p.call('f', [2000], 1000)).toEqual({ ok: true, value: [-1] });
  });

  it('三元 / 逻辑短路 / 比较链', () => {
    const p = compileUserProgram('function f(a) { const t = a > 0 ? a : -a; const z = a !== 0 && t > 1; return [t, z]; } return f;');
    expect(p.call('f', [-3], 1000)).toEqual({ ok: true, value: [3, true] });
    const r = p.call('f', [0], 1000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const [t, z] = r.value as (number | boolean)[];
      expect(z).toBe(false);
      expect(Math.abs(t as number)).toBe(0); // JS 语义下 -a(a=0) 为 -0
    }
  });

  it('复合赋值 += -= *= /= 正确', () => {
    const p = compileUserProgram(`function f(a) {
      let x = a;
      x += 10; x -= 2; x *= 3; x /= 2;
      return [x];
    } return f;`);
    expect(p.call('f', [4], 1000)).toEqual({ ok: true, value: [18] });
  });

  it('未定义标识符 → 运行时错误（非异常抛出）', () => {
    const p = compileUserProgram('function f(a) { return [nope]; } return f;');
    const r = p.call('f', [1], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('nope');
  });

  it('Math 白名单外的属性被拒绝', () => {
    const p = compileUserProgram('function f() { return [1]; } return f;');
    const q = compileUserProgram('function g() { const m = Math.constructor; return [1]; } return g;');
    expect(p.call('f', [], 1000).ok).toBe(true);
    const r = q.call('g', [], 1000);
    expect(r.ok).toBe(false);
  });

  it('步数预算：死循环式长计算被中止（无 for/while，用递归压预算）', () => {
    // 解释器无循环语句；用超大幂运算链消耗 tick 验证预算生效
    const src = 'function f(a) { let x = a; x = Math.pow(x, 2); x = Math.pow(x, 2); return [x]; } return f;';
    const p = compileUserProgram(src);
    const r = p.call('f', [2], 1); // 预算=1：第一个 tick 后即超
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('STEP_BUDGET_EXCEEDED');
  });

  it('语法错误在编译期抛 SyntaxError', () => {
    expect(() => compileUserProgram('function f( {')).toThrow(SyntaxError);
    expect(() => compileUserProgram('let 1x = 2;')).toThrow();
  });

  it('顶层语句 + return 表达式形式（无函数声明）', () => {
    const p = compileUserProgram('const k = 2;\nreturn [k * 21];');
    expect(p.call('anything', [], 1000)).toEqual({ ok: true, value: [42] });
  });
});
