import { describe, expect, it } from 'vitest';
import { timestamp, toCsv } from '../download';

describe('toCsv', () => {
  it('简单数值列：直接 join 不转义', () => {
    const rows = [
      { t: '0', v: '1.23' },
      { t: '1', v: '4.56' },
    ];
    const csv = toCsv(rows, ['t', 'v']);
    expect(csv).toBe('t,v\n0,1.23\n1,4.56');
  });

  it('值含逗号 → 双引号包起来', () => {
    const rows = [{ name: 'Doe, John', age: '30' }];
    const csv = toCsv(rows, ['name', 'age']);
    expect(csv).toBe('name,age\n"Doe, John",30');
  });

  it('值含双引号 → 双引号转义为 ""', () => {
    const rows = [{ note: 'He said "hi"' }];
    const csv = toCsv(rows, ['note']);
    expect(csv).toBe('note\n"He said ""hi"""');
  });

  it('缺失字段 → 空字符串', () => {
    const rows: Array<{ a: string; b?: string }> = [{ a: 'x' }];
    const csv = toCsv(rows, ['a', 'b']);
    expect(csv).toBe('a,b\nx,');
  });

  it('空行集合 → 仅 header', () => {
    expect(toCsv([], ['t', 'v'])).toBe('t,v');
  });
});

describe('timestamp', () => {
  it('格式 YYYYMMDD-HHMMSS', () => {
    const t = timestamp();
    expect(t).toMatch(/^\d{8}-\d{6}$/);
  });

  it('每次调用得到的字符串单调不减（同秒可能相同）', () => {
    const a = timestamp();
    const b = timestamp();
    expect(b >= a).toBe(true);
  });
});
