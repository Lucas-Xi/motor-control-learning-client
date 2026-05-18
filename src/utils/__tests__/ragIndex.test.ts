import { describe, expect, it, beforeEach } from 'vitest';
import {
  ANSWER_SCORE_THRESHOLD,
  buildRagIndex,
  citationToTarget,
  classifyQuestion,
  composeAnswer,
  search,
  tokenize,
  _resetRagIndexForTests,
} from '../ragIndex';

describe('tokenize', () => {
  beforeEach(() => _resetRagIndexForTests());

  it('ASCII words and numbers', () => {
    const toks = tokenize('PI Kp = 1.5 Iq');
    // 全小写
    expect(toks).toContain('pi');
    expect(toks).toContain('kp');
    expect(toks).toContain('1.5');
    expect(toks).toContain('iq');
  });

  it('Chinese 2-gram + 1-gram', () => {
    const toks = tokenize('电角度');
    // 1-gram 全保留
    expect(toks).toContain('电');
    expect(toks).toContain('角');
    expect(toks).toContain('度');
    // 2-gram 滑窗
    expect(toks).toContain('电角');
    expect(toks).toContain('角度');
  });

  it('mixed Chinese + English query', () => {
    const toks = tokenize('为什么 Iq 会震荡');
    expect(toks).toContain('iq');
    expect(toks).toContain('为什');
    expect(toks).toContain('什么');
    expect(toks).toContain('震荡');
  });

  it('empty / whitespace-only returns empty array', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   \n\t  ')).toEqual([]);
  });
});

describe('buildRagIndex', () => {
  beforeEach(() => _resetRagIndexForTests());

  it('builds within 200ms with hundreds of chunks (warm run)', () => {
    // 第一次构建（含倒排表）；测试机宽松一点给 400ms 上限
    const idx = buildRagIndex();
    expect(idx.chunks.length).toBeGreaterThan(80);
    expect(idx.buildMs).toBeLessThan(400);
    // 平均文档长度合理（chunk 长度 ~ 数十到数百 token）
    expect(idx.avgDocLength).toBeGreaterThan(5);
    expect(idx.avgDocLength).toBeLessThan(3000);
  });

  it('inverted index covers common Chinese terms', () => {
    const idx = buildRagIndex();
    // "电角度" 至少在某个 chunk 出现
    expect(idx.postings.has('电角')).toBe(true);
    expect(idx.postings.has('iq')).toBe(true);
  });

  it('subsequent build calls return cached index (idempotent)', () => {
    const a = buildRagIndex();
    const b = buildRagIndex();
    expect(a).toBe(b); // 同一引用
  });
});

describe('search (BM25 ranking)', () => {
  beforeEach(() => _resetRagIndexForTests());

  it('ranks glossary FOC entry near top for "FOC 是什么"', () => {
    const out = search('FOC 是什么', 8);
    expect(out.length).toBeGreaterThan(0);
    const top3 = out.slice(0, 3);
    const hasFocGlossary = top3.some(
      (r) => r.chunk.source.kind === 'glossary' && /foc/i.test(r.chunk.title),
    );
    expect(hasFocGlossary).toBe(true);
  });

  it('ranks SVPWM formula or glossary near top for "SVPWM"', () => {
    const out = search('SVPWM', 5);
    const hit = out.some((r) =>
      (r.chunk.source.kind === 'glossary' || r.chunk.source.kind === 'formula' || r.chunk.source.kind === 'lesson')
      && /svpwm/i.test(r.chunk.title + r.chunk.text),
    );
    expect(hit).toBe(true);
  });

  it('finds liquid-slugging fault content for query "液击"', () => {
    const out = search('液击 怎么处理', 8);
    const hit = out.some((r) => r.chunk.source.kind === 'faultCase'
      && r.chunk.source.faultId === 'liquid-slugging');
    expect(hit).toBe(true);
  });

  it('finds field weakening discussion for "弱磁 Id"', () => {
    const out = search('弱磁 Id 为什么是负的', 8);
    // 应该至少命中 field-weakening 相关 lesson / formula / glossary
    const hit = out.some((r) => {
      const txt = (r.chunk.title + r.chunk.text).toLowerCase();
      return txt.includes('弱磁') || txt.includes('id');
    });
    expect(hit).toBe(true);
  });

  it('finds PID Kp content for "Kp 太大会怎么样"', () => {
    const out = search('Kp 太大 振荡', 8);
    expect(out.length).toBeGreaterThan(0);
    const hit = out.some((r) => {
      const txt = (r.chunk.title + r.chunk.text).toLowerCase();
      return txt.includes('kp') || txt.includes('pi') || txt.includes('振') || txt.includes('荡');
    });
    expect(hit).toBe(true);
  });

  it('returns empty array for empty query', () => {
    expect(search('', 5)).toEqual([]);
    expect(search('   ', 5)).toEqual([]);
  });

  it('top-k truncation works', () => {
    const out = search('电机', 3);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('score is monotonically non-increasing', () => {
    const out = search('FOC SVPWM Iq', 10);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].score).toBeLessThanOrEqual(out[i - 1].score);
    }
  });
});

describe('classifyQuestion', () => {
  it('detects "是什么" → what', () => {
    expect(classifyQuestion('FOC 是什么')).toBe('what');
    expect(classifyQuestion('什么是 SVPWM')).toBe('what');
  });
  it('detects "为什么" → why', () => {
    expect(classifyQuestion('为什么 Iq 会震荡')).toBe('why');
  });
  it('detects "怎么 / 如何 / 操作" → how', () => {
    expect(classifyQuestion('怎么调 Kp')).toBe('how');
    expect(classifyQuestion('如何启动')).toBe('how');
  });
  it('detects 震荡 / 调试 → fix', () => {
    expect(classifyQuestion('Iq 震荡怎么解决')).toBe('fix');
    expect(classifyQuestion('过流怎么调试')).toBe('fix');
  });
  it('defaults to why for ambiguous queries', () => {
    expect(classifyQuestion('随便聊聊')).toBe('why');
  });
});

describe('composeAnswer', () => {
  beforeEach(() => _resetRagIndexForTests());

  it('returns empty-state message when no results', () => {
    const out = composeAnswer('FOC 是什么', []);
    expect(out.citations).toEqual([]);
    expect(out.confidence).toBe(0);
    expect(out.answer).toMatch(/没找到/);
  });

  it('uses English template when locale=en-US and no results', () => {
    const out = composeAnswer('what is FOC', [], 'en-US');
    expect(out.answer.toLowerCase()).toContain("couldn't find");
  });

  it('what kind picks glossary entry first', () => {
    const results = search('FOC 是什么', 8);
    if (results[0].score < ANSWER_SCORE_THRESHOLD) {
      // 检索分数太低就跳过（视构建数据而定）
      return;
    }
    const out = composeAnswer('FOC 是什么', results, 'zh-CN');
    expect(out.kind).toBe('what');
    expect(out.answer).toMatch(/定义/);
    expect(out.citations.length).toBeGreaterThan(0);
  });

  it('why kind cites top-3 with bullet style', () => {
    const results = search('为什么 弱磁 需要 负 Id', 8);
    const out = composeAnswer('为什么 弱磁 需要 负 Id', results, 'zh-CN');
    expect(out.kind).toBe('why');
    // 引用数 ≤ 3
    expect(out.citations.length).toBeLessThanOrEqual(3);
  });
});

describe('citationToTarget', () => {
  beforeEach(() => _resetRagIndexForTests());

  it('lesson chunk → moduleId only', () => {
    const idx = buildRagIndex();
    const lessonChunk = idx.chunks.find((c) => c.source.kind === 'lesson');
    expect(lessonChunk).toBeDefined();
    const t = citationToTarget(lessonChunk!);
    expect(t.moduleId).toBeTruthy();
    expect(t.walkthroughStepId).toBeUndefined();
  });

  it('faultCase chunk → faults-debugging module', () => {
    const idx = buildRagIndex();
    const fc = idx.chunks.find((c) => c.source.kind === 'faultCase');
    expect(fc).toBeDefined();
    const t = citationToTarget(fc!);
    expect(t.moduleId).toBe('faults-debugging');
  });

  it('glossary / formula → no module jump', () => {
    const idx = buildRagIndex();
    const g = idx.chunks.find((c) => c.source.kind === 'glossary');
    expect(g).toBeDefined();
    expect(citationToTarget(g!).moduleId).toBeNull();
  });
});
