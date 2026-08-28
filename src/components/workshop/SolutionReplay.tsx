import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, History, Trash2 } from 'lucide-react';
import { useReplayStore, type ReplayStep, listChallengesWithReplay } from '../../store/replayStore';
import { assemblyChallenges } from '../../content/assemblyChallenges';
import { compressorBundles } from '../../content/compressorLibrary';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
} from '../../content/assemblyLibraries';
import type { AssemblySnapshot } from '../../store/assemblyProgressStore';
import { useI18n, type TKey } from '../../i18n/useI18n';

/**
 * 解题路径回放（Phase C · 任务 1）。
 *
 * 用 useReplayStore.replays[challengeId] 的 step 数组（slot 选型 + 4 KPI + verdict）
 * 自动 5s/step 播放。每一步高亮当时的 verdict，并展示 6 slot snapshot。
 *
 * 与 AssemblyWorkshop 内部的 SolutionPathPanel 区别：
 *  - 那个是"会话级"内存（切走丢失），只是文字 timeline
 *  - 这个是 persist → localStorage，**跨刷新还能回放**；并支持自动 5s 步进
 *
 * 控制：播放 / 暂停 / 上一步 / 下一步 / 重置；键盘 Space=播放暂停、←→ 单步。
 */

const STEP_MS = 5000;

function slotLabel(key: keyof AssemblySnapshot['slotIds'], id: string): string {
  if (key === 'compressorBundleId') {
    const b = compressorBundles.find((x) => x.id === id);
    return b ? `${b.compressor.brand} ${b.compressor.partNo}` : id;
  }
  if (key === 'inverterPartNo') {
    const i = inverterPlatforms.find((x) => x.ipmPartNo === id);
    return i ? `${i.ipmBrand} ${i.ipmPartNo}` : id;
  }
  if (key === 'strategyId') return controlStrategies.find((x) => x.id === id)?.name ?? id;
  if (key === 'loadId') return loadConditions.find((x) => x.id === id)?.name ?? id;
  if (key === 'pfcId') return pfcPlatforms.find((x) => x.id === id)?.name ?? id;
  if (key === 'separatorId') return liquidSeparators.find((x) => x.id === id)?.name ?? id;
  return id;
}

const SLOT_KEYS: Array<{ key: keyof AssemblySnapshot['slotIds']; label: TKey }> = [
  { key: 'compressorBundleId', label: 'assemblyWorkshop.slotCompressor' },
  { key: 'inverterPartNo', label: 'assemblyWorkshop.slotInverter' },
  { key: 'strategyId', label: 'assemblyWorkshop.slotStrategy' },
  { key: 'loadId', label: 'assemblyWorkshop.slotLoad' },
  { key: 'pfcId', label: 'assemblyWorkshop.slotPfc' },
  { key: 'separatorId', label: 'assemblyWorkshop.slotSeparator' },
];

function verdictTone(v: ReplayStep['verdict']): { labelKey: TKey; cls: string } {
  if (v === 'pass') return { labelKey: 'assemblyWorkshop.verdictPass', cls: 'text-accent-measure border-accent-measure/60 bg-accent-measure/10' };
  if (v === 'pass-warn') return { labelKey: 'assemblyWorkshop.verdictPassWarnShort', cls: 'text-accent-warn border-accent-warn/60 bg-accent-warn/10' };
  return { labelKey: 'assemblyWorkshop.verdictFailAlt', cls: 'text-accent-fault border-accent-fault/60 bg-accent-fault/10' };
}

export function SolutionReplay() {
  const { t } = useI18n();
  const replays = useReplayStore((s) => s.replays);
  const clearChallenge = useReplayStore((s) => s.clearChallenge);

  const availableIds = useMemo(() => listChallengesWithReplay(replays), [replays]);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('');
  // 第一次有可用 replay 时自动选最新一个
  useEffect(() => {
    if (availableIds.length > 0 && !availableIds.includes(selectedChallenge)) {
      setSelectedChallenge(availableIds[0]);
    }
  }, [availableIds, selectedChallenge]);

  const steps = useMemo(
    () => (selectedChallenge ? replays[selectedChallenge]?.steps ?? [] : []),
    [replays, selectedChallenge],
  );

  // 播放状态
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // 切换 challenge 时回到 step 0、停止
  useEffect(() => {
    setCursor(0);
    setPlaying(false);
  }, [selectedChallenge]);

  // 自动播放定时器
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (steps.length <= 1) {
      setPlaying(false);
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setCursor((c) => {
        if (c + 1 >= steps.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, STEP_MS);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing, steps.length]);

  // 键盘控制：仅在面板内 focus 时生效（避免和全局快捷键冲突）
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement)) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowLeft') { setCursor((c) => Math.max(0, c - 1)); setPlaying(false); }
      else if (e.key === 'ArrowRight') { setCursor((c) => Math.min(steps.length - 1, c + 1)); setPlaying(false); }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [steps.length]);

  if (availableIds.length === 0) {
    return (
      <div className="rounded-2xl border border-line-subtle bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
          <History className="h-3.5 w-3.5 text-accent-primary" />
          <span>{t('assemblyWorkshop.replayTitle')}</span>
        </div>
        <p className="mt-2 text-caption text-ink-muted">
          {t('assemblyWorkshop.replayEmptyHint')}
        </p>
      </div>
    );
  }

  const cur = steps[cursor];
  const challengeMeta = assemblyChallenges.find((c) => c.id === selectedChallenge);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label={t('assemblyWorkshop.replayRegionAria')}
      className="rounded-2xl border border-line-subtle bg-bg-surface p-4 focus:outline-none focus:ring-2 focus:ring-accent-primary"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
          <History className="h-3.5 w-3.5 text-accent-primary" />
          <span>{t('assemblyWorkshop.replayTitleCount').replace('{n}', String(STEP_MS / 1000))}</span>
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-caption">
          <span className="text-ink-muted">{t('assemblyWorkshop.challengeLabel')}</span>
          <select
            value={selectedChallenge}
            onChange={(e) => setSelectedChallenge(e.target.value)}
            aria-label={t('assemblyWorkshop.replaySelectAria')}
            className="rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
          >
            {availableIds.map((id) => {
              const meta = assemblyChallenges.find((c) => c.id === id);
              const n = replays[id]?.steps.length ?? 0;
              return (
                <option key={id} value={id}>
                  {(meta?.title ?? id).slice(0, 16)} · {t('assemblyWorkshop.replayStepOption').replace('{n}', String(n))}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {challengeMeta && (
        <p className="mb-2 text-caption text-ink-muted">
          <span className="font-medium text-ink-secondary">{challengeMeta.title}</span> —— {challengeMeta.goal}
        </p>
      )}

      {/* 控制条 */}
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setCursor(0); setPlaying(false); }}
          aria-label={t('assemblyWorkshop.replayFirstStepAria')}
          className="rounded-md border border-line-subtle bg-bg-base p-1.5 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? t('assemblyWorkshop.replayPauseAria') : t('assemblyWorkshop.replayPlayAria')}
          aria-pressed={playing}
          className={`rounded-md border px-3 py-1.5 text-body font-medium transition-colors ${
            playing
              ? 'border-accent-warn/60 bg-accent-warn/15 text-accent-warn hover:bg-accent-warn/25'
              : 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25'
          }`}
          disabled={steps.length <= 1}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span className="ml-1 inline-block">{playing ? t('assemblyWorkshop.replayPause') : t('assemblyWorkshop.replayPlay')}</span>
        </button>
        <button
          type="button"
          onClick={() => { setCursor((c) => Math.min(steps.length - 1, c + 1)); setPlaying(false); }}
          aria-label={t('assemblyWorkshop.replayNextAria')}
          disabled={cursor + 1 >= steps.length}
          className="rounded-md border border-line-subtle bg-bg-base p-1.5 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary disabled:opacity-40"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>
        <span className="ml-2 text-caption text-ink-muted">
          {t('assemblyWorkshop.replayStepOf').replace('{n}', String(cursor + 1)).replace('{m}', String(steps.length))}
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('assemblyWorkshop.replayClearConfirm').replace('{title}', challengeMeta?.title ?? selectedChallenge))) {
              clearChallenge(selectedChallenge);
            }
          }}
          aria-label={t('assemblyWorkshop.replayClearAria')}
          className="ml-auto flex items-center gap-1 rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-caption text-ink-muted transition-colors hover:border-accent-fault/50 hover:text-accent-fault"
        >
          <Trash2 className="h-3 w-3" />
          {t('assemblyWorkshop.replayClear')}
        </button>
      </div>

      {/* 进度时间条 —— 每一步一个 chip + verdict 颜色 */}
      <ol className="mb-3 flex flex-wrap gap-1" aria-label={t('assemblyWorkshop.replayNavAria')}>
        {steps.map((s, i) => {
          const tone = verdictTone(s.verdict);
          const isActive = i === cursor;
          return (
            <li key={s.attemptIndex}>
              <button
                type="button"
                onClick={() => { setCursor(i); setPlaying(false); }}
                aria-label={t('assemblyWorkshop.replayJumpAria').replace('{n}', String(i + 1)).replace('{verdict}', t(tone.labelKey))}
                aria-current={isActive ? 'step' : undefined}
                className={`rounded border px-2 py-0.5 text-caption font-mono transition-colors ${
                  isActive ? `${tone.cls} ring-2 ring-accent-primary` : `${tone.cls} opacity-60 hover:opacity-100`
                }`}
              >
                #{i + 1}
              </button>
            </li>
          );
        })}
      </ol>

      {/* 当前步详情 */}
      {cur && (
        <div className={`rounded-xl border p-3 ${verdictTone(cur.verdict).cls}`}>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-body font-medium">{t('assemblyWorkshop.replayAttemptLine').replace('{n}', String(cur.attemptIndex)).replace('{verdict}', t(verdictTone(cur.verdict).labelKey))}</span>
            <span className="text-caption opacity-80">{cur.summary}</span>
          </div>
          {/* 6 slot 网格 */}
          <div className="mb-2 grid grid-cols-2 gap-1.5 text-caption sm:grid-cols-3">
            {SLOT_KEYS.map((sk) => (
              <div key={sk.key} className="rounded border border-line-subtle bg-bg-surface/60 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wider text-ink-muted">{t(sk.label)}</div>
                <div className="truncate font-mono text-ink-primary" title={slotLabel(sk.key, cur.slotIds[sk.key])}>
                  {slotLabel(sk.key, cur.slotIds[sk.key])}
                </div>
              </div>
            ))}
          </div>
          {/* 4 KPI */}
          <div className="grid grid-cols-2 gap-1.5 text-caption sm:grid-cols-4">
            <Kpi label="COP" value={cur.cop.toFixed(2)} />
            <Kpi label="Iq (A)" value={cur.requiredIqA.toFixed(2)} />
            <Kpi label={t('assemblyWorkshop.replayPdLabel')} value={cur.pressureRatio.toFixed(2)} />
            <Kpi label="Td (°C)" value={cur.Tdischarge.toFixed(1)} />
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] text-ink-muted">
        {t('assemblyWorkshop.replayShortcutHint')}
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line-subtle bg-bg-surface/60 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="font-mono text-body text-ink-primary">{value}</div>
    </div>
  );
}
