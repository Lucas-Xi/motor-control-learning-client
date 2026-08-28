import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';
import { VectorArrow } from './VectorArrow';

interface Props {
  uAlpha: number;
  uBeta: number;
  uDc: number;
  sector: number;
  saturated?: boolean;
  ariaLabel?: string;
}

function Hexagon({ uAlpha, uBeta, uDc, sector, saturated }: Required<Props>) {
  const radius = 1.16;
  const vertices = useMemo(
    () => Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius, 0.04] as [number, number, number];
    }),
    [],
  );
  const vectorMagnitude = Math.hypot(uAlpha, uBeta);
  const vectorAngle = vectorMagnitude > 1e-4 ? Math.atan2(uBeta, uAlpha) : 0;
  const vectorLength = 0.18 + Math.min(1.2, (Math.sqrt(3) * vectorMagnitude) / Math.max(uDc, 1)) * 0.95;

  return (
    <group rotation={[Math.PI / 2.65, 0, Math.PI / 6]}>
      <mesh>
        <cylinderGeometry args={[1.18, 1.18, 0.03, 6]} />
        <meshToonMaterial color={saturated ? THREE_COLORS.fault : THREE_COLORS.surface} />
      </mesh>
      <Line points={[...vertices, vertices[0]]} color={THREE_COLORS.primary} lineWidth={1.4} />
      {vertices.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[index + 1 === sector ? 0.06 : 0.04, 16, 16]} />
          <meshToonMaterial color={index + 1 === sector ? THREE_COLORS.warn : THREE_COLORS.inkMuted} />
        </mesh>
      ))}
      <group rotation={[0, 0, vectorAngle]} position={[0, 0, 0.12]}>
        <VectorArrow color={saturated ? THREE_COLORS.fault : THREE_COLORS.measure} length={vectorLength} bodyRadius={0.045} headRadius={0.12} />
      </group>
    </group>
  );
}

export function SvpwmHexagon3D({ uAlpha, uBeta, uDc, sector, saturated = false, ariaLabel }: Props) {
  const { t } = useI18n();
  const label =
    ariaLabel ??
    `${t('three.svpwmAriaLead')}${sector}` +
      `${t('three.svpwmAriaUalpha')}${uAlpha.toFixed(1)} V` +
      `${t('three.svpwmAriaUbeta')}${uBeta.toFixed(1)} V${t('three.ariaPeriod')}`;
  return (
    <SceneFrame
      ariaLabel={label}
      badge="SVPWM sector space"
      camera={{ position: [0, -3.35, 2.15], fov: 48 }}
      className="relative h-[300px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 2.7, maxDistance: 5 }}
      lightIntensity={22}
    >
      <Hexagon uAlpha={uAlpha} uBeta={uBeta} uDc={uDc} sector={sector} saturated={saturated} ariaLabel={label} />
    </SceneFrame>
  );
}