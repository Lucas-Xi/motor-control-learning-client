import type { ReactNode } from 'react';

interface VectorArrowProps {
  color: string;
  length: number;
  bodyRadius?: number;
  headLength?: number;
  headRadius?: number;
  originRadius?: number;
  children?: ReactNode;
}

export function VectorArrow({
  color,
  length,
  bodyRadius = 0.035,
  headLength = 0.22,
  headRadius = 0.1,
  originRadius = 0.055,
  children,
}: VectorArrowProps) {
  const sign = length < 0 ? -1 : 1;
  const total = Math.max(Math.abs(length), headLength + 0.05);
  const bodyLength = Math.max(0.05, total - headLength);

  return (
    <group rotation={[0, 0, sign < 0 ? Math.PI : 0]}>
      <mesh position={[bodyLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[bodyRadius, bodyRadius, bodyLength, 16]} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh position={[bodyLength + headLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[headRadius, headLength, 24]} />
        <meshToonMaterial color={color} />
      </mesh>
      {originRadius > 0 && (
        <mesh>
          <sphereGeometry args={[originRadius, 16, 16]} />
          <meshToonMaterial color={color} />
        </mesh>
      )}
      {children}
    </group>
  );
}