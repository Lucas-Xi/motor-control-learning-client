import { useMemo, useState } from 'react';
import { Award, CheckCircle2, ChevronRight, Circle, Download, RotateCcw, Target } from 'lucide-react';
import {
  checkpointKey,
  curriculumTracks,
  type CurriculumCheckpoint,
  type CurriculumTrack,
} from '../../content/curriculum';
import {
  useCurriculumStore,
} from '../../store/curriculumStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { moduleMetas } from '../../simulation/engine/presets';
import { Button } from '../ui/Button';
import { useI18n } from '../../i18n/useI18n';
import { downloadText, timestamp } from '../../utils/download';

/**
 * 课程主线主面板。
 *
 * 渲染策略：
 *  - 顶部 4 张卡片并排展示 4 条主线，含进度环 + tagline + "下一步去 X 模块"按钮。
 *  - 点击卡片：折叠到该路径详情区，列出所有 checkpoint，可勾选 / 跳转 / 自动套预设。
 *  - 顶栏 "导出学习证书" 按钮：把当前激活路径生成一张 800×500 的 SVG 证书并触发下载。
 *
 * 不修改 useSimulationStore 的 schema；只调它已有的 setActiveModule / applyExperimentPreset。
 */

/**
 * Tailwind JIT 不会解析模板字符串拼接的类名，必须把完整 class 字面量列出来。
 * 这里按 tone 列出 card / chip / icon 三组完整 class。
 */
interface ToneStyle {
  cardActive: string;
  rowDone: string;
  checkDoneText: string;
}
const TONE_STYLES: Record<CurriculumTrack['tone'], ToneStyle> = {
  'foc-fundamentals': {
    cardActive: 'border-accent-primary/60 bg-accent-primary/10',
    rowDone: 'border-accent-primary/40 bg-accent-primary/5',
    checkDoneText: 'text-accent-primary',
  },
  'compressor-product': {
    cardActive: 'border-accent-measure/60 bg-accent-measure/10',
    rowDone: 'border-accent-measure/40 bg-accent-measure/5',
    checkDoneText: 'text-accent-measure',
  },
  debugging: {
    cardActive: 'border-accent-fault/60 bg-accent-fault/10',
    rowDone: 'border-accent-fault/40 bg-accent-fault/5',
    checkDoneText: 'text-accent-fault',
  },
  'power-electronics': {
    cardActive: 'border-accent-warn/60 bg-accent-warn/10',
    rowDone: 'border-accent-warn/40 bg-accent-warn/5',
    checkDoneText: 'text-accent-warn',
  },
};

/** Tailwind 颜色字面（与 tailwind.config.js 一致），用于 SVG 内联 stroke / fill */
const TONE_HEX: Record<CurriculumTrack['tone'], string> = {
  'foc-fundamentals': '#34d6ff',
  'compressor-product': '#43f7b5',
  debugging: '#ff5c7a',
  'power-electronics': '#ffb84d',
};

/** 用 SVG 圆环表达进度比例（无外部依赖） */
function ProgressRing({ ratio, tone }: { ratio: number; tone: CurriculumTrack['tone'] }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, ratio)));
  const accent = TONE_HEX[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#1e2a3d"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={accent}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="#e7f3ff"
        fontFamily="ui-sans-serif, system-ui"
      >
        {Math.round(ratio * 100)}%
      </text>
    </svg>
  );
}

function moduleTitle(id: string): string {
  return moduleMetas.find((m) => m.id === id)?.shortTitle ?? id;
}

/**
 * 把当前路径进度生成 800×500 SVG 学习证书。
 * 没有外部依赖；纯字符串拼接 → downloadText 触发下载。
 */
function buildCertificateSvg(
  track: CurriculumTrack,
  completedKeys: Set<string>,
  ratio: number,
): string {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const completedCps = track.checkpoints.filter((c) =>
    completedKeys.has(checkpointKey(track.id, c.id)),
  );
  const lineHeight = 22;
  const startY = 220;
  const maxLines = 10;
  const lines = completedCps.slice(0, maxLines).map((cp, i) => {
    const y = startY + i * lineHeight;
    const xml = `<text x="80" y="${y}" font-size="14" fill="#cbd5e1" font-family="ui-monospace, monospace">${escapeXml('✓ ' + cp.title + ' — ' + moduleTitle(cp.moduleId))}</text>`;
    return xml;
  }).join('\n');
  const more = completedCps.length > maxLines
    ? `<text x="80" y="${startY + maxLines * lineHeight}" font-size="13" fill="#94a3b8" font-family="ui-monospace, monospace">… 还有 ${completedCps.length - maxLines} 个 checkpoint</text>`
    : '';
  const totalCp = track.checkpoints.length;
  const accent = TONE_HEX[track.tone] ?? '#34d6ff';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#101a2d"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  <rect x="20" y="20" width="760" height="460" fill="none" stroke="${accent}" stroke-width="2" rx="14"/>
  <text x="80" y="80" font-size="14" font-family="ui-monospace, monospace" fill="#94a3b8" letter-spacing="4">COMPRESSOR DRIVE LAB · 学习证书</text>
  <text x="80" y="130" font-size="32" font-weight="700" font-family="ui-sans-serif, system-ui" fill="#f8fafc">${escapeXml(track.title)}</text>
  <text x="80" y="162" font-size="15" font-family="ui-sans-serif, system-ui" fill="${accent}">${escapeXml(track.tagline)}</text>
  <text x="80" y="195" font-size="14" font-family="ui-sans-serif, system-ui" fill="#cbd5e1">完成度 ${Math.round(ratio * 100)}% （${completedCps.length} / ${totalCp}）  ·  颁发日期 ${dateStr}</text>
  ${lines}
  ${more}
  <text x="80" y="450" font-size="13" font-family="ui-sans-serif, system-ui" fill="#94a3b8">学员：compressor-bench 学员</text>
  <text x="720" y="450" font-size="13" font-family="ui-sans-serif, system-ui" fill="#94a3b8" text-anchor="end">本证书离线本地生成</text>
</svg>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface TrackCardProps {
  track: CurriculumTrack;
  active: boolean;
  onSelect: () => void;
}

function TrackCard({ track, active, onSelect }: TrackCardProps) {
  const { t } = useI18n();
  // 切片选择器：只订阅本路径的进度对象引用，避免任意路径变更全卡片重渲
  const pathProgress = useCurriculumStore((s) => s.paths[track.id]);
  const ratio = useMemo(() => {
    if (!pathProgress) return 0;
    const done = new Set(pathProgress.completedCheckpoints);
    let c = 0;
    for (const cp of track.checkpoints) {
      if (done.has(checkpointKey(track.id, cp.id))) c += 1;
    }
    return c / track.checkpoints.length;
  }, [pathProgress, track]);

  const nextCp = useMemo(() => {
    const done = new Set(pathProgress?.completedCheckpoints ?? []);
    return track.checkpoints.find((cp) => !done.has(checkpointKey(track.id, cp.id))) ?? null;
  }, [pathProgress, track]);

  const tone = TONE_STYLES[track.tone];

  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      aria-label={t('curriculum.trackCardAria')
        .replace('{title}', track.title)
        .replace('{n}', String(Math.round(ratio * 100)))}
      className={`group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-colors ${
        active
          ? tone.cardActive
          : 'border-line-subtle bg-bg-raised hover:border-line-strong'
      }`}
    >
      <div className="flex items-start gap-3">
        <ProgressRing ratio={ratio} tone={track.tone} />
        <div className="min-w-0 flex-1">
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">{track.durationHint}</p>
          <h3 className="mt-0.5 truncate font-display text-body text-ink-primary">{track.title}</h3>
          <p className="mt-1 line-clamp-2 text-caption text-ink-secondary">{track.tagline}</p>
        </div>
      </div>
      <div className="rounded-lg border border-line-subtle bg-bg-surface px-3 py-2">
        {nextCp ? (
          <div className="flex items-center gap-2 text-caption">
            <Target className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
            <span className="text-ink-muted">{t('curriculum.nextStep')}</span>
            <span className={`truncate text-ink-primary`}>{nextCp.title}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-ink-muted" aria-hidden />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-caption text-accent-measure">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            <span>{t('curriculum.pathDone')}</span>
          </div>
        )}
      </div>
    </button>
  );
}

interface CheckpointRowProps {
  track: CurriculumTrack;
  checkpoint: CurriculumCheckpoint;
  index: number;
  done: boolean;
  onGo: (cp: CurriculumCheckpoint) => void;
  onToggle: (cp: CurriculumCheckpoint) => void;
}

function CheckpointRow({ track, checkpoint, index, done, onGo, onToggle }: CheckpointRowProps) {
  const { t } = useI18n();
  const tone = TONE_STYLES[track.tone];
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-start ${
        done ? tone.rowDone : 'border-line-subtle bg-bg-raised'
      }`}
    >
      <button
        onClick={() => onToggle(checkpoint)}
        aria-label={(done ? t('curriculum.unmarkAria') : t('curriculum.markDoneAria')).replace('{title}', checkpoint.title)}
        aria-pressed={done}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-subtle text-ink-muted transition-colors hover:border-line-strong hover:text-ink-primary"
      >
        {done ? (
          <CheckCircle2 className={`h-5 w-5 ${tone.checkDoneText}`} aria-hidden />
        ) : (
          <Circle className="h-5 w-5" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-caption text-ink-muted">CP{String(index + 1).padStart(2, '0')}</span>
          <h4 className="text-body font-medium text-ink-primary">{checkpoint.title}</h4>
          <span className="text-caption text-ink-muted">→ {moduleTitle(checkpoint.moduleId)}</span>
        </div>
        <p className="mt-1 text-caption text-ink-secondary">{checkpoint.goal}</p>
        <ul className="mt-2 space-y-1">
          {checkpoint.requirements.map((req, i) => (
            <li key={i} className="text-caption text-ink-muted">· {req.label}</li>
          ))}
          {checkpoint.optionalWalkthroughStepRange && (
            <li className="text-caption text-ink-muted">
              · {t('curriculum.walkthroughRange')
                .replace('{a}', String(checkpoint.optionalWalkthroughStepRange[0]))
                .replace('{b}', String(checkpoint.optionalWalkthroughStepRange[1]))}
            </li>
          )}
          {checkpoint.optionalChallengeIds?.map((id) => (
            <li key={id} className="text-caption text-ink-muted">· {t('curriculum.optionalChallenge')} <code className="font-mono">{id}</code></li>
          ))}
        </ul>
      </div>
      <Button
        variant={done ? 'ghost' : 'primary'}
        onClick={() => onGo(checkpoint)}
        aria-label={t('curriculum.goAria').replace('{title}', moduleTitle(checkpoint.moduleId))}
        className="shrink-0 self-start"
      >
        {t('curriculum.goShort')}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </li>
  );
}

interface CurriculumPanelProps {
  /** 用户点击 checkpoint "前往" 时调；用于把 SimulationPanel 切回模块视图 */
  onLeaveCurriculum?: () => void;
}

export function CurriculumPanel({ onLeaveCurriculum }: CurriculumPanelProps) {
  const { t, locale } = useI18n();
  // 默认选中上次激活的路径，否则选第一条
  const lastActive = useCurriculumStore((s) => s.lastActiveTrack);
  const [activeId, setActiveId] = useState<string>(lastActive ?? curriculumTracks[0].id);

  const markDone = useCurriculumStore((s) => s.markCheckpointDone);
  const unmark = useCurriculumStore((s) => s.unmarkCheckpoint);
  const resetPath = useCurriculumStore((s) => s.resetPath);
  const touchPath = useCurriculumStore((s) => s.touchPath);

  const setActiveModule = useSimulationStore((s) => s.setActiveModule);
  const applyPreset = useSimulationStore((s) => s.applyExperimentPreset);
  const setMode = useSimulationStore((s) => s.setMode);
  const expandedPanels = useUIStore((s) => s.expandedPanels);
  const togglePanel = useUIStore((s) => s.togglePanel);

  const activeTrack = curriculumTracks.find((t) => t.id === activeId) ?? curriculumTracks[0];
  // 订阅当前 active path 的进度切片
  const activePathProgress = useCurriculumStore((s) => s.paths[activeTrack.id]);
  const doneSet = useMemo(
    () => new Set(activePathProgress?.completedCheckpoints ?? []),
    [activePathProgress],
  );
  const ratio = useMemo(() => {
    if (activeTrack.checkpoints.length === 0) return 0;
    let c = 0;
    for (const cp of activeTrack.checkpoints) {
      if (doneSet.has(checkpointKey(activeTrack.id, cp.id))) c += 1;
    }
    return c / activeTrack.checkpoints.length;
  }, [activeTrack, doneSet]);

  const handleSelectTrack = (trackId: string) => {
    setActiveId(trackId);
    touchPath(trackId);
  };

  const handleGo = (cp: CurriculumCheckpoint) => {
    setActiveModule(cp.moduleId);
    if (cp.presetId) applyPreset(cp.presetId);
    // 跳模块时切回 teach 模式让 GuidedExperimentBar 自动展开
    setMode('teach');
    // 若用户折叠了实验面板，自动展开
    if (!expandedPanels.experiments) togglePanel('experiments');
    onLeaveCurriculum?.();
  };

  const handleToggle = (cp: CurriculumCheckpoint) => {
    const key = checkpointKey(activeTrack.id, cp.id);
    if (doneSet.has(key)) {
      unmark(activeTrack.id, cp.id);
    } else {
      markDone(activeTrack.id, cp.id);
    }
  };

  const handleExportCert = () => {
    const svg = buildCertificateSvg(activeTrack, doneSet, ratio);
    const filename = `compressor-bench-curriculum-${activeTrack.id}-${timestamp()}.svg`;
    downloadText(filename, svg, 'image/svg+xml;charset=utf-8');
  };

  const handleResetPath = () => {
    if (window.confirm(t('curriculum.resetConfirm').replace('{title}', activeTrack.title))) {
      resetPath(activeTrack.id);
    }
  };

  const nextCp = useMemo(() => {
    return activeTrack.checkpoints.find((cp) => !doneSet.has(checkpointKey(activeTrack.id, cp.id))) ?? null;
  }, [activeTrack, doneSet]);

  return (
    <section className="space-y-5" aria-label={t('curriculum.title')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">{t('curriculum.eyebrow')}</p>
          <h2 className="mt-1 font-display text-display text-ink-primary">{t('curriculum.title')}</h2>
          <p className="mt-1 max-w-2xl text-body text-ink-secondary">{t('curriculum.description')}</p>
          {locale === 'en-US' && (
            <p className="mt-1 text-[10px] text-ink-muted">{t('common.translationPending')}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={handleResetPath}
            aria-label={`${t('curriculum.resetProgress')} · ${activeTrack.title}`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('curriculum.resetProgress')}
          </Button>
          <Button
            variant="primary"
            onClick={handleExportCert}
            aria-label={`${t('curriculum.exportCertificate')} · ${activeTrack.title}`}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('curriculum.exportCertificate')}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {curriculumTracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            active={track.id === activeId}
            onSelect={() => handleSelectTrack(track.id)}
          />
        ))}
      </div>

      <article className="rounded-2xl border border-line-subtle bg-bg-raised p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-caption text-ink-muted">
              <Award className="h-3.5 w-3.5" aria-hidden />
              <span>{activeTrack.audience}</span>
            </div>
            <h3 className="mt-1 font-display text-body text-ink-primary">{activeTrack.title}</h3>
            <p className="mt-1 max-w-3xl text-caption text-ink-secondary">{activeTrack.description}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-caption text-ink-muted">{t('curriculum.completionLabel')}</p>
            <p className="font-display text-display text-ink-primary">{Math.round(ratio * 100)}%</p>
            <p className="text-caption text-ink-muted">
              {Math.round(ratio * activeTrack.checkpoints.length)} / {activeTrack.checkpoints.length} checkpoint
            </p>
          </div>
        </header>
        {nextCp && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-subtle bg-bg-surface px-3 py-2">
            <Target className="h-4 w-4 text-accent-primary" aria-hidden />
            <span className="text-caption text-ink-muted">{t('curriculum.nextStep')}</span>
            <span className="text-body text-ink-primary">{nextCp.title}</span>
            <Button variant="primary" className="ml-auto" onClick={() => handleGo(nextCp)}>
              {t('curriculum.goNow')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
        <ol className="space-y-2">
          {activeTrack.checkpoints.map((cp, i) => (
            <CheckpointRow
              key={cp.id}
              track={activeTrack}
              checkpoint={cp}
              index={i}
              done={doneSet.has(checkpointKey(activeTrack.id, cp.id))}
              onGo={handleGo}
              onToggle={handleToggle}
            />
          ))}
        </ol>
      </article>
    </section>
  );
}
