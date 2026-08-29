import { useCallback, useEffect, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { ModuleId } from '../../simulation/engine/types';
import { getVisualAssetForModule, pickAssetTitle } from '../../content/visualAssets';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  moduleId: ModuleId;
  title?: string;
  /** 紧凑模式：高度 ≈120px；默认 ≈160px。 */
  compact?: boolean;
}

/**
 * 模块封面图：消费 `visualAssets.ts` 清单的 gpt-image-2 产物。
 * - 当前模块在清单里无对应素材时返回 null（不影响布局）。
 * - 优先用 webp（约 90 KB），fallback 到 png（约 2 MB）。
 * - 点击 / Enter / Space 弹出大图 modal；Esc 或遮罩关闭。
 * - 高度 120-180px，object-cover，不破坏现有模块卡片布局。
 */
export function AssetHero({ moduleId, title, compact = false }: Props) {
  const { t, locale } = useI18n();
  const asset = getVisualAssetForModule(moduleId);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!asset) return null;

  const heightCls = compact ? 'h-[120px]' : 'h-[160px] md:h-[180px]';
  const caption = title ?? pickAssetTitle(asset, locale);

  return (
    <>
      <figure
        className={`group relative overflow-hidden rounded-2xl border border-line-subtle bg-bg-base ${heightCls}`}
      >
        <button
          type="button"
          aria-label={t('shell.heroViewLargeAria').replace('{title}', caption)}
          onClick={() => setOpen(true)}
          className="absolute inset-0 z-10 flex h-full w-full cursor-zoom-in items-end justify-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <span className="sr-only">{t('shell.heroExpandHint').replace('{title}', caption)}</span>
        </button>
        <picture>
          {asset.optimizedFilename && <source srcSet={asset.optimizedFilename} type="image/webp" />}
          <img
            src={asset.filename}
            alt={pickAssetTitle(asset, locale)}
            className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        </picture>
        {/* 右上角放大提示 */}
        <span
          aria-hidden
          className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md border border-line-subtle bg-bg-base/80 px-1.5 py-0.5 text-caption text-ink-secondary backdrop-blur-sm"
        >
          <Maximize2 className="h-3 w-3" />
          {t('shell.heroZoomBadge')}
        </span>
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg-base/95 via-bg-base/60 to-transparent px-3 py-2 text-caption text-ink-primary">
          {caption}
        </figcaption>
      </figure>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('shell.heroDialogAria').replace('{title}', caption)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label={t('shell.heroCloseAria')}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-subtle bg-bg-surface text-ink-primary hover:border-accent-primary hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <X className="h-4 w-4" />
          </button>
          <picture onClick={(e) => e.stopPropagation()}>
            {asset.optimizedFilename && <source srcSet={asset.optimizedFilename} type="image/webp" />}
            <img
              src={asset.filename}
              alt={pickAssetTitle(asset, locale)}
              className="max-h-[88vh] max-w-[92vw] rounded-2xl border border-line-subtle object-contain shadow-2xl"
            />
          </picture>
        </div>
      )}
    </>
  );
}
