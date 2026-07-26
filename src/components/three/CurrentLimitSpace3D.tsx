import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';
import { VectorArrow } from './VectorArrow';

interface Props {
  id: number;
  iq: number;
  currentLimit: number;
  voltageRatio: number;
  saturated: boolean;
  ariaLabel?: string;
}

function makeLoop(rx: number, ry: number, z: number): Array<[number, number, number]> {
  return Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry, z];
  });
}

export function CurrentLimitSpace3D({ id, iq, currentLimit, voltageRatio, saturated, ariaLabel }: Props) {
  const axis = Math.max(currentLimit * 1.15, Math.abs(id), Math.abs(iq), 1);
  const x = id / axis;
  const y = iq / axis;
  const pointLen = Math.hypot(x, y);
  const pointAngle = pointLen > 1e-4 ? Math.atan2(y, x) : 0;
  const voltageR = Math.max(0.18, Math.min(1.18, 1 / Math.max(0.25, voltageRatio)));
  const currentLoop = useMemo(() => makeLoop(1, 1, 0.02), []);
  const voltageLoop = useMemo(() => makeLoop(voltageR, voltageR * 0.72, 0.08), [voltageR]);
  const label = ariaLabel ?? `三维弱磁限幅空间：Id=${id.toFixed(1)} A，Iq=${iq.toFixed(1)} A，电压利用率 ${voltageRatio.toFixed(2)}。`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge="Id-Iq limit space"
      camera={{ position: [0, -3.6, 2.35], fov: 48 }}
      className="relative h-[300px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 2.8, maxDistance: 5.4 }}
      lightIntensity={24}
    >
      <group rotation={[Math.PI / 2.7, 0, -0.12]}>
        <mesh>
          <cylinderGeometry args={[1.08, 1.08, 0.035, 96]} />
          <meshToonMaterial color={THREE_COLORS.surface} />
        </mesh>
        <Line points={currentLoop} color={THREE_COLORS.primary} lineWidth={1.5} dashed dashScale={8} />
        <Line points={voltageLoop} color={saturated ? THREE_COLORS.fault : THREE_COLORS.measure} lineWidth={2} />
        <group rotation={[0, 0, pointAngle]} position={[0, 0, 0.18]}>
          <VectorArrow color={saturated ? THREE_COLORS.fault : THREE_COLORS.measure} length={Math.max(0.25, pointLen)} bodyRadius={0.042} headRadius={0.11} />
        </group>
        <group rotation={[0, 0, Math.PI]} position={[0, 0, 0.13]}>
          <VectorArrow color={THREE_COLORS.warn} length={0.62} bodyRadius={0.018} headLength={0.14} headRadius={0.06} originRadius={0} />
        </group>
      </group>
    </SceneFrame>
  );
}