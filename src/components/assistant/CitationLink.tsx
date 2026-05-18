import { ExternalLink } from 'lucide-react';
import type { AssistantCitation } from '../../store/assistantStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useProgressStore } from '../../store/progressStore';
import { loadModuleWalkthrough } from '../../content/walkthroughs';
import type { ModuleId } from '../../simulation/engine/types';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  /** 引用在当前 assistant message.citations 数组的序号（1-based 给 UI）*/
  index: number;
  citation: AssistantCitation;
}

/**
 * 单条引用条目：
 *  - 头部 [n] 序号 + 标题
 *  - 正文 preview（最多两行，超出省略）
 *  - 跳转按钮：若有 moduleId，点击后切换 activeModule；
 *    若有 walkthroughStepId，同时把 progressStore 的步号设到对应位置，并 lazy load walkthrough。
 *
 * 视觉：accent.measure（mint）调，区别于 user 消息的 accent.primary（cyan）；
 * 满足"颜色 + 形状 + sr-only" 三通道。
 */
export function CitationLink({ index, citation }: Props) {
  const setActiveModule = useSimulationStore((s) => s.setActiveModule);
  const setWalkthroughStep = useProgressStore((s) => s.setWalkthroughStep);
  const { t } = useI18n();
  const canJump = !!citation.moduleId;

  const onJump = async () => {
    if (!canJump) return;
    const mid = citation.moduleId as ModuleId;
    setActiveModule(mid);
    if (citation.walkthroughStepId) {
      // 异步加载 walkthrough，命中后找 stepId 对应 index 写进 progressStore
      try {
        const wt = await loadModuleWalkthrough(mid);
        if (wt) {
          const idx = wt.steps.findIndex((s) => s.id === citation.walkthroughStepId);
          if (idx >= 0) setWalkthroughStep(mid, idx, idx === wt.steps.length - 1);
        }
      } catch {
        /* walkthrough 加载失败不影响跳模块的主流程 */
      }
    }
  };

  return (
    <li className="rounded-lg border border-line-subtle bg-bg-base p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-caption text-ink-secondary">
          <span className="mr-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-accent-measure/15 px-1 font-mono text-[10px] font-medium text-accent-measure">
            {index}
          </span>
          <span className="text-ink-primary">{citation.title}</span>
        </p>
        {canJump && (
          <button
            type="button"
            onClick={() => { void onJump(); }}
            className="inline-flex items-center gap-1 rounded border border-accent-measure/40 px-1.5 py-0.5 text-[10px] font-medium text-accent-measure transition-colors hover:bg-accent-measure/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-measure"
            aria-label={`${t('assistant.jumpButton')}：${citation.title}`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {t('assistant.jumpButton')}
          </button>
        )}
      </div>
      {citation.preview && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">{citation.preview}</p>
      )}
    </li>
  );
}
