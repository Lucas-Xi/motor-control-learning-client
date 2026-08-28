import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = 'C', title }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 兜底：选择文本
      const range = document.createRange();
      const sel = window.getSelection();
      const pre = document.createElement('pre');
      pre.textContent = code;
      pre.style.position = 'absolute';
      pre.style.left = '-9999px';
      document.body.appendChild(pre);
      range.selectNode(pre);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('copy');
      document.body.removeChild(pre);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-line-subtle bg-bg-base">
      <div className="flex items-center justify-between border-b border-line-subtle bg-bg-surface px-3 py-1.5">
        <span className="text-caption font-mono text-ink-muted">{title ?? language}</span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-caption text-ink-muted transition-colors hover:bg-bg-raised hover:text-ink-primary"
        >
          {copied ? <Check className="h-3 w-3 text-accent-measure" /> : <Copy className="h-3 w-3" />}
          {copied ? t('shell.codeCopied') : t('shell.codeCopy')}
        </button>
      </div>
      <pre className="formula overflow-auto p-3 text-caption leading-relaxed text-accent-measure">{code}</pre>
    </div>
  );
}
