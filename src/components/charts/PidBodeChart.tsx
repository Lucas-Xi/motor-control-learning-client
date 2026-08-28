import { useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';
import { computePidBode, findUltimateGain, findGainCrossover, znTuning, type PIDGain } from '../../simulation/math/pidFrequency';
import { formatNumber } from '../../utils/format';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  gains: PIDGain;
}

type ZnMode = 'P' | 'PI' | 'PID' | 'PID-no-os';

/**
 * PID Bode 图组件。
 * 上半幅频、下半相频，标注穿越频率 + 相位裕量。
 * 点击"Z-N 建议"可基于临界增益 Ku 计算整定参数。
 */
export function PidBodeChart({ gains }: Props) {
  const { t } = useI18n();
  const [znMode, setZnMode] = useState<ZnMode>('PID');

  const { bodeData, ultimate, crossover, zn } = useMemo(() => {
    const bodeData = computePidBode(gains, 0.1, 1000, 120);
    const ultimate = findUltimateGain(bodeData);
    const crossover = findGainCrossover(bodeData);
    const zn = ultimate ? znTuning(ultimate.Ku, ultimate.Tu, znMode) : null;
    return { bodeData, ultimate, crossover, zn };
  }, [gains.kp, gains.ki, gains.kd, gains.n, znMode]);

  const magData = bodeData.map((p) => ({ freq: p.freq, mag: p.magnitudeDb }));
  const phaseData = bodeData.map((p) => ({ freq: p.freq, phase: p.phaseDeg }));

  return (
    <Card title={t('charts.bdTitle')} eyebrow={t('charts.bdEyebrow')}
      action={
        ultimate ? (
          <span className="rounded-md border border-accent-measure/30 bg-accent-measure/8 px-2 py-0.5 text-caption font-medium text-accent-measure">
            Ku={formatNumber(ultimate.Ku, 2)} &nbsp;Tu={formatNumber(ultimate.Tu, 4)}s
          </span>
        ) : null
      }
    >
      {/* 幅频 */}
      <div className="h-32">
        <SafeResponsiveContainer>
          <LineChart data={magData} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(148,210,255,0.08)" strokeDasharray="3 6" />
            <XAxis dataKey="freq" tick={{ fill: '#8fb7c9', fontSize: 9 }} scale="log" domain={['auto', 'auto']} tickFormatter={(v: number) => v < 1 ? v.toFixed(1) : v < 10 ? v.toFixed(1) : `${v}`} />
            <YAxis tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="dB" />
            <Tooltip
              contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 10, fontSize: 11 }}
              formatter={((v: unknown) => [`${formatNumber(Number(v), 1)} dB`, t('charts.bdMagnitude')]) as never}
            />
            <ReferenceLine y={0} stroke="rgba(148,210,255,0.25)" strokeDasharray="4 4" />
            {crossover && <ReferenceLine x={crossover.f0dB} stroke="rgba(255,92,122,0.3)" strokeDasharray="3 6" />}
            <Line type="monotone" dataKey="mag" stroke="#34d6ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      {/* 相频 */}
      <div className="h-28">
        <SafeResponsiveContainer>
          <LineChart data={phaseData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(148,210,255,0.08)" strokeDasharray="3 6" />
            <XAxis dataKey="freq" tick={{ fill: '#8fb7c9', fontSize: 9 }} scale="log" domain={['auto', 'auto']} tickFormatter={(v: number) => v < 1 ? v.toFixed(1) : `${v}`} />
            <YAxis tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="°" domain={[-270, 90]} />
            <Tooltip
              contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 10, fontSize: 11 }}
              formatter={((v: unknown) => [`${formatNumber(Number(v), 1)}°`, t('charts.bdPhase')]) as never}
            />
            <ReferenceLine y={-180} stroke="rgba(255,92,122,0.4)" strokeDasharray="4 4" />
            {crossover && <ReferenceLine x={crossover.f0dB} stroke="rgba(255,92,122,0.3)" strokeDasharray="3 6" />}
            <Line type="monotone" dataKey="phase" stroke="#f472b6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      {/* 底部摘要 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted">
        {crossover && (
          <span>f₀={formatNumber(crossover.f0dB, 1)} Hz &nbsp; PM={formatNumber(crossover.pm, 1)}°</span>
        )}
        {ultimate && (
          <span className="text-accent-measure">
            Ku={formatNumber(ultimate.Ku, 2)} &nbsp; Tu={formatNumber(ultimate.Tu, 4)}s
          </span>
        )}
      </div>
      {/* Z-N 整定区 */}
      {zn && (
        <div className="mt-2 rounded-lg border border-accent-measure/20 bg-accent-measure/5 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-caption font-medium text-accent-measure">{t('charts.bdZnTuning')}</span>
            <select
              className="rounded border border-line-subtle bg-bg-base px-2 py-0.5 text-caption text-ink-primary"
              value={znMode}
              onChange={(e) => setZnMode(e.target.value as ZnMode)}
            >
              <option value="P">P</option>
              <option value="PI">PI</option>
              <option value="PID">PID</option>
              <option value="PID-no-os">{t('charts.bdZnNoOvershoot')}</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2 text-caption">
            <span className="rounded bg-bg-base px-2 py-0.5 text-center">Kp = {formatNumber(zn.kp, 3)}</span>
            <span className="rounded bg-bg-base px-2 py-0.5 text-center">Ki = {formatNumber(zn.ki, 3)}</span>
            <span className="rounded bg-bg-base px-2 py-0.5 text-center">Kd = {formatNumber(zn.kd, 4)}</span>
          </div>
        </div>
      )}
      {!ultimate && (
        <p className="mt-2 text-caption text-ink-secondary">{t('charts.bdNoUltimate')}</p>
      )}
    </Card>
  );
}