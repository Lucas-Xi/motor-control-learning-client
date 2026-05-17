import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { CascadeLoopDiagram } from '../../components/charts/CascadeLoopDiagram';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 三闭环级联控制信号流卡片：
 * - 数据源全部来自 useSimulationStore.controlLoop（位置/速度/电流 PI 增益、目标位置、目标速度）
 * - paused 由全局 running 取反；停止仿真时动画暂停
 * - 三个回路带宽 (positionBw / speedBw / currentBw) 由 PI 增益派生：
 *     ω_c ≈ Kp / (2π * 一阶等效时间常数)，工程经验做近似
 *   缺省值兜底：positionBw=10Hz, speedBw=50Hz, currentBw=500Hz
 * - 实际值（positionActual/speedActual/currentActual）：当前 store 不直接持有这些瞬时观测，
 *   故用基于增益的稳态近似显示一个温和的误差色块（误差越大 sum 节点光晕越亮），
 *   以便外环增益太大时视觉上能感知到。
 */

function deriveBandwidths(currentKp: number, currentKi: number, speedKp: number, speedKi: number, positionKp: number, positionKi: number) {
  // 电流环：常见经验 BW_i ≈ currentKp / L，这里用一个温和缩放映射到 200..1500 Hz
  const currentBw = clampNum(120 + currentKp * 60 + currentKi * 4, 80, 1500);
  // 速度环：经验上比电流环慢 5~10 倍
  const speedBw = clampNum(20 + speedKp * 80 + speedKi * 3, 8, 300);
  // 位置环：再慢 5~10 倍
  const positionBw = clampNum(2 + positionKp * 1.4 + positionKi * 0.6, 1, 80);
  return { currentBw, speedBw, positionBw };
}

function clampNum(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function CascadeDiagramCard() {
  const cl = useSimulationStore((s) => s.controlLoop);
  const running = useSimulationStore((s) => s.running);

  const bw = useMemo(
    () => deriveBandwidths(cl.currentKp, cl.currentKi, cl.speedKp, cl.speedKi, cl.positionKp, cl.positionKi),
    [cl.currentKp, cl.currentKi, cl.speedKp, cl.speedKi, cl.positionKp, cl.positionKi],
  );

  // 显示用的"实际值"：使用最近一次稳态近似 —— 速度跟踪到目标的 92%，位置到 98%，电流到 95%。
  // 当 PI 增益太低时表现为误差较大；这是教学层面的视觉指示，不是仿真。
  const positionActual = cl.targetPosition * (cl.positionKp > 0 ? 0.98 : 0.4);
  const speedActual = cl.targetSpeed * (cl.speedKp > 0 ? 0.92 : 0.3);
  // 电流目标 / 实际：用速度误差比例派生一个 0..6A 的视觉误差
  const speedErrFrac = cl.targetSpeed === 0 ? 0 : Math.abs(cl.targetSpeed - speedActual) / Math.abs(cl.targetSpeed);
  const currentTarget = clampNum(speedErrFrac * 5, 0, 6);
  const currentActual = currentTarget * (cl.currentKp > 0 ? 0.95 : 0.4);

  const posErr = cl.targetPosition - positionActual;
  const spdErr = cl.targetSpeed - speedActual;
  const curErr = currentTarget - currentActual;

  return (
    <Card title="级联控制信号流" eyebrow="cascade animation" density="compact">
      <div className="aspect-[2/1] w-full">
        <CascadeLoopDiagram
          positionTarget={cl.targetPosition}
          positionActual={positionActual}
          speedTarget={cl.targetSpeed}
          speedActual={speedActual}
          currentTarget={currentTarget}
          currentActual={currentActual}
          positionBw={bw.positionBw}
          speedBw={bw.speedBw}
          currentBw={bw.currentBw}
          positionKp={cl.positionKp}
          positionKi={cl.positionKi}
          speedKp={cl.speedKp}
          speedKi={cl.speedKi}
          currentKp={cl.currentKp}
          currentKi={cl.currentKi}
          paused={!running}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <span className="text-ink-muted">位置误差 </span>
          <span className="text-accent-warn">{formatNumber(posErr, 2)}°</span>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <span className="text-ink-muted">速度误差 </span>
          <span className="text-accent-primary">{formatNumber(spdErr, 1)} rpm</span>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <span className="text-ink-muted">电流误差 </span>
          <span className="text-accent-measure">{formatNumber(curErr, 2)} A</span>
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        脉冲沿信号路径流动 —— 内环（电流，BW≈{bw.currentBw.toFixed(0)} Hz）最快，外环（位置，BW≈{bw.positionBw.toFixed(0)} Hz）最慢。
        整定顺序：电流 → 速度 → 位置；每一级的带宽至少比内层低 5 倍。
      </p>
    </Card>
  );
}
