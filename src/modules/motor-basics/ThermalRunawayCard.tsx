import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { defaultPmsmParameters } from '../../simulation/math/motorModel';
import { downsampleThermalPoints, simulateThermal } from '../../simulation/math/thermalSim';
import { defaultThermalParams } from '../../simulation/math/thermalRsFlux';
import { formatNumber } from '../../utils/format';

const T_DEMAG = defaultThermalParams.TdemagC;
const T_RUNAWAY = 200;
const CHART_MAX_POINTS = 280;

const LOOP_PRESETS = {
  roomLoad: {
    label: '室温满载',
    ambientC: 25,
    vq: 6,
    loadTorque: 0.25,
  },
  hotAmbient: {
    label: '热柜',
    ambientC: 50,
    vq: 6,
    loadTorque: 0.25,
  },
  overload: {
    label: '过载',
    ambientC: 25,
    vq: 10,
    loadTorque: 0.45,
  },
} as const;

type PresetKey = keyof typeof LOOP_PRESETS;

interface ChartSample {
  t: number;
  windingTempC: number;
  copperLossW: number;
}

/**
 * 热闭环卡：损耗跟着温度跑，才会热失控。
 *
 * 降额卡（ThermalDeratingCard）把 Ploss 钉死，一阶爬升一定收敛。
 * 本卡走 simulateThermal：T↑ → Rs↑ + ψf↓ → Pcu/Pfe↑ → T↑↑。
 */
export function ThermalRunawayCard() {
  const [presetKey, setPresetKey] = useState<PresetKey>('roomLoad');
  const [ambientC, setAmbientC] = useState(LOOP_PRESETS.roomLoad.ambientC);
  const [vq, setVq] = useState(LOOP_PRESETS.roomLoad.vq);
  const [loadTorque, setLoadTorque] = useState(LOOP_PRESETS.roomLoad.loadTorque);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = LOOP_PRESETS[k];
    setAmbientC(p.ambientC);
    setVq(p.vq);
    setLoadTorque(p.loadTorque);
  };

  const result = useMemo(
    () =>
      simulateThermal({
        vd: 0,
        vq,
        loadTorque,
        ambientC,
        initialTempC: ambientC,
        duration: 4,
        dt: 0.002,
        config: { base: defaultPmsmParameters },
      }),
    [vq, loadTorque, ambientC],
  );

  const chartData = useMemo<ChartSample[]>(() => {
    const src = downsampleThermalPoints(result.points, CHART_MAX_POINTS);
    return src.map((p) => ({
      t: Number(p.t.toFixed(3)),
      windingTempC: Number(p.windingTempC.toFixed(2)),
      copperLossW: Number(p.copperLossW.toFixed(3)),
    }));
  }, [result]);

  const runaway = result.thermalRunaway;
  const demag = result.demagAlarmCount > 0;
  const warn = runaway || demag;

  return (
    <Card
      title="热闭环：损耗跟着温度跑，才会热失控"
      eyebrow="thermal loop · Rs PTC × ψf NTC"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="开环卡把 Ploss 钉死；本卡 T→Rs/ψf→Pcu/Pfe→T。Rs +0.393%/K，NdFeB −0.12%/K。失控判据 peak>200°C。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        开环卡把 <span className="formula">P_loss</span> 钉死，曲线一定收敛。
        本卡闭环：<span className="formula">T → Rs/ψf → Pcu/Pfe → T</span>。
        铜绕组 <span className="formula">Rs +0.393%/K</span>（PTC），
        NdFeB <span className="formula">ψf −0.12%/K</span>（NTC）。
        失控判据 <span className="text-accent-fault">peak &gt; 200°C</span>。
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-secondary">工况预设：</span>
        {(Object.keys(LOOP_PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => selectPreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:text-ink'
            }`}
          >
            {LOOP_PRESETS[k].label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-secondary">
        环境 <span className="formula">{formatNumber(ambientC, 0)} °C</span> ·
        vq <span className="formula">{formatNumber(vq, 1)} V</span> ·
        负载 <span className="formula">{formatNumber(loadTorque, 2)} Nm</span> ·
        vd <span className="formula">0 V</span> ·
        时长 <span className="formula">4 s</span>
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>环境温度（°C）</span>
          <span className="formula text-ink-primary">{formatNumber(ambientC, 0)} °C</span>
        </span>
        <input
          type="range" value={ambientC} min={15} max={60} step={1}
          onChange={(e) => setAmbientC(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="ambient temperature"
          aria-valuemin={15} aria-valuemax={60} aria-valuenow={ambientC}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>q 轴电压 vq（V）</span>
          <span className="formula text-ink-primary">{formatNumber(vq, 1)} V</span>
        </span>
        <input
          type="range" value={vq} min={2} max={12} step={0.1}
          onChange={(e) => setVq(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="q-axis voltage"
          aria-valuemin={2} aria-valuemax={12} aria-valuenow={vq}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>负载转矩（Nm）</span>
          <span className="formula text-ink-primary">{formatNumber(loadTorque, 2)} Nm</span>
        </span>
        <input
          type="range" value={loadTorque} min={0.05} max={0.6} step={0.01}
          onChange={(e) => setLoadTorque(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="load torque"
          aria-valuemin={0.05} aria-valuemax={0.6} aria-valuenow={loadTorque}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">稳态温度</p>
          <p className={`formula text-body ${result.steadyTempC > T_DEMAG ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(result.steadyTempC, 1)} °C
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">峰值</p>
          <p className={`formula text-body ${
            runaway ? 'text-accent-fault' : result.peakTempC > T_DEMAG ? 'text-accent-warn' : 'text-accent-primary'
          }`}>
            {formatNumber(result.peakTempC, 1)} °C
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">τ</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.thermalTimeConstant, 2)} s
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">退磁报警次数</p>
          <p className={`formula text-body ${demag ? 'text-accent-fault' : 'text-accent-measure'}`}>
            {result.demagAlarmCount}
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t" type="number" domain={[0, 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (s)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="temp"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'T_winding (°C)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 36 }}
            />
            <YAxis
              yAxisId="pcu"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: 'Pcu (W)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 11, dx: -4, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
              formatter={(v, name) => {
                const n = String(name);
                const unit = n.includes('Pcu') || n.includes('W') ? ' W' : ' °C';
                return [`${Number(v).toFixed(2)}${unit}`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              yAxisId="temp"
              y={T_DEMAG}
              stroke="#ffb84d"
              strokeDasharray="3 3"
              label={{ value: `退磁 ${T_DEMAG}°C`, fill: '#ffb84d', fontSize: 9, position: 'insideTopRight' }}
            />
            <ReferenceLine
              yAxisId="temp"
              y={T_RUNAWAY}
              stroke="#fb7185"
              strokeDasharray="3 3"
              label={{ value: '失控 200°C', fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="windingTempC"
              stroke="#34d6ff"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              name="绕组温度"
            />
            <Line
              yAxisId="pcu"
              type="monotone"
              dataKey="copperLossW"
              stroke="#ffb84d"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Pcu (W)"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        runaway
          ? 'border-accent-fault/40 bg-accent-fault/10'
          : warn
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : 'border-accent-measure/40 bg-accent-measure/10'
      }`}
      >
        {runaway ? (
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-accent-fault" aria-hidden="true" />
        ) : warn ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {runaway ? (
            <span className="text-accent-fault">
              热失控：峰值 {formatNumber(result.peakTempC, 1)}°C &gt; 200°C。Rs PTC + ψf NTC 把铜损越推越高，必须封锁 PWM。
            </span>
          ) : demag ? (
            <span className="text-accent-warn">
              退磁报警 {result.demagAlarmCount} 次：绕组已越过 {T_DEMAG}°C。继续满载会不可逆掉磁，不是只降额就能过。
            </span>
          ) : (
            <span className="text-accent-measure">
              闭环仍收敛：峰值 {formatNumber(result.peakTempC, 1)}°C，稳态 {formatNumber(result.steadyTempC, 1)}°C。铜损随温度爬升但还没顶穿。
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        降额卡把损耗当常数，所以曲线一定收敛。闭环里 Rs 升温变大、同转矩要更大 iq，铜损再推温度——这才是热设计要防的正反馈。
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：NTC 测绕组；Rs 在线辨识随温度改电流环 Ki；超 Tdemag 必须封锁 PWM，不是只降额。
      </p>
    </Card>
  );
}
