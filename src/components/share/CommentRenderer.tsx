import { useMemo } from 'react';
import { renderMiniMarkdown, type CommentEntry } from '../../utils/broadcastShare';

/**
 * 评论 Markdown 渲染组件。
 *
 * 用 broadcastShare 里的 renderMiniMarkdown（≤80 行迷你解析器）渲染：
 *   - **bold**  *italic*  `code`  换行
 *   - HTML 危险字符已转义；不引入 marked / remark
 *
 * 上层调用方式：
 *   <CommentRenderer entry={comment} canDelete onDelete={...} />
 */

interface CommentRendererProps {
  entry: CommentEntry;
  index?: number;
  canDelete?: boolean;
  onDelete?: () => void;
}

export function CommentRenderer({ entry, index, canDelete, onDelete }: CommentRendererProps) {
  const html = useMemo(() => renderMiniMarkdown(entry.body), [entry.body]);
  const displayTs = useMemo(() => {
    if (!entry.ts) return '';
    const d = new Date(entry.ts);
    if (Number.isNaN(d.getTime())) return entry.ts;
    return d.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [entry.ts]);

  return (
    <article
      className="rounded-lg border border-line-subtle bg-bg-base p-2.5"
      aria-label={index !== undefined ? `第 ${index + 1} 条评论` : '评论'}
    >
      <header className="mb-1 flex items-center justify-between gap-2 text-caption text-ink-muted">
        <span>
          <span className="font-mono text-accent-primary">@{entry.author || 'anonymous'}</span>
          {displayTs && <span className="ml-2">{displayTs}</span>}
        </span>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-line-subtle px-1.5 py-0.5 text-caption text-ink-muted hover:border-accent-fault hover:text-accent-fault"
            aria-label={`删除${index !== undefined ? `第 ${index + 1} 条` : ''}评论`}
          >
            删除
          </button>
        )}
      </header>
      <div
        className="prose-comment text-body text-ink-primary"
        // 内容已 escape + 仅生成白名单标签（strong/em/code/br），可安全注入
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
