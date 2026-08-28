import { useEffect, useState } from 'react';
import { X, Cpu, Snowflake, Zap, CircuitBoard, Gauge, CheckCircle2 } from 'lucide-react';
import { compressorBundles, type CompressorBundle } from '../../content/compressorLibrary';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 压缩机型号库抽屉：选真机型号 + 变频器搭配 → 一键把参数批量预置到 6 个模块。
 * 与 16 模块教学并行存在，不占模块槽位。
 */
export function CompressorLibraryDrawer({ open, onClose }: Props) {
  const { t } = useI18n();
  const updateMotorBasics = useSimulationStore((s) => s.updateMotorBasics);
  const updateRefrigeration = useSimulationStore((s) => s.updateRefrigeration);
  const updateInverter = useSimulationStore((s) => s.updateInverter);
  const updateSvpwm = useSimulationStore((s) => s.updateSvpwm);
  const updateWeakField = useSimulationStore((s) => s.updateWeakField);
  const updateStartup = useSimulationStore((s) => s.updateStartup);
  const updateFoc = useSimulationStore((s) => s.updateFoc);

  const [appliedId, setAppliedId] = useState<string | null>(null);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 关闭时重置 applied 状态
  useEffect(() => {
    if (!open) setAppliedId(null);
  }, [open]);

  if (!open) return null;

  const apply = (bundle: CompressorBundle) => {
    updateMotorBasics(bundle.patch.motorBasics);
    updateRefrigeration(bundle.patch.refrigeration);
    updateInverter(bundle.patch.inverter);
    updateSvpwm(bundle.patch.svpwm);
    updateWeakField(bundle.patch.weakField);
    updateStartup(bundle.patch.startup);
    updateFoc(bundle.patch.foc);
    setAppliedId(bundle.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.libraryAria')}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-line-subtle bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题条 */}
        <header className="flex items-center justify-between border-b border-line-subtle bg-bg-raised px-5 py-3">
          <div>
            <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">Compressor Library</p>
            <h2 className="font-display text-title text-ink-primary">{t('shell.libraryTitle')}</h2>
            <p className="mt-0.5 text-caption text-ink-muted">
              {t('shell.librarySubtitle')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="rounded-md border border-line-subtle p-1.5 text-ink-muted transition-colors hover:bg-bg-base hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 列表 */}
        <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {compressorBundles.map((b) => (
              <BundleCard key={b.id} bundle={b} applied={appliedId === b.id} onApply={() => apply(b)} />
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-line-subtle bg-bg-base p-3 text-caption leading-relaxed text-ink-muted">
            <span className="text-ink-secondary">{t('shell.libraryDataNoteLabel')}</span>
            {t('shell.libraryDataNoteBody')}
            <span className="text-accent-warn">{t('shell.libraryDataNoteWarn')}</span>
            {t('shell.libraryDataNoteTail')}
          </div>
        </div>
      </div>
    </div>
  );
}

function BundleCard({ bundle, applied, onApply }: { bundle: CompressorBundle; applied: boolean; onApply: () => void }) {
  const { t } = useI18n();
  const { compressor, inverter, typicalCondition } = bundle;
  return (
    <div className={`rounded-xl border bg-bg-base p-3 transition-colors ${applied ? 'border-accent-measure/60 bg-accent-measure/5' : 'border-line-subtle'}`}>
      {/* 标题行 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-body font-medium text-ink-primary">{bundle.name}</h3>
          <p className="mt-0.5 text-caption text-ink-muted">{bundle.application}</p>
        </div>
        <button
          type="button"
          onClick={onApply}
          className={`shrink-0 rounded-md border px-2.5 py-1 text-caption transition-colors ${
            applied
              ? 'border-accent-measure/60 bg-accent-measure/10 text-accent-measure'
              : 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
          }`}
        >
          {applied ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('shell.libraryLoaded')}
            </span>
          ) : t('shell.libraryLoad')}
        </button>
      </div>

      {/* 双列：压缩机 / 变频器 */}
      <div className="grid grid-cols-2 gap-2 text-caption">
        {/* 压缩机栏 */}
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
            <Snowflake className="h-3 w-3" />
            <span>{t('shell.libraryCompressorCol')}</span>
          </div>
          <div className="text-ink-primary">{compressor.brand}</div>
          <div className="font-mono text-ink-secondary">{compressor.partNo}</div>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            <li>{t('shell.libTypeLabel')}{compressor.type} · {compressor.hp} HP</li>
            <li>{t('shell.libRefrigerantLabel')}<span className="text-accent-primary">{compressor.refrigerant}</span> · {t('shell.libDisplacement')} {compressor.displacementCc} cc/r</li>
            <li>{t('shell.libPolePairs')} {compressor.polePairs} · {t('shell.libRated')} {compressor.ratedCurrentA} A</li>
            <li>Ld/Lq {compressor.ldMh}/{compressor.lqMh} mH · ψf {formatNumber(compressor.flux, 3)} Wb</li>
            <li>{t('shell.libCooling')} {compressor.coolingW} W · max {compressor.maxRpm} rpm</li>
          </ul>
          {compressor.notes && <p className="mt-1 italic text-ink-muted">{compressor.notes}</p>}
        </div>

        {/* 变频器栏 */}
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
            <CircuitBoard className="h-3 w-3" />
            <span>{t('shell.libraryDriveCol')}</span>
          </div>
          <div className="text-ink-primary">{inverter.ipmBrand}</div>
          <div className="font-mono text-ink-secondary">{inverter.ipmPartNo}</div>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            <li className="flex items-center gap-1"><Cpu className="h-3 w-3" />{t('shell.libMcuLabel')}<span className="font-mono">{inverter.mcuPartNo}</span></li>
            <li>{t('shell.libTopology')}{inverter.topology}</li>
            <li className="flex items-center gap-1"><Zap className="h-3 w-3" />{inverter.ratedCurrentA} A / {inverter.ratedBusV} V</li>
            <li className="flex items-center gap-1"><Gauge className="h-3 w-3" />PWM {(inverter.pwmFreqHz / 1000).toFixed(1)} kHz · {t('shell.libDeadTime')} {inverter.deadTimeUs} μs</li>
          </ul>
          {inverter.notes && <p className="mt-1 italic text-ink-muted">{inverter.notes}</p>}
        </div>
      </div>

      {/* 典型工况 */}
      <div className="mt-2 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1 text-caption text-ink-muted">
        <span className="text-ink-secondary">{t('shell.libTypicalCondition')}</span>
        T_e {typicalCondition.Te}°C · T_c {typicalCondition.Tc}°C · {t('shell.libSuperheat')} {typicalCondition.superheatK}K · {t('shell.libSubcool')} {typicalCondition.subcoolK}K · {t('shell.libAmbient')} {typicalCondition.ambientOutdoorC}°C
      </div>

      {applied && (
        <p className="mt-2 text-caption text-accent-measure">
          {t('shell.libraryAppliedNote')}
        </p>
      )}
    </div>
  );
}
