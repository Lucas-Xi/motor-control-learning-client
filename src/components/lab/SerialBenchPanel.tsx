import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Plug, PlugZap, Download, Trash2, AlertTriangle, Radio, Eraser } from 'lucide-react';
import { useSerialStore } from '../../store/serialStore';
import { simulateCurrentLoop } from '../../simulation/math/motorModel';
import { SafeResponsiveContainer } from '../charts/SafeResponsiveContainer';
import { downloadText, toCsv, timestamp } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * 实测对照面板（17 号模块的"实测对照" Tab）。
 *
 * 设计要点：
 *  - 顶部 status strip：连接按钮 + 数据源标签 + 采样率 + 缓冲使用率；
 *  - 主体 4 路波形（Ia / Iq / Id / θ_e），每路同时画"实测"与"仿真"两条线，
 *    颜色对应视觉令牌：accent.measure (mint) = 测量值；accent.primary (cyan) = 仿真；
 *  - 误差面板：在最近 N 帧上算 RMSE，超阈值显示 accent.warn 提示；
 *  - 导出按钮：把整个 buffer dump 成 CSV（复用 src/utils/download.ts）。
 *
 * 可达性：所有按钮 `aria-label` + `<input type="range">` 略；本面板不提供滑块。
 * 浏览器不兼容：UI 上方常驻提示一行，连接按钮文字自动切到"切换 Mock 数据源"。
 */
export function SerialBenchPanel() {
  const connected = useSerialStore((s) => s.connected);
  const source = useSerialStore((s) => s.source);
  const portLabel = useSerialStore((s) => s.portLabel);
  const sampleRateHz = useSerialStore((s) => s.sampleRateHz);
  const buffer = useSerialStore((s) => s.buffer);
  const lastError = useSerialStore((s) => s.lastError);
  const webSerialSupported = useSerialStore((s) => s.webSerialSupported);
  const connect = useSerialStore((s) => s.connect);
  const disconnect = useSerialStore((s) => s.disconnect);
  const clearBuffer = useSerialStore((s) => s.clearBuffer);

  const [pending, setPending] = useState(false);

  // 仿真参考曲线：120 ms 的 Iq 阶跃响应，与实测同 t 轴对齐显示。
  // 用 useMemo 缓存 —— PI 增益固定，重算只在组件第一次挂载时发生。
  const simSeries = useMemo(() => simulateCurrentLoop(0, 4, { kp: 0.8, ki: 50, kd: 0 }, 0.12), []);

  /** 实测样本 + 同 t 轴上的仿真值。 */
  type Row = {
    t_ms: number;
    ia_meas?: number;
    iq_meas?: number;
    id_meas?: number;
    theta_meas?: number;
    ia_sim?: number;
    iq_sim?: number;
    id_sim?: number;
    theta_sim?: number;
  };

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    // 把实测 t_ms 归零到 buffer[0]，避免横轴漂到几百秒。
    const t0 = buffer[0].t_ms;
    // 仿真序列时间从 0 开始，单位 ms；按时间 mod 总时长循环 lookup。
    const simSpan = simSeries[simSeries.length - 1]?.t ?? 60;
    return buffer.map((sample) => {
      const tRel = sample.t_ms - t0;
      // 找到仿真序列里最接近的一帧（线性扫描 → 序列长度 ~80，开销可忽略）。
      const tMod = ((tRel % simSpan) + simSpan) % simSpan;
      let best = simSeries[0];
      for (const s of simSeries) {
        if (Math.abs(s.t - tMod) < Math.abs(best.t - tMod)) best = s;
      }
      // 仿真 ia 由仿真 iq/id 反 Park + 反 Clarke 算出；θ 用当前帧 θ_e（如有）。
      const theta = sample.theta_e ?? 0;
      const ialphaSim = best.id * Math.cos(theta) - best.iq * Math.sin(theta);
      const ibetaSim = best.id * Math.sin(theta) + best.iq * Math.cos(theta);
      const iaSim = ialphaSim;
      return {
        t_ms: tRel,
        ia_meas: sample.ia,
        iq_meas: sample.iq,
        id_meas: sample.id,
        theta_meas: sample.theta_e,
        ia_sim: iaSim,
        iq_sim: best.iq,
        id_sim: best.id,
        theta_sim: theta,
      };
    });
  }, [buffer, simSeries]);

  /** RMSE：对最近 128 帧的 ia/iq/id 做误差均方根。 */
  const rmse = useMemo(() => {
    const n = Math.min(rows.length, 128);
    if (n === 0) return { ia: 0, iq: 0, id: 0 };
    const tail = rows.slice(rows.length - n);
    const acc = { ia: 0, iq: 0, id: 0 };
    let cnt = 0;
    for (const r of tail) {
      if (r.ia_meas != null && r.ia_sim != null) {
        const d = r.ia_meas - r.ia_sim;
        acc.ia += d * d;
      }
      if (r.iq_meas != null && r.iq_sim != null) {
        const d = r.iq_meas - r.iq_sim;
        acc.iq += d * d;
      }
      if (r.id_meas != null && r.id_sim != null) {
        const d = r.id_meas - r.id_sim;
        acc.id += d * d;
      }
      cnt += 1;
    }
    return {
      ia: Math.sqrt(acc.ia / cnt),
      iq: Math.sqrt(acc.iq / cnt),
      id: Math.sqrt(acc.id / cnt),
    };
  }, [rows]);

  // 离开页面 / 模块切换时自动断开，避免后台仍跑 mock interval。
  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  const onToggleConnect = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (connected) {
        await disconnect();
      } else {
        // 不支持 Web Serial → 自动 mock；支持但用户在浏览器外环境也会自动 fallback。
        await connect({ baud: 921600, mock: !webSerialSupported });
      }
    } catch {
      // 错误已记入 store.lastError，由 UI 顶部 banner 显示
    } finally {
      setPending(false);
    }
  };

  const onConnectMock = async () => {
    if (pending || connected) return;
    setPending(true);
    try {
      await connect({ mock: true });
    } catch {
      // 错误已记入 store.lastError
    } finally {
      setPending(false);
    }
  };

  const onExport = () => {
    if (buffer.length === 0) return;
    const csv = toCsv(
      buffer.map((s) => ({
        t_ms: s.t_ms.toFixed(3),
        ia: (s.ia ?? '').toString(),
        ib: (s.ib ?? '').toString(),
        ic: (s.ic ?? '').toString(),
        iq: s.iq != null ? s.iq.toFixed(4) : '',
        id: s.id != null ? s.id.toFixed(4) : '',
        theta_e: s.theta_e != null ? s.theta_e.toFixed(4) : '',
      })),
      ['t_ms', 'ia', 'ib', 'ic', 'iq', 'id', 'theta_e'],
    );
    downloadText(`serial-bench-${timestamp()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const bufferPct = Math.min(100, Math.round((buffer.length / 512) * 100));
  const sourceLabel =
    source === 'web-serial'
      ? `Web Serial · ${portLabel ?? ''}`
      : source === 'mock'
        ? 'Mock 数据源（仿真合成）'
        : '未连接';

  return (
    <section
      className="space-y-3 rounded-2xl border border-line-subtle bg-bg-surface p-4"
      aria-label="实测对照面板"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-line-subtle text-accent-primary">
            <Radio className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="font-display text-title text-ink-primary">实测对照</h2>
        </div>
        <span className="text-caption text-ink-muted">
          STM32 串口（ASCII · 921600 8N1） · 与本机仿真曲线并排对比
        </span>
      </header>

      {!webSerialSupported && (
        <p className="rounded-lg border border-accent-warn/40 bg-accent-warn/10 px-3 py-2 text-caption text-accent-warn">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          当前浏览器不支持 Web Serial（仅 Chrome / Edge 桌面端可用）—— 已自动切换到 Mock
          数据源。如需真板测试请改用 Chromium 系浏览器或 Electron 客户端。
        </p>
      )}
      {lastError && (
        <p
          className="rounded-lg border border-accent-fault/40 bg-accent-fault/10 px-3 py-2 text-caption text-accent-fault"
          role="alert"
        >
          串口错误：{lastError}
        </p>
      )}

      {/* 顶部状态条：连接按钮 + 源 + 采样率 + 缓冲使用率 */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="text-caption text-ink-muted">连接状态</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleConnect}
              disabled={pending}
              aria-label={connected ? '断开串口连接' : '连接串口设备'}
              aria-pressed={connected}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-body font-medium transition-colors ${
                connected
                  ? 'border-accent-measure/60 bg-accent-measure/15 text-accent-measure'
                  : 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
              } disabled:opacity-50`}
            >
              {connected ? <PlugZap className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
              <span>{connected ? '已连接' : webSerialSupported ? '连接设备' : '启动 Mock'}</span>
            </button>
            {webSerialSupported && !connected && (
              <button
                type="button"
                onClick={onConnectMock}
                disabled={pending}
                aria-label="启动 Mock 数据源（不连接真板）"
                className="rounded-lg border border-line-subtle px-2 py-1 text-caption text-ink-secondary hover:border-line-strong"
              >
                Mock
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="text-caption text-ink-muted">数据源</span>
          <span
            className={`truncate text-body font-medium ${
              source === 'web-serial'
                ? 'text-accent-measure'
                : source === 'mock'
                  ? 'text-accent-primary'
                  : 'text-ink-secondary'
            }`}
            title={sourceLabel}
          >
            {sourceLabel}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="text-caption text-ink-muted">实测采样率</span>
          <span className="formula text-body font-medium text-ink-primary">
            {formatNumber(sampleRateHz, 1)} Hz
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="text-caption text-ink-muted">缓冲区 ({buffer.length} / 512)</span>
          <div className="flex h-3 items-center gap-2">
            <div
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg-base ring-1 ring-line-subtle"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={bufferPct}
              aria-label={`缓冲区使用率 ${bufferPct}%`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-accent-primary"
                style={{ width: `${bufferPct}%` }}
              />
            </div>
            <span className="text-caption text-ink-muted">{bufferPct}%</span>
          </div>
        </div>
      </div>

      {/* 4 路实测/仿真对比波形 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CompareChart
          title="Ia 相电流"
          unit="A"
          rows={rows}
          measKey="ia_meas"
          simKey="ia_sim"
        />
        <CompareChart
          title="Iq 交轴电流"
          unit="A"
          rows={rows}
          measKey="iq_meas"
          simKey="iq_sim"
        />
        <CompareChart
          title="Id 直轴电流"
          unit="A"
          rows={rows}
          measKey="id_meas"
          simKey="id_sim"
        />
        <CompareChart
          title="θe 电角度"
          unit="rad"
          rows={rows}
          measKey="theta_meas"
          simKey="theta_sim"
        />
      </div>

      {/* 误差面板 */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <ErrorTile label="|Ia| RMSE" value={rmse.ia} warnAt={0.5} faultAt={1.0} unit="A" />
        <ErrorTile label="|Iq| RMSE" value={rmse.iq} warnAt={0.4} faultAt={0.8} unit="A" />
        <ErrorTile label="|Id| RMSE" value={rmse.id} warnAt={0.4} faultAt={0.8} unit="A" />
      </div>

      {/* 工具栏：清空 / 导出 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={clearBuffer}
          disabled={buffer.length === 0}
          aria-label="清空实测缓冲区"
          className="flex items-center gap-1.5 rounded-lg border border-line-subtle bg-bg-base px-2.5 py-1 text-body text-ink-secondary hover:border-line-strong disabled:opacity-50"
        >
          <Eraser className="h-4 w-4" aria-hidden />
          清空缓冲
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={buffer.length === 0}
          aria-label="导出实测数据为 CSV"
          className="flex items-center gap-1.5 rounded-lg border border-accent-primary/60 bg-accent-primary/10 px-2.5 py-1 text-body text-accent-primary hover:bg-accent-primary/20 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          导出实测 CSV
        </button>
        {connected && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={pending}
            aria-label="断开当前数据源"
            className="flex items-center gap-1.5 rounded-lg border border-accent-fault/40 bg-accent-fault/5 px-2.5 py-1 text-body text-accent-fault hover:bg-accent-fault/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            断开
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * 单 trace 对比卡：左 title，主体一张 LineChart，两条线（实测 mint / 仿真 cyan）。
 * 用 SafeResponsiveContainer 避免首帧 -1 警告。
 */
type Row = {
  t_ms: number;
  ia_meas?: number;
  iq_meas?: number;
  id_meas?: number;
  theta_meas?: number;
  ia_sim?: number;
  iq_sim?: number;
  id_sim?: number;
  theta_sim?: number;
};

function CompareChart({
  title,
  unit,
  rows,
  measKey,
  simKey,
}: {
  title: string;
  unit: string;
  rows: Row[];
  measKey: keyof Row;
  simKey: keyof Row;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-3 rounded bg-accent-measure" />
            实测
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ background: 'var(--accent-primary)', borderTop: '1px dashed' }}
            />
            仿真
          </span>
        </span>
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} unit={` ${unit}`} width={48} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line
              type="monotone"
              dataKey={simKey as string}
              dot={false}
              stroke="var(--accent-primary)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              isAnimationActive={false}
              name="仿真"
            />
            <Line
              type="monotone"
              dataKey={measKey as string}
              dot={false}
              stroke="var(--accent-measure)"
              strokeWidth={1.8}
              isAnimationActive={false}
              name="实测"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function ErrorTile({
  label,
  value,
  warnAt,
  faultAt,
  unit,
}: {
  label: string;
  value: number;
  warnAt: number;
  faultAt: number;
  unit: string;
}) {
  const tone: 'measure' | 'warn' | 'fault' =
    value >= faultAt ? 'fault' : value >= warnAt ? 'warn' : 'measure';
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : 'var(--accent-measure)';
  // 状态形状区分（色盲友好）：fault → ▲ ; warn → ◆ ; measure → ●
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const srLabel = tone === 'fault' ? '严重偏差' : tone === 'warn' ? '警告偏差' : '在合理范围';
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color }}>
        <span aria-hidden className="mr-1">
          {shape}
        </span>
        {formatNumber(value, 3)} {unit}
        <span className="sr-only"> · {srLabel}</span>
      </p>
    </div>
  );
}
