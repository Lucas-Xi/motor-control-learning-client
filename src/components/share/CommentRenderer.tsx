import { useMemo } from 'react';
import { renderMiniMarkdown, type CommentEntry } from '../../utils/broadcastShare';
import { isValidParameterPath } from '../../utils/reviewModel';

/**
 * 评论 Markdown 渲染组件。
 *
 * V2 基础：renderMiniMarkdown 支持 **bold** / *italic* / `code` / 换行。
 * V3 扩展（在 V2 输出 HTML 字符串上再做后处理，仍然零依赖）：
 *   - 链接 [text](url)：仅放行 https:// / http:// / mailto:；其它协议（javascript:
 *     / data:）一律降级成纯文本，避免 XSS。
 *   - 参数引用 {{slice.field}}：高亮成 chip，可选 onParamClick 跳转到对应参数。
 *
 * 上层调用方式：
 *   <CommentRenderer entry={comment} canDelete onDelete={...} onParamClick={fn} />
 *
 * 当上层用 `colorAccent` 时，作者左侧细线 / 头像首字会用该色（多审阅者着色）。
 */

interface CommentRendererProps {
  entry: CommentEntry;
  index?: number;
  canDelete?: boolean;
  onDelete?: () => void;
  /** 多审阅者着色（默认 cyan accent） */
  colorAccent?: string;
  /** 嵌套深度（0 = 顶层，1+ = thread 子回复，用于左侧缩进 / 细线） */
  depth?: number;
  /** 点击 {{slice.field}} chip 的回调 */
  onParamClick?: (parameterPath: string) => void;
  /** 头部右侧额外操作（如 Apply suggestion 按钮） */
  headerExtra?: React.ReactNode;
  /** 评论 body 之后追加的内容（如 suggestion 卡片） */
  footer?: React.ReactNode;
}

/** 在 mini-markdown 输出后做"链接 + {{ref}}"二次解析（已 escape，只做受控替换） */
function postProcessRichSubset(html: string, paramClickHandlerId?: string): string {
  let out = html;
  // 1) [text](url)：因为 mini-markdown 已 escape，原文 [ → &#91; / ( → 原样 …
  //    实际上 [ ] ( ) 没在 escape 列表里 → 原样保留，可以直接 regex 匹配。
  //    限制：text 不含 ] / 换行；url 不含空格 / 引号 / )；并校验协议。
  out = out.replace(
    /\[([^\]\n]{1,80})\]\(([^\s)"']{1,200})\)/g,
    (whole, text: string, url: string) => {
      // 协议白名单
      const safe = /^(https?:\/\/|mailto:)/i.test(url);
      if (!safe) return whole;
      // url 内不允许出现 < > " ' 这些已 escape 过的实体序列
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-accent-primary underline-offset-2 hover:underline">${text}</a>`;
    },
  );
  // 2) {{slice.field}} 参数引用 chip
  out = out.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, p: string) => {
    if (!isValidParameterPath(p)) return _;
    const handler = paramClickHandlerId
      ? ` data-param-ref="${p}" tabindex="0" role="button" aria-label="跳转到参数 ${p}"`
      : '';
    return `<code class="rounded bg-accent-primary/15 px-1.5 py-0.5 font-mono text-caption text-accent-primary"${handler}>${p}</code>`;
  });
  return out;
}

export function CommentRenderer({
  entry,
  index,
  canDelete,
  onDelete,
  colorAccent,
  depth = 0,
  onParamClick,
  headerExtra,
  footer,
}: CommentRendererProps) {
  const html = useMemo(() => {
    const mini = renderMiniMarkdown(entry.body);
    return postProcessRichSubset(mini, onParamClick ? 'on' : undefined);
  }, [entry.body, onParamClick]);

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

  const indentPx = Math.min(depth, 4) * 16;
  const accent = colorAccent || 'rgb(var(--accent-primary))';

  // 事件代理：点击带 data-param-ref 的 chip
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onParamClick) return;
    const target = e.target as HTMLElement;
    const ref = target?.dataset?.paramRef;
    if (ref) {
      e.preventDefault();
      onParamClick(ref);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onParamClick) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as HTMLElement;
    const ref = target?.dataset?.paramRef;
    if (ref) {
      e.preventDefault();
      onParamClick(ref);
    }
  };

  return (
    <article
      className="rounded-lg border bg-bg-base p-2.5"
      style={{ marginLeft: indentPx, borderColor: 'rgb(var(--line-subtle))', borderLeftColor: accent, borderLeftWidth: depth > 0 ? '2px' : '1px' }}
      aria-label={index !== undefined ? `第 ${index + 1} 条评论` : '评论'}
    >
      <header className="mb-1 flex items-center justify-between gap-2 text-caption text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-bg-base"
            style={{ backgroundColor: accent }}
          >
            {(entry.author || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="font-mono" style={{ color: accent }}>
            @{entry.author || 'anonymous'}
          </span>
          {displayTs && (
            <time className="ml-1" dateTime={entry.ts}>
              {displayTs}
            </time>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {headerExtra}
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
        </span>
      </header>
      <div
        className="prose-comment text-body text-ink-primary"
        onClick={handleClick}
        onKeyDown={handleKey}
        // 内容已 escape + 仅生成白名单标签（strong/em/code/br/a），可安全注入
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {footer}
    </article>
  );
}
