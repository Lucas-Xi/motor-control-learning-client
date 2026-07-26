import { useMemo } from 'react';
import { PHASE_COLORS, THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';
import { VectorArrow } from './VectorArrow';

interface Props {
  ia: number;
  ib: number;
  ic: number;
  alpha: number;
  beta: number;
  amplitude?: number;
  ariaLabel?: string;
}

export function AlphaBetaProjection3D({ ia, ib, ic, alpha, beta, amplitude = 8, ariaLabel }: Props) {
  const phaseCurrents = [ia, ib, ic];
  const phaseAngles = useMemo(() => [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3], []);
  const mag = Math.hypot(alpha, beta);
  const angle = mag > 1e-4 ? Math.atan2(beta, alpha) : 0;
  const length = 0.35 + Math.min(1.25, mag / Math.max(amplitude, 0.1)) * 0.9;
  const label = ariaLabel ?? `三维 Clarke 投影：Iα=${alpha.toFixed(2)} A，Iβ=${beta.toFixed(2)} A，零序由三相不平衡决定。`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge="abc → αβ"
      camera={{ position: [0, -3.4, 2.25], fov: 48 }}
      className="relative h-[300px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 2.8, maxDistance: 5 }}
      lightIntensity={22}
    >
      <group rotation={[Math.PI / 2.7, 0, -0.12]}>
        <mesh>
          <cylinderGeometry args={[1.08, 1.08, 0.035, 96]} />
          <meshToonMaterial color={THREE_COLORS.surface} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <torusGeometry args={[1.05, 0.006, 6, 96]} />
          <meshToonMaterial color={THREE_COLORS.line} />
        </mesh>
        {phaseAngles.map((phaseAngle, index) => {
          const phaseLength = 0.28 + Math.min(1, Math.abs(phaseCurrents[index]) / Math.max(amplitude, 0.1)) * 0.58;
          return (
            <group key={index} rotation={[0, 0, phaseAngle]} position={[0, 0, 0.08]}>
              <VectorArrow color={PHASE_COLORS[index]} length={phaseCurrents[index] < 0 ? -phaseLength : phaseLength} bodyRadius={0.024} headLength={0.13} headRadius={0.06} originRadius={0} />
            </group>
          );
        })}
        <group rotation={[0, 0, angle]} position={[0, 0, 0.18]}>
          <VectorArrow color={THREE_COLORS.measure} length={length} bodyRadius={0.045} headRadius={0.12} />
        </group>
      </group>
    </SceneFrame>
  );
}