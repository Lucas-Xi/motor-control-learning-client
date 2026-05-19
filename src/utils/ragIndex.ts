/**
 * 本地教学助手 —— 检索索引（RAG retrieval）
 *
 * 设计目标：
 *  - 把仓内全部静态教学内容（lessons / formulas / glossary / faultCases / walkthroughs）
 *    切成 ~500 个 chunk，跑一个简化版 BM25 拿 top-k 召回。
 *  - 0 新增 npm 依赖；中文分词自己实现（按 2-gram + ASCII 单词）。
 *  - 索引构建：lazy 首次调用 `buildRagIndex()` 完成；目标耗时 < 200ms（已实测 ~50-150ms）。
 *  - 全部数据 in-memory，不调外部 API。
 *
 * 不实现完整 BM25：
 *  - 简化点 1：单文档长度归一只用一个常量 b=0.75 + 平均长度，但避免按字段加权
 *  - 简化点 2：不做 stop-word 表（中文 stop-word 收益低、英文术语高频反而 informative）
 *  - 简化点 3：score 直接累加 idf*tf 项，不分字段（field-weighted BM25F），换上 source 权重时
 *               在 chunk 元数据里加 `sourceWeight` 乘 score 即可
 *  - 简化点 4：tf 不做 doc-length 平方根校正；适合 chunk 长度跨度 < 10× 的场景
 *
 * 召回结果带 source 元信息（moduleId / walkthroughStepId / lessonField / ...），
 * UI 层据此把"跳转"按钮接到 simulationStore.setActiveModule + progressStore.setWalkthroughStep。
 */

import { glossary } from '../content/glossary';
import { formulaIndex } from '../content/formulas';
import { faultCases } from '../content/faultCases';
import { lessons } from '../content/lessons';
import type { ModuleId } from '../simulation/engine/types';

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type ChunkSource =
  | { kind: 'glossary'; term: string }
  | { kind: 'formula'; key: string }
  | { kind: 'faultCase'; faultId: string; section: 'phenomenon' | 'causes' | 'steps' | 'fix' | 'stm32' }
  | { kind: 'lesson'; moduleId: ModuleId; field: LessonField }
  | { kind: 'walkthroughStep'; moduleId: ModuleId; stepId: string };

export type LessonField =
  | 'intro'
  | 'concepts'
  | 'engineeringMeaning'
  | 'stm32Guide'
  | 'commonMistakes'
  | 'debugMethods'
  | 'formula';

export interface Chunk {
  /** 在 index 内的唯一序号（即 `chunks` 数组下标） */
  id: number;
  /** 标题：用作 UI 引用块的展示头 */
  title: string;
  /** 全文：用于答案展示、关键句抽取 */
  text: string;
  /** 来源元信息，决定如何跳转 */
  source: ChunkSource;
  /** 词袋（tokens 数组）—— 构建索引后填充 */
  tokens: string[];
  /** 词袋长度，BM25 文档长度归一项分母 */
  length: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  /** 命中的 token（用于高亮 / 可解释性） */
  matchedTokens: string[];
}

export interface RagIndex {
  chunks: Chunk[];
  /** 倒排表：token → 该词出现的 chunk 序号 → 该 chunk 内 tf */
  postings: Map<string, Map<number, number>>;
  /** 词的 idf（document-frequency 反向）。固定后不再变。 */
  idf: Map<string, number>;
  avgDocLength: number;
  /** 构建耗时（ms），用作 dev 调试 */
  buildMs: number;
}

// ─── 中文 + ASCII 分词（自实现，~50 行） ────────────────────────────────────

const ASCII_WORD = /[A-Za-z][A-Za-z0-9_]*|\d+(?:\.\d+)?/g;
// 中文宽泛范围：BMP CJK Unified Ideographs（含扩展 A 简化为 BMP 内）
const CJK = /[一-鿿]+/g;
// 单字符同义 → 归一（避免"q 轴"和"Q轴"看不到关系）
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * tokenize：
 *  1) ASCII 单词 / 数字按 \w 正则切（"PI"、"FOC"、"Iq"、"3.5"）
 *  2) 中文按"全角连续段切出来 → 2-gram"（"电角度" → ["电角", "角度"]）
 *  3) 单字中文也保留为 1-gram 以便短查询命中（"q 轴 d 轴"会同时匹配长术语和单字）
 *  4) 全部 lower-case，去掉空 token
 *
 * 设计取舍：
 *  - 不引 jieba/nodejieba（避免 100+ KB npm 依赖 + WASM）
 *  - 2-gram 在中文短文本上召回率与精度的折中最优；查询"为什么 Iq 震荡"
 *    能拆出 ["为什", "什么", "iq", "震荡", "震", "荡"] 都能匹配 chunk 内的相关词
 */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  if (!input) return out;
  const text = normalize(input);

  // ASCII / 数字
  const asciiMatches = text.match(ASCII_WORD);
  if (asciiMatches) {
    for (const w of asciiMatches) {
      if (w.length > 0) out.push(w);
    }
  }

  // 中文：按连续 CJK 段抓出来，再切 2-gram
  const cjkMatches = text.match(CJK);
  if (cjkMatches) {
    for (const seg of cjkMatches) {
      // 1-gram 保留
      for (let i = 0; i < seg.length; i++) out.push(seg[i]);
      // 2-gram
      if (seg.length >= 2) {
        for (let i = 0; i + 1 < seg.length; i++) out.push(seg.slice(i, i + 2));
      }
    }
  }

  return out;
}

// ─── 索引构建 ────────────────────────────────────────────────────────────────

let _index: RagIndex | null = null;

/**
 * 同步构建索引；如果已构建直接返回缓存。
 *
 * 这是一次性同步开销（500 chunk 量级，本地测约 50-150ms）。
 * 加载 walkthroughs 需要 dynamic import → 调 `buildRagIndexAsync()` 拿全量。
 * `buildRagIndex()` 走的是同步可用数据（lessons / glossary / formulas / faultCases），
 * 用户问"什么是 SVPWM" 这种术语类问题已经覆盖。
 */
export function buildRagIndex(): RagIndex {
  if (_index) return _index;
  const t0 = performance.now();
  const chunks: Chunk[] = [];

  // 1) glossary
  for (const g of glossary) {
    chunks.push({
      id: chunks.length,
      title: `术语 · ${g.term}`,
      text: `${g.term}：${g.definition}` + (g.definitionEn ? ` / ${g.definitionEn}` : ''),
      source: { kind: 'glossary', term: g.term },
      tokens: [],
      length: 0,
    });
  }

  // 2) formulas —— 双语：把英文 name/explanation 也喂进 chunk，让英文 query 也能命中
  for (const f of formulaIndex) {
    const titleParts = [f.name];
    if (f.nameEn) titleParts.push(f.nameEn);
    const textParts = [`${f.name}：${f.expression}`];
    if (f.explanation) textParts.push(f.explanation);
    if (f.nameEn) textParts.push(`${f.nameEn}: ${f.expression}`);
    if (f.explanationEn) textParts.push(f.explanationEn);
    chunks.push({
      id: chunks.length,
      title: `公式 · ${titleParts.join(' / ')}`,
      text: textParts.join('\n'),
      source: { kind: 'formula', key: f.key },
      tokens: [],
      length: 0,
    });
  }

  // 3) faultCases —— 拆 5 段，让"过流原因有哪些"和"过流怎么修"分别命中
  for (const fc of Object.values(faultCases)) {
    chunks.push({
      id: chunks.length,
      title: `故障 · ${fc.title} · 现象`,
      text: `${fc.title}：${fc.phenomenon}`,
      source: { kind: 'faultCase', faultId: fc.id, section: 'phenomenon' },
      tokens: [],
      length: 0,
    });
    chunks.push({
      id: chunks.length,
      title: `故障 · ${fc.title} · 可能原因`,
      text: `${fc.title} 可能原因：${fc.causes.join('；')}`,
      source: { kind: 'faultCase', faultId: fc.id, section: 'causes' },
      tokens: [],
      length: 0,
    });
    chunks.push({
      id: chunks.length,
      title: `故障 · ${fc.title} · 排查步骤`,
      text: `${fc.title} 排查步骤：${fc.steps.join('；')}`,
      source: { kind: 'faultCase', faultId: fc.id, section: 'steps' },
      tokens: [],
      length: 0,
    });
    chunks.push({
      id: chunks.length,
      title: `故障 · ${fc.title} · 修复方法`,
      text: `${fc.title} 修复方法：${fc.fix.join('；')}`,
      source: { kind: 'faultCase', faultId: fc.id, section: 'fix' },
      tokens: [],
      length: 0,
    });
    chunks.push({
      id: chunks.length,
      title: `故障 · ${fc.title} · STM32 实现`,
      text: `${fc.title} STM32 实现：${fc.stm32}`,
      source: { kind: 'faultCase', faultId: fc.id, section: 'stm32' },
      tokens: [],
      length: 0,
    });
  }

  // 4) lessons —— 按字段拆 6-7 chunk / 模块
  for (const [mid, lesson] of Object.entries(lessons)) {
    if (!lesson) continue;
    const moduleId = mid as ModuleId;
    if (lesson.introBeginner) {
      const intro = lesson.introBeginner;
      chunks.push({
        id: chunks.length,
        title: `初识 · ${moduleId}`,
        text: `${intro.coreIdea}\n类比：${intro.metaphor}\n为什么学：${intro.whyCare.join('；')}\n第一步：${intro.firstAction}`,
        source: { kind: 'lesson', moduleId, field: 'intro' },
        tokens: [],
        length: 0,
      });
    }
    if (lesson.concepts.length) {
      chunks.push({
        id: chunks.length,
        title: `核心概念 · ${moduleId}`,
        text: lesson.concepts.join('\n'),
        source: { kind: 'lesson', moduleId, field: 'concepts' },
        tokens: [],
        length: 0,
      });
    }
    for (const f of lesson.formulas) {
      chunks.push({
        id: chunks.length,
        title: `公式（讲义）· ${moduleId} · ${f.title}`,
        text: `${f.title}：${f.expression}\n${f.explanation}`,
        source: { kind: 'lesson', moduleId, field: 'formula' },
        tokens: [],
        length: 0,
      });
    }
    if (lesson.engineeringMeaning.length) {
      chunks.push({
        id: chunks.length,
        title: `工程意义 · ${moduleId}`,
        text: lesson.engineeringMeaning.join('\n'),
        source: { kind: 'lesson', moduleId, field: 'engineeringMeaning' },
        tokens: [],
        length: 0,
      });
    }
    if (lesson.stm32Guide.length) {
      chunks.push({
        id: chunks.length,
        title: `STM32 实战 · ${moduleId}`,
        text: lesson.stm32Guide.join('\n'),
        source: { kind: 'lesson', moduleId, field: 'stm32Guide' },
        tokens: [],
        length: 0,
      });
    }
    if (lesson.commonMistakes.length) {
      chunks.push({
        id: chunks.length,
        title: `常见错误 · ${moduleId}`,
        text: lesson.commonMistakes.join('\n'),
        source: { kind: 'lesson', moduleId, field: 'commonMistakes' },
        tokens: [],
        length: 0,
      });
    }
    if (lesson.debugMethods.length) {
      chunks.push({
        id: chunks.length,
        title: `调试方法 · ${moduleId}`,
        text: lesson.debugMethods.join('\n'),
        source: { kind: 'lesson', moduleId, field: 'debugMethods' },
        tokens: [],
        length: 0,
      });
    }
  }

  // 5) 建倒排表 + 文档长度 + idf
  const postings = new Map<string, Map<number, number>>();
  let totalLength = 0;
  for (const ch of chunks) {
    const tokens = tokenize(`${ch.title} ${ch.text}`);
    ch.tokens = tokens;
    ch.length = tokens.length;
    totalLength += tokens.length;
    for (const tok of tokens) {
      let m = postings.get(tok);
      if (!m) {
        m = new Map();
        postings.set(tok, m);
      }
      m.set(ch.id, (m.get(ch.id) ?? 0) + 1);
    }
  }
  const N = chunks.length;
  const idf = new Map<string, number>();
  for (const [tok, m] of postings) {
    const df = m.size;
    // 经典 BM25 idf：log((N - df + 0.5) / (df + 0.5) + 1)
    // 这个 +1 让 idf 永远非负，避免词出现在 > N/2 文档时变负
    const v = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    idf.set(tok, v);
  }
  const avg = totalLength / Math.max(1, N);
  const buildMs = performance.now() - t0;
  _index = { chunks, postings, idf, avgDocLength: avg, buildMs };
  return _index;
}

/**
 * 异步版本：把 walkthroughs 也吃进来。
 * walkthrough 通过 dynamic import 按需加载，因此不能同步构建全量。
 * 调用者可以在打开助手 UI 时 fire-and-forget 一次 `buildRagIndexAsync()`，
 * 之后 `search()` 自动用到完整索引。
 */
export async function buildRagIndexAsync(): Promise<RagIndex> {
  // 先构造同步基础；下方再增量补 walkthrough chunks 并重算 idf
  const base = buildRagIndex();
  // 已经加过 walkthrough 标记
  if (base.chunks.some((c) => c.source.kind === 'walkthroughStep')) return base;

  const { loadModuleWalkthrough } = await import('../content/walkthroughs');
  const moduleIds: ModuleId[] = [
    'motor-basics', 'three-phase', 'clarke-transform', 'park-transform',
    'pid-control', 'foc-flow', 'svpwm', 'inverter', 'control-loops',
    'sensorless-foc', 'hfi-sensorless', 'field-weakening', 'faults-debugging',
    'startup-statemachine', 'apf-frontend', 'refrigeration-bench', 'assembly-workshop',
  ];
  const all = await Promise.all(moduleIds.map((id) => loadModuleWalkthrough(id).catch(() => undefined)));

  const newChunks: Chunk[] = [];
  for (let i = 0; i < moduleIds.length; i++) {
    const wt = all[i];
    if (!wt) continue;
    for (const step of wt.steps) {
      const parts = [step.goal, `操作：${step.action}`, `观察：${step.observe}`, `为什么：${step.whyMatters}`];
      if (step.quiz) {
        parts.push(`题：${step.quiz.q}`);
        parts.push(`提示：${step.quiz.hint}`);
      }
      newChunks.push({
        id: base.chunks.length + newChunks.length,
        title: `引导 · ${wt.moduleId} · ${step.title}`,
        text: parts.join('\n'),
        source: { kind: 'walkthroughStep', moduleId: wt.moduleId, stepId: step.id },
        tokens: [],
        length: 0,
      });
    }
    // pitfalls 也作为独立 chunk（"试错"经常是用户问"为什么我的 Id=0 时 Iq 抖动"这类问题的最佳答案）
    for (const p of wt.pitfalls) {
      newChunks.push({
        id: base.chunks.length + newChunks.length,
        title: `试错 · ${wt.moduleId} · ${p.label}`,
        text: `症状：${p.symptom}\n原因：${p.why}`,
        source: { kind: 'walkthroughStep', moduleId: wt.moduleId, stepId: p.id },
        tokens: [],
        length: 0,
      });
    }
  }

  // 增量更新倒排表 / idf / avgLen
  let extraLen = 0;
  for (const ch of newChunks) {
    const tokens = tokenize(`${ch.title} ${ch.text}`);
    ch.tokens = tokens;
    ch.length = tokens.length;
    extraLen += tokens.length;
    for (const tok of tokens) {
      let m = base.postings.get(tok);
      if (!m) {
        m = new Map();
        base.postings.set(tok, m);
      }
      m.set(ch.id, (m.get(ch.id) ?? 0) + 1);
    }
    base.chunks.push(ch);
  }
  // 重算 idf（chunk 数量变了）
  const N = base.chunks.length;
  base.idf.clear();
  for (const [tok, m] of base.postings) {
    const df = m.size;
    base.idf.set(tok, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }
  base.avgDocLength = (base.avgDocLength * (N - newChunks.length) + extraLen) / Math.max(1, N);
  return base;
}

/** 测试用：清掉 in-memory 缓存让下一次重建 */
export function _resetRagIndexForTests(): void {
  _index = null;
}

// ─── BM25 检索 ───────────────────────────────────────────────────────────────

const K1 = 1.5; // tf saturation；标准 BM25 取 1.2-2.0
const B = 0.75; // 长度归一强度；标准取 0.75

/**
 * 来源权重：glossary / formula 是"权威定义"，比散文段落更可信，
 * 同等召回下应当排前。值由经验拍定，不必精细调参。
 *  - glossary / formula：1.6（短小精悍，命中即定义）
 *  - faultCase steps/fix：1.2（操作类问题常用）
 *  - walkthroughStep：1.1（含 action / observe，how 类问题首选）
 *  - lesson 长段：1.0（基线）
 */
function sourceWeight(chunk: Chunk): number {
  const k = chunk.source.kind;
  if (k === 'glossary' || k === 'formula') return 1.6;
  if (k === 'faultCase') return 1.2;
  if (k === 'walkthroughStep') return 1.1;
  return 1.0;
}

/**
 * 中文"停用片"——疑问语气词的 1-gram / 2-gram。
 * 这些片段几乎在每个 lesson chunk 都出现，IDF 即使很低还是会喂大量噪声候选，
 * 让"FOC 是什么"被 "什么" / "是什" 主导而盖过 "foc" 本身。
 * 这里在 search 阶段直接剔除查询侧的这些 token；不动 chunk 侧倒排表，
 * 保持词典完整以便其它 query 类型还能命中。
 */
const QUERY_STOP_TOKENS = new Set<string>([
  // 1-gram
  '是', '的', '了', '吗', '呢', '吧', '啊', '哦', '哈',
  '什', '么', '怎', '样', '哪', '何', '会', '为', '到', '有', '在', '和', '与', '及', '或',
  // 2-gram 疑问短语
  '什么', '是什', '怎么', '如何', '为啥', '为什', '什为', '什样',
  // 英文 stop
  'is', 'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'with',
  'what', 'why', 'how',
]);

/**
 * 给定查询返回 top-k chunk + 分数。
 *
 * 排序时去重：
 *  - 同一 chunk 不会出现多次
 *  - 不同 chunk 即使指向同一 moduleId 也分别返回（UI 层再合并）
 *
 * 不区分 query 语种；中文 + 英文混合查询直接 tokenize 即可。
 */
export function search(query: string, k = 8, index?: RagIndex): SearchResult[] {
  const idx = index ?? buildRagIndex();
  const rawTokens = Array.from(new Set(tokenize(query)));
  if (rawTokens.length === 0) return [];

  // 去掉 query 侧停用片；但如果过滤后全空（极端短查询如"为什么"），降级回原 token 集
  let qTokens = rawTokens.filter((t) => !QUERY_STOP_TOKENS.has(t));
  if (qTokens.length === 0) qTokens = rawTokens;

  // 候选 = 任意一个 query token 命中的 chunk
  const candidateScores = new Map<number, number>();
  const candidateMatched = new Map<number, Set<string>>();

  for (const qt of qTokens) {
    const postings = idx.postings.get(qt);
    if (!postings) continue;
    const idfV = idx.idf.get(qt) ?? 0;
    for (const [chunkId, tf] of postings) {
      const chunk = idx.chunks[chunkId];
      const dl = chunk.length;
      const denom = tf + K1 * (1 - B + (B * dl) / Math.max(1, idx.avgDocLength));
      const score = (idfV * tf * (K1 + 1)) / Math.max(1e-9, denom);
      candidateScores.set(chunkId, (candidateScores.get(chunkId) ?? 0) + score);
      let m = candidateMatched.get(chunkId);
      if (!m) {
        m = new Set();
        candidateMatched.set(chunkId, m);
      }
      m.add(qt);
    }
  }

  const arr: SearchResult[] = Array.from(candidateScores.entries()).map(([id, score]) => ({
    chunk: idx.chunks[id],
    score: score * sourceWeight(idx.chunks[id]),
    matchedTokens: Array.from(candidateMatched.get(id) ?? []),
  }));
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, k);
}

// ─── 启发式答案拼装 ─────────────────────────────────────────────────────────

export type Locale = 'zh-CN' | 'en-US';

/**
 * 问题分类正则。优先级顺序：why > fix-verb > how > what > fix-symptom > default(why)。
 * 拆 fix 为两段是为了让"为什么 Iq 会震荡"分到 why（解释类），
 * "Iq 震荡怎么解决" / "怎么调试过流" 才分到 fix（动作类）。
 */
const WHY_PATTERNS = [/为什么/, /为啥/, /原因/, /缘由/, /\bwhy\b/i];
const FIX_VERB_PATTERNS = [/解决/, /修复/, /排查/, /调试/, /排错/, /\bfix\b/i, /\bdebug\b/i, /\btroubleshoot\b/i];
const HOW_PATTERNS = [/怎么/, /如何/, /怎样/, /\bhow\b/i, /操作/, /步骤/, /\bsteps?\b/i];
const WHAT_PATTERNS = [/是什么/, /什么是/, /含义/, /定义/, /\bwhat\b/i, /\bdefine\b/i];
const FIX_SYMPTOM_PATTERNS = [/震荡/, /抖动/, /过流/, /过压/, /欠压/, /烧/, /卡死/, /堵转/];

export type QuestionKind = 'what' | 'why' | 'how' | 'fix';

export function classifyQuestion(query: string): QuestionKind {
  const q = query.toLowerCase();
  if (WHY_PATTERNS.some((re) => re.test(q))) return 'why';
  if (FIX_VERB_PATTERNS.some((re) => re.test(q))) return 'fix';
  if (HOW_PATTERNS.some((re) => re.test(q))) return 'how';
  if (WHAT_PATTERNS.some((re) => re.test(q))) return 'what';
  if (FIX_SYMPTOM_PATTERNS.some((re) => re.test(q))) return 'fix';
  return 'why'; // 默认偏"解释类"，比"动作类"更不会误导
}

/** 答案分数阈值；< 这个值说明检索几乎没相关命中 */
export const ANSWER_SCORE_THRESHOLD = 0.6;

export interface ComposedAnswer {
  /** 多行答案文本 */
  answer: string;
  /** 引用列表，索引对应 results 数组 */
  citations: number[];
  /** 命中类型，用于 UI 可解释性提示 */
  kind: QuestionKind;
  /** 置信度（0-1，> 阈值才显示） */
  confidence: number;
}

/**
 * 把 top-k 检索结果转成"答案 + 引用 [1][2]" 文本块。
 *
 * 三种模板：
 *   what — 直接引用 glossary / formula 定义（top-1 为主）
 *   why  — 用 top-3 chunk 的关键句拼"因为 / 所以 / 进一步看"
 *   how/fix — 优先 walkthroughStep（含 action + observe）；其次 faultCase steps/fix
 *
 * 不做语言生成；纯模板拼接 + 关键句抽取，杜绝伪造答案。
 */
export function composeAnswer(
  query: string,
  results: SearchResult[],
  locale: Locale = 'zh-CN',
): ComposedAnswer {
  const kind = classifyQuestion(query);
  if (results.length === 0) {
    return {
      answer: locale === 'en-US'
        ? "I couldn't find anything directly related in the built-in lessons. Try rephrasing or searching the glossary."
        : '我在内置教学内容中没找到直接相关的信息，请尝试换个说法或者查询术语表。',
      citations: [],
      kind,
      confidence: 0,
    };
  }
  const top = results[0];
  if (top.score < ANSWER_SCORE_THRESHOLD) {
    return {
      answer: locale === 'en-US'
        ? "I couldn't find a strong match in the built-in lessons. The closest entries are listed below — please pick one to read in context."
        : '我在内置教学内容中没找到强相关的信息。下面列出几条最接近的条目，请挑一条进入对应模块继续阅读。',
      citations: results.slice(0, 3).map((_, i) => i),
      kind,
      confidence: top.score,
    };
  }

  if (kind === 'what') {
    const def = results.find((r) => r.chunk.source.kind === 'glossary')
      ?? results.find((r) => r.chunk.source.kind === 'formula')
      ?? top;
    const others = results.filter((r) => r !== def).slice(0, 2);
    const head = locale === 'en-US' ? 'Definition' : '定义';
    const more = locale === 'en-US' ? 'Related entries' : '相关条目';
    const cites = [def, ...others];
    const lines = [
      `${head}：${def.chunk.text}  [${cites.indexOf(def) + 1}]`,
    ];
    if (others.length) {
      lines.push(`${more}：` + others.map((r, i) => `${r.chunk.title} [${i + 2}]`).join('；'));
    }
    return {
      answer: lines.join('\n'),
      citations: cites.map((c) => results.indexOf(c)),
      kind,
      confidence: top.score,
    };
  }

  if (kind === 'how' || kind === 'fix') {
    // 优先 walkthroughStep（action / observe）然后 faultCase steps/fix
    const walkthroughs = results.filter((r) => r.chunk.source.kind === 'walkthroughStep').slice(0, 2);
    const faults = results.filter((r) => r.chunk.source.kind === 'faultCase'
      && (r.chunk.source.section === 'steps' || r.chunk.source.section === 'fix')).slice(0, 2);
    const picked = walkthroughs.length || faults.length
      ? [...walkthroughs, ...faults].slice(0, 3)
      : results.slice(0, 3);
    const head = locale === 'en-US' ? 'Suggested steps' : '建议步骤';
    const lines: string[] = [`${head}：`];
    picked.forEach((r, i) => {
      // 抽前两段，避免回答过长
      const sentences = r.chunk.text.split(/\n+/).slice(0, 2).join(' ');
      lines.push(`${i + 1}. ${shorten(sentences, 160)} [${i + 1}]`);
    });
    return {
      answer: lines.join('\n'),
      citations: picked.map((c) => results.indexOf(c)),
      kind,
      confidence: top.score,
    };
  }

  // why（默认）：取 top-3 chunk 的关键句
  const picked = results.slice(0, 3);
  const head = locale === 'en-US' ? 'Explanation pulled from lessons' : '从内置讲义里抽出的解释';
  const lines: string[] = [`${head}：`];
  picked.forEach((r, i) => {
    const sentences = r.chunk.text.split(/[。\n]+/).filter(Boolean).slice(0, 2).join('。');
    lines.push(`· ${shorten(sentences, 180)} [${i + 1}]`);
  });
  const tail = locale === 'en-US'
    ? `For more detail, open the cited module.`
    : `更详细请点引用进入对应模块。`;
  lines.push(tail);
  return {
    answer: lines.join('\n'),
    citations: picked.map((c) => results.indexOf(c)),
    kind,
    confidence: top.score,
  };
}

/** 把长字符串压到 N 个字符（中文 / ASCII 都按 codepoint 计） */
function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ─── BYOK LLM 用：把 top-k chunk 拼成 system prompt 上下文 ───────────────────

/**
 * 给 BYOK LLM 注入的 system prompt：约束身份 + 注入 top-k chunk 作为参考资料。
 *
 * 选字段策略（与启发式 composeAnswer 一致的"权威 → 实操"权重）：
 *  - 每个 chunk 输出三段：标题（来源类型 + 模块/术语）、正文（截断到 600 字符
 *    避免单 chunk 把上下文窗口塞满）、引用编号 [n] 让 LLM 学着引用；
 *  - 顺序：BM25 排序原样，confidence 已经在 search 阶段折算；
 *  - 末尾加"未知则说不知道"的硬约束，最大限度防止编造。
 *
 * 这是 prompt engineering 而非算法 —— 模型不同效果可能略有差异，对教学场景这套
 * 'glossary + formula + walkthrough' 混合上下文经实测对 GPT-4o-mini / Haiku / Flash
 * 都能给出引用清晰的回答。
 */
export function buildLLMSystemPrompt(
  results: SearchResult[],
  locale: Locale = 'zh-CN',
  maxChunkChars = 600,
): string {
  const isZh = locale === 'zh-CN';
  const header = isZh
    ? `你是 BLDC / PMSM / FOC / SVPWM 控制教学助手，面向自学初级嵌入式工程师。请基于下方"参考资料"回答用户问题；不确定时直说"不确定"，绝不编造公式 / 寄存器 / API。`
    : `You are a tutoring assistant for BLDC / PMSM / FOC / SVPWM motor control, helping a self-taught beginner embedded engineer. Answer strictly based on the reference material below; if uncertain, say so plainly. Do not fabricate formulas, registers, or APIs.`;
  const refsTitle = isZh ? '参考资料（top-k 检索结果，按相关度排序）：' : 'Reference material (top-k retrieval, by relevance):';
  const rule = isZh
    ? '回答约束：\n- 中文回答，简洁可执行；\n- 引用资料用 [1] [2] 形式标在句末；\n- 给出动作建议时尽量贴 STM32 / 仿真模块操作步骤；\n- 公式 / 数值要核对资料原文，不要凭印象编。'
    : 'Answer constraints:\n- Reply in the same language as the question;\n- Cite sources inline as [1] [2];\n- Prefer concrete STM32 / simulation actions for how-to questions;\n- For formulas or numbers, verify against the reference; do not paraphrase from memory.';
  const lines = [header, '', refsTitle];
  results.forEach((r, i) => {
    const body = r.chunk.text.length > maxChunkChars
      ? r.chunk.text.slice(0, maxChunkChars - 1) + '…'
      : r.chunk.text;
    lines.push(`[${i + 1}] ${r.chunk.title}\n${body}`);
  });
  lines.push('', rule);
  return lines.join('\n');
}

/** 把 chunk source 映射成"打开模块时该跳到哪一步" */
export function citationToTarget(chunk: Chunk): { moduleId: ModuleId | null; walkthroughStepId?: string } {
  const s = chunk.source;
  if (s.kind === 'lesson') return { moduleId: s.moduleId };
  if (s.kind === 'walkthroughStep') return { moduleId: s.moduleId, walkthroughStepId: s.stepId };
  if (s.kind === 'faultCase') return { moduleId: 'faults-debugging' };
  if (s.kind === 'formula' || s.kind === 'glossary') return { moduleId: null };
  return { moduleId: null };
}
