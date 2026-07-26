import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchTwoStageStore } from '../../store/benchTwoStageStore';
import { useI18n } from '../../i18n/useI18n';
import { simulateTwoStageCycle } from '../../simulation/math/twoStageCycle';
import { simulateCycle } from '../../simulation/math/vaporCycle';
import { formatNumber } from '../../utils/format';

/**
 * 单级 vs 两级压缩 + 闪发分离 并排对比卡：让学员一眼看到
 * 两级方案的 COP 提升、排气温度下降、闪发分气比、最优中间压力。
 */
export function TwoStageCycleCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const overlayEnabled = useBenchTwoStageStore((s) => s.enabled);
  const toggleOverlay = useBenchTwoStageStore((s) => s.toggleEnabled);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [Te, setTe] = useState(refrig.Te ?? -10);
  const [Tc, setTc] = useState(refrig.Tc ?? 50);
  const [autoPi, setAutoPi] = useState(true);
  const [Pi, _setPi] = useState<number | null>(null);

  // 跑两次：单级（用 vaporCycle）vs 两级
  const single = useMemo(
    () =>
      simulateCycle({
        refrigerant: refrig.refrigerant,
        Te,
        Tc,
        superheatK: refrig.superheatK ?? 5,
        subcoolK: refrig.subcoolK ?? 3,
        displacementCc: refrig.displacementCc ?? 12,
        clearanceRatio: refrig.clearanceRatio ?? 0.05,
        rpm: 3000,
        isentropicEff: refrig.isentropicEff ?? 0.7,
        eevOpening: refrig.eevOpening ?? 0.6,
      }),
    [refrig, Te, Tc],
  );

  const twoStage = useMemo(
    () =>
      simulateTwoStageCycle({
        refrigerant: refrig.refrigerant,
        Te,
        Tc,
        superheatK: refrig.superheatK ?? 5,
        subcoolK: refrig.subcoolK ?? 3,
        isentropicEff: refrig.isentropicEff ?? 0.7,
        displacementLowCc: refrig.displacementCc ?? 12,
        displacementHighCc: (refrig.displacementCc ?? 12) * 0.65,
        rpm: 3000,
        clearanceRatio: refrig.clearanceRatio ?? 0.05,
        intermediatePressureMPa: autoPi ? undefined : (Pi ?? undefined),
      }),
    [refrig, Te, Tc, autoPi, Pi],
  );

  // 对比柱状图数据
  const cmp = useMemo(
    () => [
      { metric: 'COP', single: Number(single.cop.toFixed(2)), twoStage: Number(twoStage.cop.toFixed(2)), unit: '' },
      { metric: isEn ? 'T_d (°C)' : '排气温度 (°C)', single: Number(single.Tdischarge.toFixed(1)), twoStage: Number(twoStage.TdischargeC.toFixed(1)), unit: '°C' },
      { metric: isEn ? 'W (kW)' : '总功 (kW)', single: Number(single.Wcomp.toFixed(2)), twoStage: Number(twoStage.WtotKW.toFixed(2)), unit: 'kW' },
    ],
    [single, twoStage, isEn],
  );

  const copGainPct = single.cop > 0 ? ((twoStage.cop - single.cop) / single.cop) * 100 : 0;
  const TdDropC = single.Tdischarge - twoStage.TdischargeC;

  const gainTone = copGainPct > 10 ? 'measure' : copGainPct > 0 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Single-Stage vs Two-Stage + Flash Tank' : '单级 vs 两级压缩 + 闪发分离'}
      eyebrow={isEn ? 'high-efficiency topology' : '高端能效拓扑'}
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleOverlay}
            className={`rounded border px-1.5 py-[1px] text-[10px] transition-colors ${
              overlayEnabled
                ? 'border-[#c4b5fd]/60 bg-[#c4b5fd]/15 text-[#c4b5fd]'
                : 'border-line bg-bg-elev text-ink-muted hover:text-ink'
            }`}
            title={isEn
              ? 'Overlay 9 two-stage state points (incl. flash gas 7v / flash liquid 8l) onto the main P-h diagram in purple triangles.'
              : '把 9 个两级状态点（含闪发气 7v / 闪发液 8l）以紫色三角覆盖到主 P-h 图上'}
          >
            {isEn ? `Overlay on main P-h${overlayEnabled ? ' · on' : ''}` : `叠到主 P-h 图${overlayEnabled ? ' · 开' : ''}`}
          </button>
          <FidelityBadge
            level="physical"
            hint={
              isEn
                ? 'Two-stage compression with optimal P_i = sqrt(Ps·Pd) + flash separator; lowers discharge temp + raises COP at large pressure ratios.'
                : '两级压缩 + 最优中间压力 sqrt(Ps·Pd) + 闪发分离；大压比工况下降排气温度、升 COP。'
            }
          />
        </div>
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'At large pressure ratios (Pd/Ps > 6), single-stage discharge temperature pushes 100-130°C — straight into compressor over-temperature trip. Two-stage with intercooling drops T_d by 20-40°C and lifts COP 10-25%. The price is one extra compressor + flash tank.'
          : '大压比工况（Pd/Ps > 6）下，单级排气温度 100-130°C 直接撞压缩机过温保护。两级压缩 + 中间冷却让 T_d 降 20-40°C、COP 升 10-25%。代价：多一级压缩机 + 闪发罐。'}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>Te (°C)</span>
            <span className="formula text-ink-primary">{formatNumber(Te, 0)}</span>
          </span>
          <input type="range" value={Te} min={-25} max={15} step={1}
            onChange={(e) => setTe(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="evaporation temperature"
            aria-valuemin={-25} aria-valuemax={15} aria-valuenow={Te} aria-valuetext={`${Te} °C`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>Tc (°C)</span>
            <span className="formula text-ink-primary">{formatNumber(Tc, 0)}</span>
          </span>
          <input type="range" value={Tc} min={30} max={65} step={1}
            onChange={(e) => setTc(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="condensation temperature"
            aria-valuemin={30} aria-valuemax={65} aria-valuenow={Tc} aria-valuetext={`${Tc} °C`}
          />
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-caption text-ink-muted">{isEn ? 'P_i mode' : '中间压力'}</span>
          <button
            type="button"
            aria-pressed={autoPi}
            onClick={() => setAutoPi((v) => !v)}
            className={`rounded border px-2 py-1 text-caption transition-colors ${
              autoPi
                ? 'border-accent-measure/60 bg-accent-measure/10 text-accent-measure'
                : 'border-line-subtle bg-bg-base text-ink-muted'
            }`}
          >
            {autoPi ? (isEn ? 'optimal' : '最优') : (isEn ? 'manual' : '手动')}
          </button>
        </label>
        <div className="flex flex-col">
          <span className="mb-1 text-caption text-ink-muted">P_i (MPa)</span>
          <p className="formula text-body text-accent-primary py-1">{formatNumber(twoStage.Pi, 3)}</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className={`rounded-lg border p-2 ${toneClass(gainTone)}`}>
          <p className="text-caption opacity-80">{isEn ? 'COP gain' : 'COP 提升'}</p>
          <p className="formula text-body">+{formatNumber(copGainPct, 1)} %</p>
        </div>
        <div className="rounded-lg border border-accent-measure/40 bg-accent-measure/10 p-2 text-accent-measure">
          <p className="text-caption opacity-80">{isEn ? 'T_d drop' : 'T_d 下降'}</p>
          <p className="formula text-body">−{formatNumber(TdDropC, 1)} K</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Flash x' : '闪发分气比'}</p>
          <p className="formula text-body text-accent-warn">{formatNumber(twoStage.flashFraction * 100, 1)} %</p>
        </div>
      </div>

      <div className="h-48">
        <SafeResponsiveContainer>
          <BarChart data={cmp} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="metric" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="single" name={isEn ? 'Single-stage' : '单级'} fill="#34d6ff" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {cmp.map((_, i) => <Cell key={i} fill="#34d6ff" />)}
            </Bar>
            <Bar dataKey="twoStage" name={isEn ? 'Two-stage' : '两级'} fill="#43f7b5" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {cmp.map((_, i) => <Cell key={i} fill="#43f7b5" />)}
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn ? (
          <>
            At Te=<span className="formula">{formatNumber(Te, 0)}</span>°C / Tc=<span className="formula">{formatNumber(Tc, 0)}</span>°C:
            single-stage T_d = <span className="formula text-accent-fault">{formatNumber(single.Tdischarge, 0)}</span>°C
            (compressor limit ~110°C). Two-stage with flash tank: T_d = <span className="formula text-accent-measure">{formatNumber(twoStage.TdischargeC, 0)}</span>°C,
            COP <span className="formula">{formatNumber(twoStage.cop, 2)}</span> vs <span className="formula">{formatNumber(single.cop, 2)}</span>.
          </>
        ) : (
          <>
            当 Te=<span className="formula">{formatNumber(Te, 0)}</span>°C / Tc=<span className="formula">{formatNumber(Tc, 0)}</span>°C:
            单级 T_d = <span className="formula text-accent-fault">{formatNumber(single.Tdischarge, 0)}</span>°C
            （压缩机上限 ~110°C）；两级 + 闪发 T_d = <span className="formula text-accent-measure">{formatNumber(twoStage.TdischargeC, 0)}</span>°C，
            COP <span className="formula">{formatNumber(twoStage.cop, 2)}</span> vs <span className="formula">{formatNumber(single.cop, 2)}</span>。
          </>
        )}
      </p>
    </Card>
  );
}
