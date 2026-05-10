import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { Magnet, RotateCw, Settings } from 'lucide-react';
import { useMemo } from 'react';
import { MotorAnatomy2D } from '../../components/charts/MotorAnatomy2D';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useSimulationStore } from '../../store/simulationStore';
import { electricalAngle } from '../../simulation/math/transforms';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';

function AngleGauge({ label, valueDeg, color }: { label: string; valueDeg: number; color: string }) {
  const value = ((valueDeg % 360) + 360) % 360;
  return (
    <div className="rounded-xl border border-line-subtle bg-bg-base p-3">
      <p className="mb-1 text-caption text-ink-muted">{label}</p>
      <div className="h-32">
        <SafeResponsiveContainer>
          <RadialBarChart data={[{ value, fill: color }]} innerRadius="68%" outerRadius="98%" startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 360]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: '#1e2a3d' }} isAnimationActive={false} />
          </RadialBarChart>
        </SafeResponsiveContainer>
      </div>
      <p className="formula text-center text-xl font-bold" style={{ color }}>{formatNumber(value, 1)}°</p>
    </div>
  );
}

function Primary() {
  const params = useSimulationStore((s) => s.motorBasics);
  return (
    <Card
      title="径向剖面电机解剖图"
      eyebrow="stator / rotor / magnets"
      density="compact"
      action={<FidelityBadge level="exact" hint="标准 12 槽 PMSM 结构示意；磁极数随极对数同步变化" />}
    >
      <MotorAnatomy2D
        polePairs={params.polePairs}
        mechanicalDeg={params.mechanicalDeg}
        rpm={params.rpm}
      />
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        这是 PMSM 顶视剖面：外圈定子铁芯 + 12 个槽里嵌着 A / B / C 三相绕组（每相各 4 个截面，⊙ ⊗ 表示电流进出方向），中间转子表面贴 {params.polePairs * 2} 块交替的 N / S 永磁体。
        滑动"机械角度"，转子整体旋转；改"极对数"，磁极数对应翻倍但定子槽不变 —— 这就是为什么"极对数错就电角度错"。
      </p>
    </Card>
  );
}

function Probe() {
  const params = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  // 仪表盘跟随仿真时钟：暂停时静止；运行 / 单步把 time 推进，转子和数字一起前进。
  // 滑块的 mechanicalDeg 作为基准角，叠加 rpm × time 的旋转分量。
  const derived = useMemo(() => {
    const live = params.mechanicalDeg + (params.rpm / 60) * 360 * time;
    const mechanical = ((live % 360) + 360) % 360;
    const electrical = ((electricalAngle((mechanical * Math.PI) / 180, params.polePairs) * 180) / Math.PI % 360 + 360) % 360;
    return {
      mechanical,
      electrical,
      cycles: params.polePairs,
      freq: (params.rpm / 60) * params.polePairs,
      ratedTorque: 0.095 * params.ratedCurrent,
    };
  }, [params, time]);
  return (
    <>
      <Card title="机械角度 vs 电角度" eyebrow="angle relation" density="compact">
        <div className="grid grid-cols-2 gap-2">
          <AngleGauge label="θm 机械" valueDeg={derived.mechanical} color="#34d6ff" />
          <AngleGauge label="θe 电角度" valueDeg={derived.electrical} color="#43f7b5" />
        </div>
        <p className="formula mt-3 rounded-lg border border-line-subtle bg-bg-base p-3 text-body text-accent-primary">θe = {derived.cycles} × θm</p>
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
          {params.polePairs} 极对：转子机械转 1 圈，电角度转 {derived.cycles} 圈，电频率 {formatNumber(derived.freq, 1)} Hz。
        </p>
      </Card>
      <Card title="关键参数" eyebrow="motor parameters" density="compact">
        <div className="space-y-2 text-body">
          <div className="flex items-start gap-2"><Magnet className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" /><span className="text-ink-secondary">定子绕组产生旋转磁场，转子永磁体提供磁链。</span></div>
          <div className="flex items-start gap-2"><RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" /><span className="text-ink-secondary">极对数越多，同样转速电频率越高，FOC 中断压力也越高。</span></div>
          <div className="flex items-start gap-2"><Settings className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" /><span className="text-ink-secondary">额定转矩 ≈ Kt × I = {formatNumber(derived.ratedTorque, 2)} Nm。</span></div>
        </div>
      </Card>
    </>
  );
}

export function MotorBasicsModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="motor-basics" />} />;
}
