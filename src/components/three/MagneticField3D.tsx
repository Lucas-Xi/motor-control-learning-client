import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useI18n } from '../../i18n/useI18n';
import { PHASE_COLORS, THREE_COLORS } from './colors';
import { approachAngle } from './rotation';
import { SceneFrame } from './SceneFrame';
import { VectorArrow } from './VectorArrow';

interface Props {
  angle: number;
  amplitude: number;
  phaseCurrents?: { ia: number; ib: number; ic: number };
  ariaLabel?: string;
}

function Field({ angle, amplitude, phaseCurrents }: Props) {
  const ref = useRef<Group>(null);
  const coilAngles = useMemo(() => [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3], []);
  const halos = useMemo(() => [0.62, 0.82, 1.02], []);
  const currents = [phaseCurrents?.ia ?? amplitude, phaseCurrents?.ib ?? -amplitude / 2, phaseCurrents?.ic ?? -amplitude / 2];

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z = approachAngle(ref.current.rotation.z, angle, delta, 10);
  });

  return (
    <group rotation={[Math.PI / 2.6, 0, 0]}>
      <mesh>
        <torusGeometry args={[1.1, 0.025, 12, 96]} />
        <meshToonMaterial color={THREE_COLORS.stator} />
      </mesh>
      {coilAngles.map((coil, index) => {
        const gain = 1 + Math.min(1.2, Math.abs(currents[index]) / Math.max(amplitude, 0.1)) * 0.38;
        return (
          <mesh key={index} position={[Math.cos(coil) * 1.1, Math.sin(coil) * 1.1, 0]} rotation={[0, 0, coil]} scale={[1, gain, 1]}>
            <boxGeometry args={[0.12, 0.42, 0.08]} />
            <meshToonMaterial color={PHASE_COLORS[index]} />
          </mesh>
        );
      })}
      <group ref={ref} scale={[1 + amplitude / 18, 1 + amplitude / 18, 1]}>
        {halos.map((radius, index) => (
          <mesh key={index} scale={[radius, radius, radius]}>
            <torusGeometry args={[0.62, 0.008, 8, 72]} />
            <meshToonMaterial color={index === 0 ? THREE_COLORS.measure : THREE_COLORS.lineStrong} />
          </mesh>
        ))}
        <VectorArrow color={THREE_COLORS.primary} length={1.16} bodyRadius={0.04} headLength={0.36} headRadius={0.14} originRadius={0} />
      </group>
    </group>
  );
}

const FieldMemo = memo(Field, (prev, next) => {
  if (Math.abs(prev.angle - next.angle) > 1e-3 || Math.abs(prev.amplitude - next.amplitude) > 1e-3) return false;
  const a = prev.phaseCurrents;
  const b = next.phaseCurrents;
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.ia - b.ia) < 1e-3 && Math.abs(a.ib - b.ib) < 1e-3 && Math.abs(a.ic - b.ic) < 1e-3;
});

export function MagneticField3D({ angle, amplitude, phaseCurrents, ariaLabel }: Props) {
  const { t } = useI18n();
  const deg = ((((angle * 180) / Math.PI) % 360) + 360) % 360;
  const label =
    ariaLabel ??
    `${t('three.fieldAriaLead')}${deg.toFixed(0)}°${t('three.fieldAriaCurrentBase')}${amplitude.toFixed(1)} A${t('three.ariaPeriod')}`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge={t('three.fieldBadge')}
      camera={{ position: [0, -3.2, 2.1], fov: 48 }}
      className="relative h-64 overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false }}
      lightIntensity={22}
    >
      <FieldMemo angle={angle} amplitude={amplitude} phaseCurrents={phaseCurrents} />
    </SceneFrame>
  );
}