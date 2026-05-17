import { useEffect, useState } from 'react';
import { X, Cpu, Snowflake, Zap, CircuitBoard, Gauge, CheckCircle2 } from 'lucide-react';
import { compressorBundles, type CompressorBundle } from '../../content/compressorLibrary';
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
      aria-label="压缩机型号库"
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
            <h2 className="font-display text-title text-ink-primary">压缩机型号库 + 变频器搭配</h2>
            <p className="mt-0.5 text-caption text-ink-muted">
              点击"加载此机型"，将电机 / 冷媒 / 逆变器 / 弱磁 / 启动 / FOC 参数一次性预置到对应模块
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
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
            <span className="text-ink-secondary">数据精度提示：</span>
            型号、应用场景与功率等级取自厂商常见型录与公开资料；电机绕组参数（Ld、Lq、ψf、Rs）和典型工况采用"工程合理范围"估值，
            用于让仿真接近真机感受，<span className="text-accent-warn">不替代正式 datasheet</span>。
            实际产品上述参数往往受厂商保密协议保护。
          </div>
        </div>
      </div>
    </div>
  );
}

function BundleCard({ bundle, applied, onApply }: { bundle: CompressorBundle; applied: boolean; onApply: () => void }) {
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
              已加载
            </span>
          ) : '加载此机型'}
        </button>
      </div>

      {/* 双列：压缩机 / 变频器 */}
      <div className="grid grid-cols-2 gap-2 text-caption">
        {/* 压缩机栏 */}
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
            <Snowflake className="h-3 w-3" />
            <span>压缩机</span>
          </div>
          <div className="text-ink-primary">{compressor.brand}</div>
          <div className="font-mono text-ink-secondary">{compressor.partNo}</div>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            <li>类型：{compressor.type} · {compressor.hp} HP</li>
            <li>冷媒：<span className="text-accent-primary">{compressor.refrigerant}</span> · 排量 {compressor.displacementCc} cc/r</li>
            <li>极对数 {compressor.polePairs} · 额定 {compressor.ratedCurrentA} A</li>
            <li>Ld/Lq {compressor.ldMh}/{compressor.lqMh} mH · ψf {formatNumber(compressor.flux, 3)} Wb</li>
            <li>制冷量 {compressor.coolingW} W · max {compressor.maxRpm} rpm</li>
          </ul>
          {compressor.notes && <p className="mt-1 italic text-ink-muted">{compressor.notes}</p>}
        </div>

        {/* 变频器栏 */}
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
            <CircuitBoard className="h-3 w-3" />
            <span>变频器平台</span>
          </div>
          <div className="text-ink-primary">{inverter.ipmBrand}</div>
          <div className="font-mono text-ink-secondary">{inverter.ipmPartNo}</div>
          <ul className="mt-1 space-y-0.5 text-ink-muted">
            <li className="flex items-center gap-1"><Cpu className="h-3 w-3" />MCU：<span className="font-mono">{inverter.mcuPartNo}</span></li>
            <li>结构：{inverter.topology}</li>
            <li className="flex items-center gap-1"><Zap className="h-3 w-3" />{inverter.ratedCurrentA} A / {inverter.ratedBusV} V</li>
            <li className="flex items-center gap-1"><Gauge className="h-3 w-3" />PWM {(inverter.pwmFreqHz / 1000).toFixed(1)} kHz · 死区 {inverter.deadTimeUs} μs</li>
          </ul>
          {inverter.notes && <p className="mt-1 italic text-ink-muted">{inverter.notes}</p>}
        </div>
      </div>

      {/* 典型工况 */}
      <div className="mt-2 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1 text-caption text-ink-muted">
        <span className="text-ink-secondary">典型工况：</span>
        T_e {typicalCondition.Te}°C · T_c {typicalCondition.Tc}°C · 过热 {typicalCondition.superheatK}K · 过冷 {typicalCondition.subcoolK}K · 室外 {typicalCondition.ambientOutdoorC}°C
      </div>

      {applied && (
        <p className="mt-2 text-caption text-accent-measure">
          ✓ 已写入 motor-basics / refrigeration / inverter / svpwm / weakField / startup / foc 六个模块的参数。切到对应模块即可看到真机预置值。
        </p>
      )}
    </div>
  );
}
