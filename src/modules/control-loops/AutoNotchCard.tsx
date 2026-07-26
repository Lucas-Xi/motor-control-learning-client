import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, AlertOctagon, Radar } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  sampleComplianceParams,
  resonanceFrequencies,
  type ComplianceParams,
} from '../../simulation/math/mechanicalCompliance';
import { autoNotchSearch } from '../../simulation/math/autoNotch';
import { simulateNotchSweep } from '../../simulation/math/resonanceSuppression';
import { formatNumber } from '../../utils/format';

const KT = 1.5 * 4 * 0.045;   // 与其他卡片一致：p=4, ψf=0.045 → 0.27 N·m/A

// 只取柔性传动预设：directDriveCompressor 共振 > 3 kHz，超出扫频 Nyquist，也不需要陷波
type PresetKey = 'industrialFanBelt' | 'roboticJoint' | 'agedDrive';

const PRESET_LABELS: Record<PresetKey, string> = {
  industrialFanBelt: '工业风机皮带（标称 ~298 Hz）',
  roboticJoint: '机器人关节谐波减速器（~191 Hz）',
  agedDrive: '老化传动（~139 Hz）',
};

// 扫频辨识参数：fs=2 kHz 下 Nyquist 1 kHz，覆盖三个预设 ±30% 刚度漂移后的共振范围
const SCAN = {
  fs: 2000,
  freqMin: 10,
  freqMax: 600,
  scanDurationSec: 1.0,
  chirpAmplitude: 0.5,
};

interface MergedSample {
  tMs: number;
  omegaFixed: number;
  omegaAuto: number;
}

/**
 * 自动陷波辨识卡（round-24）：ResonanceNotchCard 结尾埋的钩子——
 * "在线共振辨识 → 自适应陷波中心"——在这里落地。
 *
 * 剧情：出厂时陷波中心按标称共振标定；现场温度 / 老化让轴系刚度 Ks 漂移，
 * 真实共振点移走 → 固定陷波失准。扫频辨识（chirp 激励 + 频谱找峰）重新
 * 定位共振，自适应陷波恢复抑制。拖"刚度漂移"滑块直接看两条曲线分道扬镳。
 */
export function AutoNotchCard() {
  const [presetKey, setPresetKey] = useState<PresetKey>('roboticJoint');
  const [driftPct, setDriftPct] = useState(-20);
  const [Q, setQ] = useState(8);

  const nominal: ComplianceParams = sampleComplianceParams[presetKey];
  const frNominal = resonanceFrequencies(nominal).resonanceHz;

  // 现场真实传动：刚度漂移后的参数（温度上升 / 联轴器老化 → Ks 降）
  const real: ComplianceParams = useMemo(
    () => ({ ...nominal, Ks: nominal.Ks * (1 + driftPct / 100) }),
    [nominal, driftPct],
  );
  const frReal = resonanceFrequencies(real).resonanceHz;

  // 扫频辨识：chirp 激励真实传动 → 频谱找峰。
  // backlash 置 0 对应真实产线做法：扫频前加预紧转矩让齿面保持啮合，
  // 否则弹簧在过零激励下反复脱开，非线性把谱峰抹花、抓错频率。
  const scan = useMemo(
    () => autoNotchSearch({ compliance: { ...real, backlashRad: 0 }, ...SCAN }),
    [real],
  );
  const frIdentified = scan.resonanceHz ?? frReal;

  // simulateNotchSweep 的 detuneFrac 以"真实共振"为基准：
  //   固定陷波钉在出厂标称频率 → detune = frNominal/frReal − 1（漂移越大失配越大）
  //   自适应陷波钉在辨识结果 → detune = frIdentified/frReal − 1（辨识准则 ≈ 0）
  const fixed = useMemo(() => simulateNotchSweep({
    params: real, omegaRefRadS: 100, Kp: 1.2, Ki: 15, Kt: KT, durationSec: 0.3, dtSec: 1e-4,
    useNotch: true, Q, detuneFrac: frNominal / frReal - 1,
  }), [real, Q, frNominal, frReal]);
  const auto = useMemo(() => simulateNotchSweep({
    params: real, omegaRefRadS: 100, Kp: 1.2, Ki: 15, Kt: KT, durationSec: 0.3, dtSec: 1e-4,
    useNotch: true, Q, detuneFrac: frIdentified / frReal - 1,
  }), [real, Q, frIdentified, frReal]);

  const merged = useMemo<MergedSample[]>(() => {
    const N = Math.min(fixed.samples.length, auto.samples.length);
    const arr: MergedSample[] = [];
    for (let i = 0; i < N; i += 1) {
      arr.push({
        tMs: fixed.samples[i].tMs,
        omegaFixed: Number(fixed.samples[i].omegaMotor.toFixed(2)),
        omegaAuto: Number(auto.samples[i].omegaMotor.toFixed(2)),
      });
    }
    return arr;
  }, [fixed, auto]);

  // 频谱图数据（限制点数）
  const spectrumData = useMemo(
    () => scan.spectrum.map((p) => ({ freq: Number(p.freq.toFixed(1)), mag: Number(p.mag.toFixed(4)) })),
    [scan],
  );

  const idErrPct = frReal > 1e-6 ? Math.abs(frIdentified - frReal) / frReal * 100 : 0;
  const rmsGainPct = fixed.rmsErrorRadS > 1e-6
    ? Math.max(0, (1 - auto.rmsErrorRadS / fixed.rmsErrorRadS) * 100)
    : 0;

  const status = idErrPct <= 5 && rmsGainPct >= 30
    ? { tone: 'good', Icon: CheckCircle2, label: '辨识命中', hint: '谱峰对准真实共振，自适应陷波接管后振铃消失。' }
    : idErrPct <= 5
    ? { tone: 'warn', Icon: AlertTriangle, label: '辨识准但收益小', hint: '漂移本身不大或 Q 太宽——固定陷波还没完全失准。' }
    : { tone: 'bad', Icon: AlertOctagon, label: '辨识偏差大', hint: '扫频幅值不足 / 频段没盖住共振 / 谱分辨率不够（加长扫频时长）。' };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title="扫频辨识 × 自适应陷波：漂移之后谁来对准"
      eyebrow="chirp identification · adaptive notch"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="chirp 转矩激励双质量模型 → 单边幅值谱找峰 → 与解析共振交叉确认（±20% 内取模型值）。对应 STM32 上的 FFT / Goertzel 在线辨识。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        上一张卡的陷波中心是<span className="text-accent-warn">出厂标定死的</span>。现场温度爬升、
        联轴器老化让刚度 K<sub>s</sub> 漂移，真实共振点移走——固定陷波变成"陷在空处"。
        对策：注入<span className="text-accent-primary"> chirp 扫频</span>激励，从速度响应谱里
        重新找峰，把陷波中心搬过去。
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">传动预设：</span>
        {(Object.keys(PRESET_LABELS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPresetKey(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {PRESET_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>刚度漂移 ΔKs</span>
            <span className="formula text-ink-primary">{driftPct > 0 ? '+' : ''}{formatNumber(driftPct, 0)}%</span>
          </span>
          <input type="range" value={driftPct} min={-30} max={30} step={1}
            onChange={(e) => setDriftPct(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="stiffness drift" aria-valuemin={-30} aria-valuemax={30} aria-valuenow={driftPct} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>陷波 Q</span>
            <span className="formula text-ink-primary">{formatNumber(Q, 1)}</span>
          </span>
          <input type="range" value={Q} min={2} max={20} step={0.5}
            onChange={(e) => setQ(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="notch Q" aria-valuemin={2} aria-valuemax={20} aria-valuenow={Q} />
        </label>
      </div>

      <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <Radar className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
        <span>
          标称 <span className="formula">{formatNumber(frNominal, 0)} Hz</span> →
          真实 <span className="formula text-accent-fault">{formatNumber(frReal, 0)} Hz</span> ·
          扫频辨识 <span className="formula text-accent-measure">{formatNumber(frIdentified, 0)} Hz</span>
          （误差 {formatNumber(idErrPct, 1)}%）
        </span>
      </p>

      <div className="h-36">
        <SafeResponsiveContainer>
          <LineChart data={spectrumData} margin={{ top: 8, right: 16, bottom: 14, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="freq"
              type="number"
              domain={[SCAN.freqMin, SCAN.freqMax]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'f (Hz)', position: 'insideBottom', offset: -4, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={44} />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `f = ${Number(v).toFixed(1)} Hz`}
              formatter={(v) => [`${Number(v).toFixed(4)}`, '幅值']}
            />
            <ReferenceLine x={frNominal} stroke="#fbbf24" strokeDasharray="4 3"
              label={{ value: '出厂标定', fill: '#fbbf24', fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine x={frIdentified} stroke="#43f7b5"
              label={{ value: '辨识峰', fill: '#43f7b5', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="mag" stroke="#38bdf8" strokeWidth={1.2} dot={false} isAnimationActive={false} name="扫频速度响应谱" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-2 h-44">
        <SafeResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 14, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMs"
              type="number"
              domain={[0, 300]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (ms)', position: 'insideBottom', offset: -4, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={['auto', 'auto']} width={44} />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(1)} ms`}
              formatter={(v) => `${Number(v).toFixed(2)} rad/s`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine y={100} stroke="#5d7793" strokeDasharray="2 3"
              label={{ value: 'ref 100', fill: '#9eb5cb', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="omegaFixed" stroke="#fbbf24" strokeWidth={1.4} dot={false} isAnimationActive={false} name="ω 固定陷波（出厂标定）" />
            <Line type="monotone" dataKey="omegaAuto" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} name="ω 自适应陷波（扫频辨识）" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">固定陷波 RMS</p>
          <p className="formula text-body text-accent-warn">{formatNumber(fixed.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">中心 {formatNumber(fixed.notchCenterHz, 0)} Hz（离真实 {formatNumber(Math.abs(fixed.notchCenterHz - frReal), 0)} Hz）</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">自适应陷波 RMS</p>
          <p className="formula text-body text-accent-measure">{formatNumber(auto.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">中心 {formatNumber(auto.notchCenterHz, 0)} Hz · RMS 再降 {formatNumber(rmsGainPct, 0)}%</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(status.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{status.label}</span>
          </div>
          <p className="formula text-body">辨识误差 {formatNumber(idErrPct, 1)}%</p>
          <p className="text-[10px] leading-snug opacity-90">{status.hint}</p>
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：产线全频扫太慢，量产固件常用
        <span className="formula"> Goertzel </span>只算疑似共振附近 10-20 个 bin（比全 FFT 省一个量级 RAM）；
        扫频只在<span className="text-accent-fault">停机自检 / 维护模式</span>做，运行中改用振铃能量检测触发重辨识。
        辨识出的中心频率写 Flash 参数区，重启后陷波直接热加载。
      </p>
    </Card>
  );
}
