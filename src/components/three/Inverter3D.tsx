import { useMemo } from 'react';
import { PHASE_COLORS, THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';

interface Props {
  dutyA?: number;
  dutyB?: number;
  dutyC?: number;
  ariaLabel?: string;
}

function SwitchBlock({ active, color, y }: { active: boolean; color: string; y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={[0.48, 0.24, 0.2]} />
        <meshToonMaterial color={active ? color : THREE_COLORS.line} />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <boxGeometry args={[0.3, 0.045, 0.04]} />
        <meshToonMaterial color={active ? THREE_COLORS.ink : THREE_COLORS.lineStrong} />
      </mesh>
    </group>
  );
}

function PhaseLeg({ x, duty, color }: { x: number; duty: number; color: string }) {
  const upperActive = duty >= 0.5;
  const barHeight = Math.max(0.08, Math.min(1, duty) * 1.1);
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0, -0.12]}>
        <boxGeometry args={[0.08, 1.55, 0.06]} />
        <meshToonMaterial color={THREE_COLORS.lineStrong} />
      </mesh>
      <SwitchBlock active={upperActive} color={color} y={0.52} />
      <SwitchBlock active={!upperActive} color={color} y={-0.52} />
      <mesh position={[0, 0, 0.08]}>
        <sphereGeometry args={[0.09, 18, 18]} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh position={[0.38, -0.55 + barHeight / 2, 0.04]}>
        <boxGeometry args={[0.08, barHeight, 0.08]} />
        <meshToonMaterial color={color} />
      </mesh>
    </group>
  );
}

function Bridge({ dutyA, dutyB, dutyC }: Required<Pick<Props, 'dutyA' | 'dutyB' | 'dutyC'>>) {
  const phases = useMemo(
    () => [
      { x: -1.05, duty: dutyA, color: PHASE_COLORS[0] },
      { x: 0, duty: dutyB, color: PHASE_COLORS[1] },
      { x: 1.05, duty: dutyC, color: PHASE_COLORS[2] },
    ],
    [dutyA, dutyB, dutyC],
  );

  return (
    <group rotation={[Math.PI / 2.85, 0, 0]}>
      <mesh position={[0, 0.98, -0.14]}>
        <boxGeometry args={[2.65, 0.05, 0.08]} />
        <meshToonMaterial color={THREE_COLORS.primary} />
      </mesh>
      <mesh position={[0, -0.98, -0.14]}>
        <boxGeometry args={[2.65, 0.05, 0.08]} />
        <meshToonMaterial color={THREE_COLORS.fault} />
      </mesh>
      {phases.map((phase) => <PhaseLeg key={phase.x} {...phase} />)}
    </group>
  );
}

export function Inverter3D({ dutyA = 0.5, dutyB = 0.5, dutyC = 0.5, ariaLabel }: Props) {
  const label =
    ariaLabel ??
    `三维三相逆变桥：A 相占空比 ${(dutyA * 100).toFixed(0)}%，B 相占空比 ${(dutyB * 100).toFixed(0)}%，C 相占空比 ${(dutyC * 100).toFixed(0)}%。`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge="DC link · 3 phase bridge"
      camera={{ position: [0, -3.5, 2.3], fov: 48 }}
      className="relative h-64 overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 2.8, maxDistance: 5 }}
      lightIntensity={24}
    >
      <Bridge dutyA={dutyA} dutyB={dutyB} dutyC={dutyC} />
    </SceneFrame>
  );
}