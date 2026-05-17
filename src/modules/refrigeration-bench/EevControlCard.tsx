import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateEevPi, type EevSample } from '../../simulation/math/eevController';
import { formatNumber } from '../../utils/format';

// 默认控制器参数（任务规约）
const DEFAULTS = {
  kp: 1.5,
  ki: 4,
  targetSH: 5,
  initialSH: 12,
  dt: 0.05,
  durationSec: 15,
  systemTau: 1.8,
  systemGain: 0.04,
  initialSteps: 200,
};

const SETTLE_BAND_K = 0.5; // ±0.5K 进入稳态判定

/**
 * 求达到 ±SETTLE_BAND_K 误差所需时间。
 * 取最后一次离开 ±0.5K 误差带后的时间——即往后所有点都在带内的"首次进入时刻"。
 */
function computeSettleTime(samples: EevSample[], target: number): number | null {
  let lastOutsideIdx = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i].sh - target) > SETTLE_BAND_K) {
      lastOutsideIdx = i;
    }
  }
  if (lastOutsideIdx < 0) return 0; // 始终在带内
  if (lastOutsideIdx >= samples.length - 1) return null; // 仿真结束仍未稳
  return samples[lastOutsideIdx + 1].t;
}

/**
 * EEV PI 控制环演示卡片。
 * - 4 个滑块：Kp / Ki / 目标 SH / 起始扰动 SH
 * - 双 Y 轴：左 SH (K)（含目标虚线），右 EEV 步数 0~500
 * - 顶部显示稳态偏差与 ±0.5K 进带时间
 *
 * 与 Zustand 解耦：所有状态本地 useState 管理，仅做"参数 → 时域响应"的纯计算演示。
 */
export function EevControlCard() {
  const [kp, setKp] = useState(DEFAULTS.kp);
  const [ki, setKi] = useState(DEFAULTS.ki);
  const [targetSH, setTargetSH] = useState(DEFAULTS.targetSH);
  const [initialSH, setInitialSH] = useState(DEFAULTS.initialSH);

  const samples = useMemo(
    () =>
      simulateEevPi({
        kp,
        ki,
        targetSH,
        initialSH,
        initialSteps: DEFAULTS.initialSteps,
        dt: DEFAULTS.dt,
        durationSec: DEFAULTS.durationSec,
        systemTau: DEFAULTS.systemTau,
        systemGain: DEFAULTS.systemGain,
      }),
    [kp, ki, targetSH, initialSH],
  );

  const lastSh = samples.length > 0 ? samples[samples.length - 1].sh : initialSH;
  const steadyErr = lastSh - targetSH;
  const settleTime = useMemo(() => computeSettleTime(samples, targetSH), [samples, targetSH]);

  return (
    <Card title="EEV PI 控制环" eyebrow="electronic expansion valve" density="compact">
      {/* 头部 metric 行 —— 颜色 + 形状 + sr-only 三通道（色盲/打印友好） */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-caption">
        {(() => {
          const errStatus = Math.abs(steadyErr) < SETTLE_BAND_K ? 'measure' : Math.abs(steadyErr) < 1.5 ? 'warn' : 'fault';
          const ErrIcon = errStatus === 'measure' ? CheckCircle2 : errStatus === 'warn' ? AlertTriangle : AlertOctagon;
          const errCls = errStatus === 'measure' ? 'text-accent-measure' : errStatus === 'warn' ? 'text-accent-warn' : 'text-accent-fault';
          const errSr = errStatus === 'measure' ? '收敛' : errStatus === 'warn' ? '偏差偏大' : '严重偏离';
          return (
            <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
              <div className="text-ink-muted">稳态偏差 ΔSH</div>
              <div className={`flex items-center gap-1 font-mono ${errCls}`}>
                <ErrIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">{errSr}：</span>
                {formatNumber(steadyErr, 2)} K
              </div>
            </div>
          );
        })()}
        {(() => {
          const tStatus = settleTime === null ? 'fault' : settleTime < 5 ? 'measure' : 'warn';
          const TIcon = tStatus === 'measure' ? CheckCircle2 : tStatus === 'warn' ? AlertTriangle : AlertOctagon;
          const tCls = tStatus === 'measure' ? 'text-accent-measure' : tStatus === 'warn' ? 'text-accent-warn' : 'text-accent-fault';
          const tSr = tStatus === 'measure' ? '快速收敛' : tStatus === 'warn' ? '收敛偏慢' : '未收敛';
          return (
            <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
              <div className="text-ink-muted">进入 ±0.5K 用时</div>
              <div className={`flex items-center gap-1 font-mono ${tCls}`}>
                <TIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">{tSr}：</span>
                {settleTime === null ? '未收敛' : `${formatNumber(settleTime, 2)} s`}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 滑块区 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Slider
          label="Kp 比例增益"
          value={kp}
          min={0}
          max={8}
          step={0.1}
          unit=" step/K"
          onChange={setKp}
        />
        <Slider
          label="Ki 积分增益"
          value={ki}
          min={0}
          max={20}
          step={0.5}
          unit=" step/(K·s)"
          onChange={setKi}
        />
        <Slider
          label="目标 SH"
          value={targetSH}
          min={2}
          max={10}
          step={0.5}
          unit=" K"
          onChange={setTargetSH}
        />
        <Slider
          label="起始扰动 SH"
          value={initialSH}
          min={0}
          max={15}
          step={0.5}
          unit=" K"
          onChange={setInitialSH}
        />
      </div>

      {/* 双 Y 轴时域曲线 */}
      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, DEFAULTS.durationSec]}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(0)}s`}
            />
            <YAxis
              yAxisId="sh"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 'dataMax + 1']}
              label={{ value: 'SH (K)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              yAxisId="step"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 500]}
              label={{ value: 'EEV step', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
                fontSize: 11,
              }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)}s`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              yAxisId="sh"
              y={targetSH}
              stroke="#43f7b5"
              strokeDasharray="4 4"
              strokeWidth={1.2}
              label={{ value: '目标', fill: '#43f7b5', fontSize: 10, position: 'right' }}
            />
            <Line
              yAxisId="sh"
              type="monotone"
              dataKey="sh"
              stroke="#34d6ff"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="SH 实际 (K)"
            />
            <Line
              yAxisId="step"
              type="monotone"
              dataKey="eevSteps"
              stroke="#ffb84d"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              name="EEV 步数"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        反向作用回路：SH 高于目标 → PI 输出加大 EEV 开度 → 制冷剂流量增大 → SH 回落。
        Ki 太小残留稳态偏差，Ki 太大会引起 SH 振荡甚至液击；典型实机 Kp 1~3、Ki 2~6，更新周期 1~5 s。
      </p>
    </Card>
  );
}
