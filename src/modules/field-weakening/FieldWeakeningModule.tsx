import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BatteryCharging, Zap } from 'lucide-react';
import { useCallback, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { CurrentLimitSpace3D } from '../../components/three/CurrentLimitSpace3D';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { checkVoltageLimit, estimateTorque, suggestWeakeningId } from '../../simulation/math/weakField';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useRafThrottle } from '../../utils/useRafThrottle';
import { useI18n } from '../../i18n/useI18n';
import { MtpaTrajectoryCard } from './MtpaTrajectoryCard';
import { LimitProjectionCard } from './LimitProjectionCard';
import { SerialCompareFieldWeakeningCard } from './SerialCompareFieldWeakeningCard';
import { CodeLabCard } from '../../components/lab/CodeLabCard';

function LimitMap({
  id, iq, currentLimit, voltageRatio, saturated, onPointChange,
}: {
  id: number; iq: number; currentLimit: number; voltageRatio: number; saturated: boolean;
  onPointChange?: (id: number, iq: number) => void;
}) {
  const { t } = useI18n();
  const size = 360;
  const cx = size / 2;
  const cy = size / 2 + 12;
  const axisLimit = Math.max(currentLimit * 1.25, Math.abs(id), Math.abs(iq), 4);
  const scale = 130 / axisLimit;
  const currentR = currentLimit * scale;
  const x = cx + id * scale;
  const y = cy - iq * scale;
  // 电压椭圆半径：电压余量越大圆越大；ω 越大椭圆越扁（这里固定纵横比 0.72 做示意）
  const voltageR = currentR * Math.max(0.18, Math.min(1.18, 1 / Math.max(0.25, voltageRatio)));

  const draggingRef = useRef(false);
  const commit = useRafThrottle((nextId: number, nextIq: number) => onPointChange?.(nextId, nextIq));
  const handlePoint = useCallback((event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    if (!onPointChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * size;
    const svgY = ((event.clientY - rect.top) / rect.height) * size;
    let nextId = (svgX - cx) / scale;
    let nextIq = (cy - svgY) / scale;
    nextIq = Math.max(0, nextIq);
    const magnitude = Math.hypot(nextId, nextIq);
    const maxMag = currentLimit * 1.12;
    if (magnitude > maxMag) {
      const gain = maxMag / magnitude;
      nextId *= gain;
      nextIq *= gain;
    }
    commit(Number(nextId.toFixed(2)), Number(nextIq.toFixed(2)));
  }, [commit, cx, cy, scale, currentLimit, onPointChange]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={`mx-auto h-[360px] max-w-full ${onPointChange ? 'cursor-crosshair touch-none' : ''}`}
      onPointerDown={(event) => {
        if (!onPointChange) return;
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        handlePoint(event);
      }}
      onPointerMove={(event) => { if (draggingRef.current) handlePoint(event); }}
      onPointerUp={() => { draggingRef.current = false; }}
      onPointerCancel={() => { draggingRef.current = false; }}
      onPointerLeave={() => { draggingRef.current = false; }}
    >
      <defs>
        <marker id="weakArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb84d" />
        </marker>
      </defs>
      <rect width={size} height={size} rx="16" fill="#0d1929" />

      {/* 安全/过流区色块：以电流极限圆为界做半透明填充 */}
      <circle cx={cx} cy={cy} r={currentR + 1} fill="rgba(255,92,122,0.04)" />

      {/* 主坐标轴 */}
      <line x1="20" y1={cy} x2={size - 20} y2={cy} stroke="#1e2a3d" strokeWidth="1" />
      <line x1={cx} y1={size - 20} x2={cx} y2="20" stroke="#1e2a3d" strokeWidth="1" />
      <text x={size - 40} y={cy - 6} fill="#5d7793" fontSize="11">{t('weakField.labelIdPlus')}</text>
      <text x={26} y={cy - 6} fill="#5d7793" fontSize="11">{t('weakField.labelIdMinusWeak')}</text>
      <text x={cx + 6} y="32" fill="#5d7793" fontSize="11">{t('weakField.labelIq')}</text>

      {/* 电流极限圆 */}
      <circle cx={cx} cy={cy} r={currentR}
        fill="rgba(52,214,255,0.05)" stroke="#34d6ff" strokeWidth="1.8" strokeDasharray="6 5" />

      {/* 电压极限椭圆（中心在 -Id 方向偏移以体现 ψf 偏置；这里简化用同心椭圆） */}
      <ellipse cx={cx} cy={cy} rx={voltageR} ry={voltageR * 0.72}
        fill={saturated ? 'rgba(255,92,122,0.10)' : 'rgba(67,247,181,0.07)'}
        stroke={saturated ? '#ff5c7a' : '#43f7b5'} strokeWidth="1.8" />

      {/* 弱磁方向箭头：从原点指向 -Id 方向，提示"加大转速时把工作点推往负 Id" */}
      <line
        x1={cx + 8} y1={cy}
        x2={cx - currentR * 0.55} y2={cy}
        stroke="#ffb84d" strokeWidth="2" strokeDasharray="3 3"
        markerEnd="url(#weakArrow)" opacity="0.85"
      />
      <text x={cx - currentR * 0.55 - 4} y={cy - 8} textAnchor="end" fill="#ffb84d" fontSize="10">
        {t('weakField.labelWeakDir')}
      </text>

      {/* 工作点 */}
      <circle cx={x} cy={y} r={onPointChange ? 11 : 7}
        fill={saturated ? '#ff5c7a' : '#43f7b5'} stroke="#e7f3ff" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={saturated ? '#ff5c7a' : '#43f7b5'} strokeWidth="1.5" opacity="0.5" />
      {/* 触控热区扩大：透明 r=24 圆，事件冒泡走外层 SVG 的 onPointer* 处理。 */}
      {onPointChange && (
        <circle cx={x} cy={y} r="24" fill="transparent" style={{ pointerEvents: 'all' }} />
      )}

      {/* 角落图例 */}
      <g fontSize="11" fontFamily="Cascadia Code, Consolas, monospace">
        <line x1="22" y1="22" x2="42" y2="22" stroke="#34d6ff" strokeWidth="2" strokeDasharray="6 5" />
        <text x="48" y="25" fill="#9eb5cb">{t('weakField.labelCurrentCircle')}{formatNumber(currentLimit, 1)} A</text>
        <line x1="22" y1="42" x2="42" y2="42" stroke={saturated ? '#ff5c7a' : '#43f7b5'} strokeWidth="2" />
        <text x="48" y="45" fill="#9eb5cb">{t('weakField.labelVoltageEllipse')}</text>
      </g>

      {/* 工作点状态标签 */}
      <g>
        <rect x="22" y={size - 38} width="140" height="22" rx="4" fill={saturated ? 'rgba(255,92,122,0.15)' : 'rgba(67,247,181,0.12)'}
          stroke={saturated ? '#ff5c7a' : '#43f7b5'} strokeWidth="1" />
        <text x="92" y={size - 22} textAnchor="middle"
          fill={saturated ? '#ff5c7a' : '#43f7b5'} fontSize="11" fontWeight="700">
          {saturated ? t('weakField.labelVoltageSaturated') : t('weakField.labelSafePoint')}
        </text>
      </g>
      <text x={size - 22} y={size - 22} textAnchor="end" fill="#e7f3ff" fontSize="11"
        fontFamily="Cascadia Code, Consolas, monospace">
        Id={formatNumber(id, 1)} · Iq={formatNumber(iq, 1)}
      </text>
    </svg>
  );
}

function createTorqueCurve(baseSpeed: number, torque: number) {
  return Array.from({ length: 80 }, (_, i) => {
    const speed = 300 + i * 140;
    const ratio = speed / Math.max(baseSpeed, 1);
    const availableTorque = ratio < 1 ? torque : torque / ratio;
    return { speed, torque: availableTorque, power: (availableTorque * speed) / 9550 };
  });
}

function useDerived() {
  const params = useSimulationStore((s) => s.weakField);
  return useMemo(() => {
    const ld = params.ldMh / 1000;
    const lq = params.lqMh / 1000;
    const omega = (params.targetRpm * 2 * Math.PI / 60) * 4;
    const vd = 0.55 * params.id - omega * lq * params.iq;
    const vq = 0.55 * params.iq + omega * (ld * params.id + params.flux);
    const voltage = checkVoltageLimit({ vd, vq, uDc: params.uDc, margin: params.voltageMargin });
    const torque = estimateTorque({ id: params.id, iq: params.iq, ld, lq, flux: params.flux, polePairs: 4 });
    const currentMag = Math.hypot(params.id, params.iq);
    const suggestedId = suggestWeakeningId(voltage.reserve, params.currentLimit);
    const voltageRatio = voltage.magnitude / Math.max(voltage.limit, 1e-6);
    const curve = createTorqueCurve(3200, Math.max(0.1, torque));
    return { params, voltage, torque, currentMag, suggestedId, voltageRatio, curve };
  }, [params]);
}

function Primary() {
  const { params, voltage, voltageRatio } = useDerived();
  const { t } = useI18n();
  const updateWeakField = useSimulationStore((s) => s.updateWeakField);
  const handlePointChange = useCallback((id: number, iq: number) => updateWeakField({ id, iq }), [updateWeakField]);
  return (
    <Card
      title={t('weakField.primaryTitle')}
      eyebrow={t('weakField.primaryEyebrow')}
      density="compact"
      action={<FidelityBadge level="simplified" hint={t('weakField.fidelityHint')} />}
    >
      <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <CurrentLimitSpace3D
          id={params.id}
          iq={params.iq}
          currentLimit={params.currentLimit}
          voltageRatio={voltageRatio}
          saturated={voltage.saturated}
        />
        <LimitMap
          id={params.id}
          iq={params.iq}
          currentLimit={params.currentLimit}
          voltageRatio={voltageRatio}
          saturated={voltage.saturated}
          onPointChange={handlePointChange}
        />
      </div>
    </Card>
  );
}

function Probe() {
  const { voltage, torque, currentMag, suggestedId, curve } = useDerived();
  const { t } = useI18n();
  return (
    <>
      <Card title={t('weakField.torqueTrendTitle')} eyebrow={t('weakField.torqueTrendEyebrow')} density="compact">
        <div className="h-56">
          <SafeResponsiveContainer>
            <AreaChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
              <XAxis dataKey="speed" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="rpm" />
              <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
              <Area type="monotone" dataKey="torque" stroke="#43f7b5" fill="rgba(67,247,181,.18)" name={t('weakField.torqueLabel')} isAnimationActive={false} />
              <Area type="monotone" dataKey="power" stroke="#ffb84d" fill="rgba(255,184,77,.12)" name={t('weakField.powerLabel')} isAnimationActive={false} />
            </AreaChart>
          </SafeResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2"><Zap className="mb-1 h-3.5 w-3.5 text-accent-warn" /><span className="text-ink-muted">{t('weakField.metricTorque')} </span><span className="text-ink-primary">{formatNumber(torque, 2)} Nm</span></div>
        <div className="rounded border border-line-subtle bg-bg-base p-2"><BatteryCharging className="mb-1 h-3.5 w-3.5 text-accent-primary" /><span className="text-ink-muted">{t('weakField.metricReserve')} </span><span className="text-ink-primary">{formatNumber(voltage.reserve, 2)} V</span></div>
        <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">|I| </span><span className="text-ink-primary">{formatNumber(currentMag, 2)} A</span></div>
        <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('weakField.metricSuggestedId')} </span><span className="text-ink-primary">{formatNumber(suggestedId, 2)} A</span></div>
      </div>
      {voltage.saturated && (
        <Card tone="fault" density="compact">
          <div className="flex gap-2 text-body leading-relaxed text-accent-fault">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('weakField.saturatedHint')}</p>
          </div>
        </Card>
      )}
      <MtpaTrajectoryCard />
      <LimitProjectionCard />
      <SerialCompareFieldWeakeningCard />
      {/* Code Lab：MTPA 的 d 轴电流指令（配套上方 MTPA 轨迹卡片） */}
      <CodeLabCard />
    </>
  );
}

export function FieldWeakeningModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="field-weakening" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="field-weakening" />}
    />
  );
}
