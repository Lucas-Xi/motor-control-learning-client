import { useRef } from 'react';
import { X, BookOpen, ShieldCheck, Github, FileText, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFocusTrap } from '../../utils/useFocusTrap';

const APP_VERSION = '0.1.0';

const STATS_DEFAULT = [
  { key: 'modules', value: 17, labelZh: '核心教学模块', labelEn: 'Core teaching modules' },
  { key: 'walkthroughs', value: 17, labelZh: '深度引导课程', labelEn: 'In-depth walkthroughs' },
  { key: 'challenges', value: 10, labelZh: '动手挑战题', labelEn: 'Hands-on challenges' },
  { key: 'curriculum', value: 4, labelZh: '课程主线', labelEn: 'Curriculum tracks' },
  { key: 'math', value: 22, labelZh: '算法纯函数', labelEn: 'Algorithm pure functions' },
  { key: 'tests', value: 570, labelZh: '单元测试', labelEn: 'Unit tests' },
];

const CREDITS = [
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Recharts', license: 'MIT', url: 'https://recharts.org' },
  { name: 'Framer Motion', license: 'MIT', url: 'https://www.framer.com/motion' },
  { name: 'Three.js + R3F', license: 'MIT', url: 'https://threejs.org' },
  { name: 'Lucide Icons', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'Electron', license: 'MIT', url: 'https://www.electronjs.org' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://tailwindcss.com' },
];

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';
  useFocusTrap(open, containerRef, { onEscape: onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-bg-base/70 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="scrollbar-thin max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-line-subtle bg-bg-surface p-5 shadow-xl"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">
              {isEn ? 'About' : '关于本应用'}
            </p>
            <h2 id="about-modal-title" className="mt-0.5 font-display text-display text-ink-primary">
              {isEn ? 'Compressor Drive Lab' : '压缩机变频器控制学习客户端'}
            </h2>
            <p className="mt-1 text-caption text-ink-muted">
              v{APP_VERSION} ·{' '}
              {isEn ? 'BLDC / PMSM / FOC interactive teaching client' : 'BLDC / PMSM / FOC 交互式学习客户端'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close' : '关闭'}
            className="rounded-md border border-line-subtle p-1.5 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <p className="mb-4 rounded-xl border border-accent-primary/30 bg-accent-primary/[0.06] p-3 text-body leading-relaxed text-ink-secondary">
          {isEn
            ? 'A self-paced, browser + desktop teaching tool for BLDC / PMSM / FOC / SVPWM, with focus on compressor inverter engineering. Pure-function algorithms portable to STM32; bilingual; 100% local-first; optional cloud collaboration via your own GitHub PAT.'
            : '面向自学初中级工程师的浏览器 + 桌面教学工具，方向是压缩机变频器。算法层全部纯函数可移植到 STM32；中英双语；默认 100% 本地处理；可选用你自己的 GitHub PAT 启用云协作。'}
        </p>

        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent-measure" />
            {isEn ? 'Stats' : '项目数据'}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STATS_DEFAULT.map((s) => (
              <div
                key={s.key}
                className="rounded-lg border border-line-subtle bg-bg-base p-2.5"
              >
                <p className="formula text-display text-accent-primary">{s.value}</p>
                <p className="text-caption text-ink-muted">{isEn ? s.labelEn : s.labelZh}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
            <BookOpen className="h-3.5 w-3.5 text-accent-primary" />
            {isEn ? 'Author' : '作者'}
          </h3>
          <p className="text-body text-ink-secondary">
            Vincent Xi —{' '}
            <a href="mailto:xzw0828@yeah.net" className="text-accent-primary hover:underline">
              xzw0828@yeah.net
            </a>
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            <Github className="mr-1 inline h-3.5 w-3.5" />
            <span className="font-mono">{'<OWNER>/<REPO>'}</span>{' '}
            <span className="text-ink-muted">
              ({isEn ? 'GitHub placeholder — fill in after publishing' : '占位，发布到 GitHub 后替换'})
            </span>
          </p>
        </section>

        <section className="mb-4 grid gap-2 sm:grid-cols-2">
          <a
            href="LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-line-subtle bg-bg-base p-3 text-body text-ink-secondary transition-colors hover:border-accent-primary/60 hover:text-ink-primary"
          >
            <FileText className="h-4 w-4 text-accent-primary" />
            <span>
              <span className="block font-medium text-ink-primary">
                {isEn ? 'License: Apache 2.0' : '开源许可：Apache 2.0'}
              </span>
              <span className="block text-caption text-ink-muted">
                {isEn ? 'Commercial use options in LICENSE-COMMERCIAL.md' : '商业使用见 LICENSE-COMMERCIAL.md'}
              </span>
            </span>
          </a>
          <a
            href="docs/PRIVACY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-line-subtle bg-bg-base p-3 text-body text-ink-secondary transition-colors hover:border-accent-measure/60 hover:text-ink-primary"
          >
            <ShieldCheck className="h-4 w-4 text-accent-measure" />
            <span>
              <span className="block font-medium text-ink-primary">
                {isEn ? 'Privacy Notice' : '隐私声明'}
              </span>
              <span className="block text-caption text-ink-muted">
                {isEn ? 'Bilingual; 100% local-first by default' : '中英双语；默认 100% 本地处理'}
              </span>
            </span>
          </a>
        </section>

        <section>
          <h3 className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
            {isEn ? 'Third-party Credits' : '第三方致谢'}
          </h3>
          <ul className="grid grid-cols-2 gap-1.5 text-caption text-ink-secondary sm:grid-cols-3">
            {CREDITS.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-2 rounded border border-line-subtle bg-bg-base px-2 py-1">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-ink-secondary hover:text-accent-primary"
                >
                  {c.name}
                </a>
                <span className="shrink-0 font-mono text-ink-muted">{c.license}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-4 border-t border-line-subtle pt-3 text-caption text-ink-muted">
          {isEn
            ? 'Press Esc or click outside to close.'
            : '按 Esc 或点击空白处关闭。'}
        </footer>
      </div>
    </div>
  );
}
