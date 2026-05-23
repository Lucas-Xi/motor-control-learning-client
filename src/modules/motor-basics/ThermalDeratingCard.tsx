import { useMemo, useState } from 'react';
import { Area, ComposedChart, CartesianGrid, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2, Thermometer } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
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
    ? { tone: 'bad', label: '退磁告警', Icon: AlertOctagon, msg: `T = ${Tprobe.toFixed(0)}°C > ${defaultThermalParams.TdemagC}°C 阈值 → NdFeB 永磁不可逆退磁，电机损坏。主控必须立刻断电、停机降温。` }
    : comp.demagMarginK < 20
    ? { tone: 'warn', label: '接近阈值', Icon: AlertTriangle, msg: `距退磁阈值仅剩 ${comp.demagMarginK.toFixed(0)} K，长时间满载 + 高环境温度会越界，建议降额或加强散热。` }
    : { tone: 'good', label: '余量充足', Icon: CheckCircle2, msg: `距退磁阈值 ${comp.demagMarginK.toFixed(0)} K 余量，参数变化在补偿可处理范围内。` };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title="温度对电机参数的影响：Rs(T) ↑ + ψf(T) ↓ + 退磁告警"
      eyebrow="thermal derating · real motor reality"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="铜 PTC α=0.00393/K + NdFeB NTC β=0.0012/K + N50 退磁阈值 100°C + 一阶热模型 R_th=0.5 K/W / τ=600 s（IEC 60034-1）。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        基准参数（25°C 冷机）<span className="formula">Rs = {RS_BASE} Ω</span>、
        <span className="formula"> ψf = {FLUX_BASE} Wb</span>。
        热起来之后铜电阻 PTC 上扬、永磁磁链 NTC 下降——FOC 不补偿就出现"冷机调好的 Iq 命令热机算少了"的偏差，
        而真正致命的是 <span className="text-accent-fault">退磁阈值 ~100°C</span>：越过即 NdFeB 不可逆掉磁，电机永久损坏。
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" />绕组温度 T_w</span>
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
            aria-label="winding temperature"
            aria-valuemin={25}
            aria-valuemax={150}
            aria-valuenow={Tprobe}
            aria-valuetext={`${Tprobe} celsius`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>持续损耗 P_loss（铜 + 铁）</span>
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
            aria-label="continuous loss"
            aria-valuemin={20}
            aria-valuemax={250}
            aria-valuenow={Ploss}
            aria-valuetext={`${Ploss} watt`}
          />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className={`rounded-lg border p-2 ${comp.rsRisePct > 30 ? toneClass('warn') : toneClass('good')}`}>
          <p className="text-caption opacity-80">Rs（当前）</p>
          <p className="formula text-body">{formatNumber(comp.rs, 4)} Ω</p>
          <p className="text-[10px] opacity-75">基准 +{formatNumber(comp.rsRisePct, 1)}%（PTC）</p>
        </div>
        <div className={`rounded-lg border p-2 ${comp.fluxDropPct > 10 ? toneClass('warn') : toneClass('good')}`}>
          <p className="text-caption opacity-80">ψf（当前）</p>
          <p className="formula text-body">{formatNumber(comp.flux, 5)} Wb</p>
          <p className="text-[10px] opacity-75">基准 −{formatNumber(comp.fluxDropPct, 1)}%（NTC）</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(status.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{status.label}</span>
          </div>
          <p className="formula text-body">余量 {formatNumber(comp.demagMarginK, 0)} K</p>
          <p className="text-[10px] leading-snug opacity-90">{status.msg}</p>
        </div>
      </div>

      <p className="mb-1 text-caption text-ink-muted">
        一阶热模型 60 分钟爬升（满载 {Ploss} W，τ=600 s 时间常数）：冷启动 25°C 环境 vs 热环境 50°C
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
              label={{ value: `退磁阈值 ${defaultThermalParams.TdemagC}°C`, fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }} />
            <ReferenceLine y={80} stroke="#ffb84d" strokeDasharray="3 3"
              label={{ value: '警戒 80°C', fill: '#ffb84d', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="Tcool" stroke="#34d6ff" strokeWidth={1.8} dot={false} isAnimationActive={false} name="冷启动 25°C 环境" />
            <Line type="monotone" dataKey="Thot" stroke="#fb7185" strokeWidth={1.8} dot={false} isAnimationActive={false} name="热环境 50°C 环境" />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
        <div className={`rounded border px-2 py-1.5 ${toneClass(TcoolFinal > defaultThermalParams.TdemagC ? 'bad' : TcoolFinal > 80 ? 'warn' : 'good')}`}>
          冷启动 60 分钟稳态：<span className="formula font-bold">{formatNumber(TcoolFinal, 1)}°C</span>
          {TcoolFinal > defaultThermalParams.TdemagC && '（已越退磁阈值）'}
        </div>
        <div className={`rounded border px-2 py-1.5 ${toneClass(hotExceedsDemag ? 'bad' : ThotFinal > 80 ? 'warn' : 'good')}`}>
          热环境 60 分钟稳态：<span className="formula font-bold">{formatNumber(ThotFinal, 1)}°C</span>
          {hotExceedsDemag && '（已越退磁阈值，必须降额或加强散热）'}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：温度从绕组 NTC 串口读到主控
        → 用 <span className="formula">compensateForTemperature</span> 算出当前 Rs / ψf
        → 灌进电流环 PI 解耦项 + BEMF 反算。退磁告警必须在
        <span className="text-accent-fault"> ISR 内联硬件级断电</span>（晚 1 ms 都可能造成永久损坏）。
      </p>
    </Card>
  );
}
