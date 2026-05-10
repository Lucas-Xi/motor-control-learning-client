interface Props {
  dutyA?: number;
  dutyB?: number;
  dutyC?: number;
}

export function Inverter3D({ dutyA = 0.5, dutyB = 0.5, dutyC = 0.5 }: Props) {
  const phases = [
    { name: 'A', duty: dutyA, color: '#34d6ff' },
    { name: 'B', duty: dutyB, color: '#43f7b5' },
    { name: 'C', duty: dutyC, color: '#ffb84d' },
  ];
  return (
    <div className="grid h-64 grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-[#06101d] p-4">
      {phases.map((phase) => (
        <div key={phase.name} className="relative flex flex-col items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <span className="text-sm font-bold" style={{ color: phase.color }}>{phase.name} 相桥臂</span>
          <div className="h-16 w-14 rounded-xl border border-white/10" style={{ background: `linear-gradient(to top, ${phase.color} ${phase.duty * 100}%, rgba(255,255,255,.06) ${phase.duty * 100}%)` }} />
          <div className="h-16 w-14 rounded-xl border border-white/10" style={{ background: `linear-gradient(to bottom, ${phase.color} ${(1 - phase.duty) * 100}%, rgba(255,255,255,.06) ${(1 - phase.duty) * 100}%)` }} />
          <span className="formula text-xs text-slate-300">D={Math.round(phase.duty * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
