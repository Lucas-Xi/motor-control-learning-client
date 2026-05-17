import { Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { getChallengesFor } from '../../content/challenges';
import { summarizeForModule, useChallengeStore } from '../../store/challengeStore';
import type { ModuleId } from '../../simulation/engine/types';

/**
 * 模块内嵌的小徽章：N/M 已通关。
 * 把它放在 ModuleLayout 的 primary 卡 action 槽，或挑战面板顶端。
 * 切片选择器只读 records，避免 every-frame 渲染。
 */
interface Props {
  moduleId: ModuleId;
  /** 额外样式：默认贴在 Card 头部 */
  className?: string;
}
export function ChallengeBadge({ moduleId, className = '' }: Props) {
  const records = useChallengeStore((s) => s.records);
  const challenges = getChallengesFor(moduleId);
  const ids = useMemo(() => challenges.map((c) => c.id), [challenges]);
  if (challenges.length === 0) return null;
  const { solved, total } = summarizeForModule(records, ids);
  const fullPass = solved === total;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption ${
        fullPass
          ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
          : 'border-line-subtle bg-bg-base text-ink-secondary'
      } ${className}`}
      title={`本模块共 ${total} 道实验挑战，已通关 ${solved}`}
    >
      <Trophy className="h-3 w-3 text-accent-warn" aria-hidden="true" />
      挑战 {solved}/{total}
    </span>
  );
}
