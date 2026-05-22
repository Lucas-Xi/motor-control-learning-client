import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import {
  sampleDevicePresets,
  switchingLoss,
  junctionTemperature,
  defaultThermalRC,
} from '../../simulation/math/switchingLoss';
import { formatNumber } from '../../utils/format';

/**
 * IGBT / MOSFET / SiC 三器件损耗对比卡 + 结温读数。
 * 学员调 fsw 滑块看：低频时 IGBT 最低损（导通主导，IGBT V_ce_sat 优势小）；
 * 高频时 SiC 反超（开关损耗主导，SiC 开关速度优势放大）。这就是 SiC 替代 IGBT 的真正驱动力。
 */
export function SwitchingLossCompareCard() {
  const inverter = useSimulationStore((s) => s.inverter);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [Vdc, setVdc] = useState(inverter.uDc ?? 310);
  const [Irms, setIrms] = useState(8);
  const [dutyAvg, setDutyAvg] = useState(0.5);
  const [TcaseC, setTcaseC] = useState(60);

  // 扫描 fsw 从 4 kHz 到 50 kHz
  const sweep = useMemo(() => {
    const N = 24;
    const fMin = 4000;
    const fMax = 50000;
    return Array.from({ length: N + 1 }, (_, k) => {
      const fsw = fMin + ((fMax - fMin) * k) / N;
      const igbt = switchingLoss({
        ...sampleDevicePresets.igbt600v20a,
        fsw,
        Vdc,
        IrmsPhase: Irms,
        dutyAvg,
      });
      const mosfet = switchingLoss({
        ...sampleDevicePresets.mosfetSi600v,
        fsw,
        Vdc,
        IrmsPhase: Irms,
        dutyAvg,
      });
      const sic = switchingLoss({
        ...sampleDevicePresets.sicCarbide900v,
        fsw,
        Vdc,
        IrmsPhase: Irms,
        dutyAvg,
      });
      return {
        fsw_kHz: Number((fsw / 1000).toFixed(1)),
        IGBT: Number(igbt.Ptotal.toFixed(1)),
        MOSFET: Number(mosfet.Ptotal.toFixed(1)),
        SiC: Number(sic.Ptotal.toFixed(1)),
      };
    });
  }, [Vdc, Irms, dutyAvg]);

  // 当前 fsw 工况（取 store 的 pwmFrequency 或默认 16 kHz）的详细结果 + 结温
  const fswCurrent = inverter.pwmFrequency ?? 16000;
  const igbtNow = useMemo(
    () => switchingLoss({ ...sampleDevicePresets.igbt600v20a, fsw: fswCurrent, Vdc, IrmsPhase: Irms, dutyAvg }),
    [fswCurrent, Vdc, Irms, dutyAvg],
  );
  const sicNow = useMemo(
    () => switchingLoss({ ...sampleDevicePresets.sicCarbide900v, fsw: fswCurrent, Vdc, IrmsPhase: Irms, dutyAvg }),
    [fswCurrent, Vdc, Irms, dutyAvg],
  );

  const TjIgbt = junctionTemperature(igbtNow.Ptotal, TcaseC, defaultThermalRC);
  const TjSic = junctionTemperature(sicNow.Ptotal, TcaseC, defaultThermalRC);

  const tjTone = (t: number) => (t < 100 ? 'measure' : t < 125 ? 'warn' : 'fault');
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'IGBT vs MOSFET vs SiC: Loss + Junction Temp' : 'IGBT vs MOSFET vs SiC：损耗 + 结温'}
      eyebrow={isEn ? 'why SiC matters at high frequency' : 'SiC 为啥高频才值'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'Conduction + switching loss breakdown per Infineon AN2008-03; one-pole RC thermal Rth_jc + Rth_ca.'
              : '导通 + 开关损耗按 Infineon AN2008-03 拆分；结温走一阶 RC R_th_jc + R_th_ca。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'At low fsw, IGBT wins on cost & conduction loss. At high fsw, SiC\'s fast switching + low Coss outshine — typical crossover ~20 kHz. Drag Vdc/Irms/duty to find your design sweet spot.'
          : '低 fsw 时 IGBT 凭成本 + 导通损取胜；高 fsw 时 SiC 凭快开关 + 低 Coss 反超。典型交叉点 ~20 kHz。拖 Vdc/Irms/duty 找你设计的甜区。'}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>Vdc</span>
            <span className="formula text-ink-primary">{formatNumber(Vdc, 0)} V</span>
          </span>
          <input type="range" value={Vdc} min={200} max={800} step={10}
            onChange={(e) => setVdc(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="DC bus voltage"
            aria-valuemin={200} aria-valuemax={800} aria-valuenow={Vdc} aria-valuetext={`${Vdc} V`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>Irms</span>
            <span className="formula text-ink-primary">{formatNumber(Irms, 1)} A</span>
          </span>
          <input type="range" value={Irms} min={1} max={25} step={0.5}
            onChange={(e) => setIrms(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="phase RMS current"
            aria-valuemin={1} aria-valuemax={25} aria-valuenow={Irms} aria-valuetext={`${Irms} A`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>duty</span>
            <span className="formula text-ink-primary">{formatNumber(dutyAvg, 2)}</span>
          </span>
          <input type="range" value={dutyAvg} min={0.1} max={0.95} step={0.05}
            onChange={(e) => setDutyAvg(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="average duty"
            aria-valuemin={0.1} aria-valuemax={0.95} aria-valuenow={dutyAvg} aria-valuetext={`${dutyAvg}`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'Case T' : 'Case 温'}</span>
            <span className="formula text-ink-primary">{formatNumber(TcaseC, 0)} °C</span>
          </span>
          <input type="range" value={TcaseC} min={20} max={120} step={5}
            onChange={(e) => setTcaseC(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="case temperature"
            aria-valuemin={20} aria-valuemax={120} aria-valuenow={TcaseC} aria-valuetext={`${TcaseC} °C`}
          />
        </label>
      </div>

      <div className="mb-3 h-44">
        <SafeResponsiveContainer>
          <LineChart data={sweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="fsw_kHz" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" kHz" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" W" />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={fswCurrent / 1000} stroke="#9eb5cb" strokeDasharray="2 4" label={{ value: 'now', fill: '#9eb5cb', fontSize: 10, position: 'top' }} />
            <Line type="monotone" dataKey="IGBT" stroke="#34d6ff" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="MOSFET" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="SiC" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg border p-2 ${toneClass(tjTone(TjIgbt))}`}>
          <p className="text-caption opacity-80">IGBT · {igbtNow.dominant}</p>
          <p className="formula text-body">
            {formatNumber(igbtNow.Ptotal, 1)} W · Tj {formatNumber(TjIgbt, 0)}°C
          </p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(tjTone(TjSic))}`}>
          <p className="text-caption opacity-80">SiC · {sicNow.dominant}</p>
          <p className="formula text-body">
            {formatNumber(sicNow.Ptotal, 1)} W · Tj {formatNumber(TjSic, 0)}°C
          </p>
        </div>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? `At ${formatNumber(fswCurrent / 1000, 0)} kHz, IGBT/SiC junction temps are ${formatNumber(TjIgbt, 0)}°C / ${formatNumber(TjSic, 0)}°C respectively. IGBT max Tj typically 150°C; SiC can sustain 175°C+. Stay below 125°C for long-life designs.`
          : `当前 ${formatNumber(fswCurrent / 1000, 0)} kHz 下 IGBT/SiC 结温 ${formatNumber(TjIgbt, 0)}°C / ${formatNumber(TjSic, 0)}°C。IGBT max Tj 通常 150°C；SiC 能撑 175°C+。长寿命设计建议 < 125°C。`}
      </p>
    </Card>
  );
}
