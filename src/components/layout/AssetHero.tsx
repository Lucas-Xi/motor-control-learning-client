import type { ModuleId } from '../../simulation/engine/types';
import { getVisualAssetForModule } from '../../content/visualAssets';

interface Props {
  moduleId: ModuleId;
  title?: string;
  compact?: boolean;
}

/**
 * 图像素材封面：用于希望主动展示 gpt-image-2 素材的模块（默认不再嵌入到模块页内）。
 * 现行重构后由 ConceptNotes 取代教学讲义入口；保留此组件供未来按需直接放置在某个 Card 内。
 */
export function AssetHero({ moduleId, title, compact = false }: Props) {
  const asset = getVisualAssetForModule(moduleId);
  if (!asset) return null;
  return (
    <figure className={`relative overflow-hidden rounded-2xl border border-line-subtle bg-bg-base ${compact ? 'h-40' : 'h-56'}`}>
      <picture>
        {asset.optimizedFilename && <source srcSet={asset.optimizedFilename} type="image/webp" />}
        <img
          src={asset.filename}
          alt={asset.title}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          loading="lazy"
          decoding="async"
        />
      </picture>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-base/90 to-transparent px-4 py-3 text-body text-ink-primary">
        {title ?? asset.title}
      </figcaption>
    </figure>
  );
}
