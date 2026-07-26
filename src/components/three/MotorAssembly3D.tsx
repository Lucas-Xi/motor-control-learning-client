import { PHASE_COLORS, THREE_COLORS } from './colors';
import { SceneFrame } from './SceneFrame';

interface Props {
  ariaLabel?: string;
}

export function MotorAssembly3D({ ariaLabel }: Props) {
  const label = ariaLabel ?? '三维电机装配视图：定子、绕组、转子沿轴向展开，帮助理解整机搭建关系。';
  return (
    <SceneFrame
      ariaLabel={label}
      badge="motor exploded view"
      camera={{ position: [0, -4.2, 2.5], fov: 46 }}
      className="relative h-[300px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 3.2, maxDistance: 6 }}
      lightIntensity={26}
    >
      <group rotation={[Math.PI / 2.75, 0, -0.18]}>
        <mesh position={[-0.95, 0, 0]}>
          <torusGeometry args={[0.86, 0.09, 18, 96]} />
          <meshToonMaterial color={THREE_COLORS.stator} />
        </mesh>
        {PHASE_COLORS.map((color, index) => {
          const angle = (index / 3) * Math.PI * 2;
          return (
            <mesh key={color} position={[-0.95 + Math.cos(angle) * 0.86, Math.sin(angle) * 0.86, 0.12]} rotation={[0, 0, angle]}>
              <boxGeometry args={[0.14, 0.34, 0.12]} />
              <meshToonMaterial color={color} />
            </mesh>
          );
        })}
        <mesh position={[0.35, 0, 0.12]}>
          <cylinderGeometry args={[0.46, 0.46, 0.32, 72]} />
          <meshToonMaterial color={THREE_COLORS.rotor} />
        </mesh>
        <mesh position={[1.15, 0, 0.2]}>
          <cylinderGeometry args={[0.14, 0.14, 1.35, 32]} />
          <meshToonMaterial color={THREE_COLORS.inkMuted} />
        </mesh>
        <mesh position={[-0.3, 0, -0.12]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 1.05, 12]} />
          <meshToonMaterial color={THREE_COLORS.warn} />
        </mesh>
      </group>
    </SceneFrame>
  );
}