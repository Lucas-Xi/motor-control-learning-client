import { useI18n } from '../../i18n/useI18n';
import { THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';
import { VectorArrow } from './VectorArrow';

interface Props {
  trueDeg: number;
  estimatedDeg: number;
  errorDeg: number;
  ariaLabel?: string;
}

export function SensorlessAngleScene3D({ trueDeg, estimatedDeg, errorDeg, ariaLabel }: Props) {
  const { t } = useI18n();
  const trueRad = (trueDeg * Math.PI) / 180;
  const estRad = (estimatedDeg * Math.PI) / 180;
  const risky = Math.abs(errorDeg) > 10;
  const label =
    ariaLabel ??
    `${t('three.sensorlessAriaLead')}${trueDeg.toFixed(1)}°` +
      `${t('three.sensorlessAriaEstimated')}${estimatedDeg.toFixed(1)}°` +
      `${t('three.sensorlessAriaError')}${errorDeg.toFixed(1)}°${t('three.ariaPeriod')}`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge={t('three.sensorlessBadge')}
      camera={{ position: [0, -3.35, 2.18], fov: 48 }}
      className="relative h-[260px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 2.7, maxDistance: 5 }}
      lightIntensity={22}
    >
      <group rotation={[Math.PI / 2.7, 0, -0.16]}>
        <mesh>
          <cylinderGeometry args={[1.04, 1.04, 0.035, 96]} />
          <meshToonMaterial color={THREE_COLORS.surface} />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <torusGeometry args={[1, 0.006, 6, 96]} />
          <meshToonMaterial color={THREE_COLORS.line} />
        </mesh>
        <group rotation={[0, 0, trueRad]} position={[0, 0, 0.12]}>
          <VectorArrow color={THREE_COLORS.measure} length={0.96} bodyRadius={0.04} headRadius={0.11} />
        </group>
        <group rotation={[0, 0, estRad]} position={[0, 0, 0.22]}>
          <VectorArrow color={risky ? THREE_COLORS.fault : THREE_COLORS.primary} length={0.78} bodyRadius={0.03} headRadius={0.09} />
        </group>
      </group>
    </SceneFrame>
  );
}