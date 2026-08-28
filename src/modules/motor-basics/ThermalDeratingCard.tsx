import { useMemo, useState } from 'react';
import { Area, ComposedChart, CartesianGrid, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2, Thermometer } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import {
  compensateForTemperature,
  stepThermal,
  defaultThermalParams,
} from '../../simulation/math/thermalRsFlux';
import { formatNumber } from '../../utils/format';

// 基准参数与 focLoop.ts 保持一致，让对照"啊原来 Rs/ψf 都是这里给的"成立
const RS_BASE = 0.55;     // Ω
const FLUX_BASE = 0.045;  // Wb

const RAMP_TOTAL_SEC = 3600;  // 60 分钟
const RAMP_STEP_SEC = 30;     // 30 秒采样，足够看出 τ=600s 一阶滞后曲线
const RAMP_POINTS = Math.floor(RAMP_TOTAL_SEC / RAMP_STEP_SEC) + 1;

interface RampPoint {
  tMin: number;
  Tcool: number;
  Thot: number;
}

/**
 * 温度对电机参数的影响卡：把 thermalRsFlux.ts 接到 UI。
 *
 * 学员一眼看见的 3 件事：
 *   1. Rs 随温升 PTC 上扬（铜电阻 α=0.00393/K）→ 不补偿电流环增益失配
 *   2. ψf 随温升 NTC 下降（NdFeB β=0.0012/K）→ 反电动势按比例缩水
 *   3. 退磁告警阈值（典型 N50 ≈ 100°C）—— 越过即永久损坏，必须停机
 *
 * 下半部分用 stepThermal 跑 60 分钟一阶热模型：
 *   - 同样满载（120 W 总损耗），冷启动 25°C 与热环境 50°C 两条曲线
 *   - 红色危险带 100°C+ 退磁阈值 + 黄色警戒带 80-100°C 提前预警
 */
export function ThermalDeratingCard() {
  const { t } = useI18n();
  const [Tprobe, setTprobe] = useState(85);   // 仪表面板探针温度
  const [Ploss, setPloss] = useState(120);    // W 总损耗（满载典型值）

  const comp = useMemo(
    () => compensateForTemperature(Tprobe, { rs0: RS_BASE, flux0: FLUX_BASE }),
    [Tprobe],
  );

  // 热爬升时序：冷启动 25°C vs 热环境 50°C，固定满载 P_loss
  const ramp = useMemo<RampPoint[]>(() => {
    const arr: RampPoint[] = [];
    let Tcool = 25;
    let Thot = 50;
    for (let i = 0; i < RAMP_POINTS; i += 1) {
      arr.push({
        tMin: Number(((i * RAMP_STEP_SEC) / 60).toFixed(2)),
        Tcool: Number(Tcool.toFixed(2)),
        Thot: Number(Thot.toFixed(2)),
      });
      Tcool = stepThermal(Tcool, 25, Ploss, RAMP_STEP_SEC);
      Thot = stepThermal(Thot, 50, Ploss, RAMP_STEP_SEC);
    }
    return arr;
  }, [Ploss]);

  const TcoolFinal = ramp[ramp.length - 1].Tcool;
  const ThotFinal = ramp[ramp.length - 1].Thot;
  const hotExceedsDemag = ThotFinal > defaultThermalParams.TdemagC;

  const status = comp.demagAlarm
    ? {
        tone: 'bad',
        label: t('motorBasics.thermalDeratingStatusDemag'),
        Icon: AlertOctagon,
        msg: `${t('motorBasics.thermalDeratingMsgDemagPrefix')}${Tprobe.toFixed(0)}${t('motorBasics.thermalDeratingMsgDemagMid')}${defaultThermalParams.TdemagC}${t('motorBasics.thermalDeratingMsgDemagTail')}`,
      }
    : comp.demagMarginK < 20
    ? {
        tone: 'warn',
        label: t('motorBasics.thermalDeratingStatusNear'),
        Icon: AlertTriangle,
        msg: `${t('motorBasics.thermalDeratingMsgNearPrefix')}${comp.demagMarginK.toFixed(0)}${t('motorBasics.thermalDeratingMsgNearSuffix')}`,
      }
    : {
        tone: 'good',
        label: t('motorBasics.thermalDeratingStatusOk'),
        Icon: CheckCircle2,
        msg: `${t('motorBasics.thermalDeratingMsgOkPrefix')}${comp.demagMarginK.toFixed(0)}${t('motorBasics.thermalDeratingMsgOkSuffix')}`,
      };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('motorBasics.thermalDeratingTitle')}
      eyebrow={t('motorBasics.thermalDeratingEyebrow')}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('motorBasics.thermalDeratingFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('motorBasics.thermalDeratingBaseLead')}
        <span className="formula">Rs = {RS_BASE} Ω</span>
        {t('motorBasics.thermalDeratingBaseSep')}
        <span className="formula"> ψf = {FLUX_BASE} Wb</span>
        {t('motorBasics.thermalDeratingIntroMid')}
        <span className="text-accent-fault">{t('motorBasics.thermalDeratingDemagLabel')}</span>
        {t('motorBasics.thermalDeratingIntroEnd')}
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" />{t('motorBasics.thermalDeratingTwLabel')}</span>
            <span className="formula text-ink-primary">{formatNumber(Tprobe, 0)} °C</span>
          </span>
          <input
            type="range"
            value={Tprobe}
            min={25}
            max={150}
            step={1}
            onChange={(e) => setTprobe(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('motorBasics.thermalDeratingTwAria')}
            aria-valuemin={25}
            aria-valuemax={150}
            aria-valuenow={Tprobe}
            aria-valuetext={`${Tprobe} celsius`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('motorBasics.thermalDeratingPlossLabel')}</span>
            <span className="formula text-ink-primary">{formatNumber(Ploss, 0)} W</span>
          </span>
          <input
            type="range"
            value={Ploss}
            min={20}
            max={250}
            step={5}
            onChange={(e) => setPloss(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('motorBasics.thermalDeratingPlossAria')}
            aria-valuemin={20}
            aria-valuemax={250}
            aria-valuenow={Ploss}
            aria-valuetext={`${Ploss} watt`}
          />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className={`rounded-lg border p-2 ${comp.rsRisePct > 30 ? toneClass('warn') : toneClass('good')}`}>
          <p className="text-caption opacity-80">{t('motorBasics.thermalDeratingRsNow')}</p>
          <p className="formula text-body">{formatNumber(comp.rs, 4)} Ω</p>
          <p className="text-[10px] opacity-75">{t('motorBasics.thermalDeratingRsSubPrefix')}{formatNumber(comp.rsRisePct, 1)}{t('motorBasics.thermalDeratingRsSubSuffix')}</p>
        </div>
        <div className={`rounded-lg border p-2 ${comp.fluxDropPct > 10 ? toneClass('warn') : toneClass('good')}`}>
          <p className="text-caption opacity-80">{t('motorBasics.thermalDeratingFluxNow')}</p>
          <p className="formula text-body">{formatNumber(comp.flux, 5)} Wb</p>
          <p className="text-[10px] opacity-75">{t('motorBasics.thermalDeratingFluxSubPrefix')}{formatNumber(comp.fluxDropPct, 1)}{t('motorBasics.thermalDeratingFluxSubSuffix')}</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(status.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{status.label}</span>
          </div>
          <p className="formula text-body">{t('motorBasics.thermalDeratingMarginLabel')} {formatNumber(comp.demagMarginK, 0)} K</p>
          <p className="text-[10px] leading-snug opacity-90">{status.msg}</p>
        </div>
      </div>

      <p className="mb-1 text-caption text-ink-muted">
        {t('motorBasics.thermalDeratingRampPrefix')}{Ploss}{t('motorBasics.thermalDeratingRampSuffix')}
      </p>
      <div className="h-44">
        <SafeResponsiveContainer>
          <ComposedChart data={ramp} margin={{ top: 6, right: 12, bottom: 16, left: -6 }}>
            <defs>
              <linearGradient id="thermal-danger" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#fb7185" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMin"
              type="number"
              domain={[0, RAMP_TOTAL_SEC / 60]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (min)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'T_winding (°C)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 50 }}
              domain={[20, 150]}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(1)} min`}
              formatter={(v) => `${Number(v).toFixed(1)} °C`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            {/* 危险带：100°C+ */}
            <Area type="monotone" dataKey={() => 150} fill="url(#thermal-danger)" stroke="none" baseValue={defaultThermalParams.TdemagC} isAnimationActive={false} legendType="none" />
            <ReferenceLine y={defaultThermalParams.TdemagC} stroke="#fb7185" strokeDasharray="3 3"
              label={{ value: `${t('motorBasics.thermalDeratingDemagRefLabel')}${defaultThermalParams.TdemagC}°C`, fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }} />
            <ReferenceLine y={80} stroke="#ffb84d" strokeDasharray="3 3"
              label={{ value: `${t('motorBasics.thermalDeratingWarnRefLabel')}80°C`, fill: '#ffb84d', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="Tcool" stroke="#34d6ff" strokeWidth={1.8} dot={false} isAnimationActive={false} name={t('motorBasics.thermalDeratingLegendCold')} />
            <Line type="monotone" dataKey="Thot" stroke="#fb7185" strokeWidth={1.8} dot={false} isAnimationActive={false} name={t('motorBasics.thermalDeratingLegendHot')} />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
        <div className={`rounded border px-2 py-1.5 ${toneClass(TcoolFinal > defaultThermalParams.TdemagC ? 'bad' : TcoolFinal > 80 ? 'warn' : 'good')}`}>
          {t('motorBasics.thermalDeratingColdSteady')}<span className="formula font-bold">{formatNumber(TcoolFinal, 1)}°C</span>
          {TcoolFinal > defaultThermalParams.TdemagC && t('motorBasics.thermalDeratingExceededNote')}
        </div>
        <div className={`rounded border px-2 py-1.5 ${toneClass(hotExceedsDemag ? 'bad' : ThotFinal > 80 ? 'warn' : 'good')}`}>
          {t('motorBasics.thermalDeratingHotSteady')}<span className="formula font-bold">{formatNumber(ThotFinal, 1)}°C</span>
          {hotExceedsDemag && t('motorBasics.thermalDeratingHotExceededNote')}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('motorBasics.thermalDeratingPortingTitle')}</span>
        {t('motorBasics.thermalDeratingPortingMid')}
        <span className="formula">compensateForTemperature</span>
        {t('motorBasics.thermalDeratingPortingTail')}
        <span className="text-accent-fault">{t('motorBasics.thermalDeratingPortingIsr')}</span>
        {t('motorBasics.thermalDeratingPortingEnd')}
      </p>
    </Card>
  );
}
