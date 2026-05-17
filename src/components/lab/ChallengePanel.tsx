import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Lightbulb, Play, RotateCcw, Target, Trophy } from 'lucide-react';
import {
  type ChallengeComparator,
  type ChallengeDefinition,
  type EvaluatorContext,
  checkComparator,
  formatTarget,
  getChallengesFor,
} from '../../content/challenges';
import { useChallengeStore, type ComparatorSemantic } from '../../store/challengeStore';
import { useSimulationStore } from '../../store/simulationStore';
import type { ModuleId } from '../../simulation/engine/types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatNumber } from '../../utils/format';

/**
 * 模块内嵌"实验挑战"面板（用 ParameterPanel customSlots="challenges" 装载）。
 *
 * 设计要点：
 *   - 只读 useSimulationStore 切片，不写 —— 玩家通过右侧 ParameterPanel 调参数
 *   - 评估器实时跑分（每帧 store time 更新或参数变化自动重算）；通关瞬间写 useChallengeStore
 *   - 单页一次只展示一道题（碎片式专注），头部用 "<a>/<b> 已通关" 徽章 + 切换按钮
 */

const SLICE_KEY_OF: Partial<Record<ModuleId, keyof SimulationStateProjection>> = {
  'pid-control': 'pid',
  'foc-flow': 'foc',
  'svpwm': 'svpwm',
  'sensorless-foc': 'sensorless',
  'field-weakening': 'weakField',
  'startup-statemachine': 'startup',
  'refrigeration-bench': 'refrigeration',
};

// 投影类型，避免直接耦合到 SimulationStore 全部字段
type SimulationStateProjection = {
  pid: unknown;
  foc: unknown;
  svpwm: unknown;
  sensorless: unknown;
  weakField: unknown;
  startup: unknown;
  refrigeration: unknown;
  motorBasics: Record<string, number>;
};

/** comparator → optimization semantic：< / <= → 越小越好；> / >= → 越大越好；between → 居中（按距 mid 距离） */
function comparatorSemantic(cmp: ChallengeComparator): ComparatorSemantic {
  return cmp === '<' || cmp === '<=' ? 'minimize' : 'maximize';
}

function difficultyTone(d: ChallengeDefinition['difficulty']) {
  switch (d) {
    case '入门':
      return { text: 'text-accent-measure', border: 'border-accent-measure/40', bg: 'bg-accent-measure/10' };
    case '进阶':
      return { text: 'text-accent-warn', border: 'border-accent-warn/40', bg: 'bg-accent-warn/10' };
    case '硬核':
      return { text: 'text-accent-fault', border: 'border-accent-fault/40', bg: 'bg-accent-fault/10' };
  }
}

interface Props {
  moduleId: ModuleId;
}

export function ChallengePanel({ moduleId }: Props) {
  const challenges = getChallengesFor(moduleId);
  const [activeIdx, setActiveIdx] = useState(0);
  const records = useChallengeStore((s) => s.records);
  const incAttempts = useChallengeStore((s) => s.incrementAttempts);
  const recordResult = useChallengeStore((s) => s.recordResult);
  const resetOne = useChallengeStore((s) => s.resetOne);

  // 用切片选择器 —— 严格按 CLAUDE.md 要求，避免抓整个 store
  const sliceKey = SLICE_KEY_OF[moduleId];
  const sliceData = useSimulationStore((s) => (sliceKey ? (s as unknown as Record<string, unknown>)[sliceKey] : null));
  const motorBasics = useSimulationStore((s) => s.motorBasics);

  const active = challenges[activeIdx];

  // —— 评估（每次 sliceData / motorBasics 变化重算）——
  const evaluation = useMemo(() => {
    if (!active || !sliceData) return null;
    const ctx: EvaluatorContext = {
      params: sliceData as Record<string, unknown>,
      motor: motorBasics as unknown as Record<string, number>,
    };
    try {
      return active.evaluator(ctx);
    } catch (err) {
      // 评估器异常不能搞崩整个面板
      console.warn('[ChallengePanel] evaluator failed', err);
      return { current: NaN, passed: false };
    }
  }, [active, sliceData, motorBasics]);

  // 通关瞬间落库（用 effect-like 但放在 useMemo 后的副作用语句里会有时序问题，
  // 这里走 useEffect 监听 passed 状态变化）
  const passed = evaluation?.passed ?? false;
  const currentValue = evaluation?.current ?? NaN;

  // 通关时（passed 从 false → true）写记录
  // 注意：参数变化让 passed 抖动 true/false/true 也会多次调用 recordResult，
  // store 内部对"已通过的题"只更新 bestValue + 不重置 firstPassedAt，所以幂等。
  useChallengePassEffect(active?.id, passed, currentValue, comparatorSemantic(active?.target.comparator ?? '<'), recordResult);

  if (challenges.length === 0 || !active) return null;

  const solvedCount = challenges.reduce((acc, c) => acc + (records[c.id]?.solved ? 1 : 0), 0);
  const totalCount = challenges.length;
  const rec = records[active.id];
  const tone = difficultyTone(active.difficulty);

  const onStartAttempt = useCallback(() => incAttempts(active.id), [active.id, incAttempts]);

  return (
    <Card
      title="实验挑战"
      eyebrow="lab challenges"
      density="compact"
      tone={passed ? 'measure' : 'default'}
      action={
        <div className="flex items-center gap-2 text-caption">
          <span className="flex items-center gap-1 rounded-md border border-line-subtle bg-bg-base px-2 py-0.5 text-ink-secondary">
            <Trophy className="h-3.5 w-3.5 text-accent-warn" aria-hidden="true" />
            {solvedCount}/{totalCount}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        {/* 标题 + 难度 chip + 上下题切换 */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-body font-medium text-ink-primary">{active.title}</p>
            <p className="mt-0.5 text-caption leading-relaxed text-ink-muted">{active.description}</p>
          </div>
          <span
            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-caption font-medium ${tone.border} ${tone.bg} ${tone.text}`}
          >
            {active.difficulty}
          </span>
        </div>

        {/* 题号切换器（多题时显示） */}
        {challenges.length > 1 && (
          <div className="flex flex-wrap gap-1 text-caption">
            {challenges.map((c, idx) => {
              const isActive = idx === activeIdx;
              const solved = !!records[c.id]?.solved;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-pressed={isActive}
                  className={`rounded border px-2 py-0.5 transition-colors ${
                    isActive
                      ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                      : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-primary'
                  }`}
                  title={c.title}
                >
                  <span className="font-mono">{idx + 1}</span>
                  {solved && <CheckCircle2 className="ml-1 inline h-3 w-3 text-accent-measure" aria-label="已通关" />}
                </button>
              );
            })}
          </div>
        )}

        {/* 目标 + 当前值 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
            <div className="flex items-center gap-1 text-caption text-ink-muted">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              目标
            </div>
            <p className="mt-1 font-mono text-body text-ink-primary">{formatTarget(active.target)}</p>
          </div>
          <div
            className={`rounded-lg border p-2 ${
              passed ? 'border-accent-measure/40 bg-accent-measure/10' : 'border-line-subtle bg-bg-base'
            }`}
          >
            <div className={`flex items-center gap-1 text-caption ${passed ? 'text-accent-measure' : 'text-ink-muted'}`}>
              {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {passed ? '已通过' : '当前值'}
            </div>
            <p className={`mt-1 font-mono text-body ${passed ? 'text-accent-measure' : 'text-ink-primary'}`}>
              {Number.isFinite(currentValue) ? formatNumber(currentValue, 2) : '—'}
              {active.target.unit && <span className="ml-1 text-caption text-ink-muted">{active.target.unit}</span>}
            </p>
          </div>
        </div>

        {/* 可调参数提示 */}
        <div className="rounded-lg border border-line-subtle bg-bg-base/40 p-2">
          <p className="text-caption text-ink-muted">
            可调参数：
            <span className="ml-1 font-mono text-ink-secondary">
              {active.editableParams.join(' · ')}
            </span>
          </p>
          <p className="mt-1 text-caption text-ink-muted">在右侧参数面板里调即可，本卡片实时跟踪结果。</p>
        </div>

        {/* 提示 / 解析（解析仅通关后展开） */}
        <div className="space-y-1.5 rounded-lg border border-accent-warn/30 bg-accent-warn/[0.05] p-2 text-caption leading-relaxed">
          <p className="flex items-start gap-1 text-accent-warn">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{active.hint}</span>
          </p>
          {passed && (
            <p className="text-ink-secondary">
              <strong className="text-accent-measure">原理：</strong>
              {active.solutionExplain}
            </p>
          )}
        </div>

        {/* 操作行 */}
        <div className="flex items-center justify-between gap-2 text-caption">
          <span className="text-ink-muted">
            尝试 {rec?.attempts ?? 0} 次{rec?.bestValue !== null && rec?.bestValue !== undefined ? ` · 最佳 ${formatNumber(rec.bestValue, 2)}${active.target.unit ? ' ' + active.target.unit : ''}` : ''}
          </span>
          <div className="flex gap-1.5">
            <Button variant="ghost" onClick={onStartAttempt} aria-label="标记一次尝试">
              <Play className="h-3.5 w-3.5" /> 开始尝试
            </Button>
            {rec?.solved && (
              <Button variant="ghost" onClick={() => resetOne(active.id)} aria-label="重置本题记录">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// —— effect helper：内置 useEffect 避免主组件再 import React.useEffect ——
import { useEffect } from 'react';
function useChallengePassEffect(
  challengeId: string | undefined,
  passed: boolean,
  currentValue: number,
  semantic: ComparatorSemantic,
  recordResult: ReturnType<typeof useChallengeStore.getState>['recordResult'],
) {
  useEffect(() => {
    if (!challengeId) return;
    if (passed) recordResult(challengeId, true, currentValue, semantic);
  }, [challengeId, passed, currentValue, semantic, recordResult]);
}
