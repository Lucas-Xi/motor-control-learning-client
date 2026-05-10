import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { memo, useRef } from 'react';
import type { Group } from 'three';

interface Props {
  theta: number;
  id: number;
  iq: number;
}

function RotorFlux({ theta, id, iq }: Props) {
  const axes = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!axes.current) return;
    const cur = axes.current.rotation.z;
    let diff = theta - cur;
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    axes.current.rotation.z = cur + diff * Math.min(1, delta * 12);
  });
  return (
    <group rotation={[Math.PI / 2.7, 0, -0.2]}>
      <mesh>
        <cylinderGeometry args={[0.8, 0.8, 0.22, 80]} />
        <meshStandardMaterial color="#e5f7ff" metalness={0.45} roughness={0.3} />
      </mesh>
      <group ref={axes}>
        <mesh position={[0.44, 0, 0.22]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.88, 16]} />
          <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" />
        </mesh>
        <mesh position={[0.9, 0, 0.22]} rotation={[0, Math.PI / 2, 0]}>
          <coneGeometry args={[0.12, 0.32, 24]} />
          <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" />
        </mesh>
        <mesh position={[0, 0.44, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.026, 0.026, 0.78, 16]} />
          <meshStandardMaterial color="#ff5c7a" emissive="#4a0616" />
        </mesh>
      </group>
      <Html position={[-1.25, -1.0, 0.6]}>
        <div className="rounded-xl border border-mintline/30 bg-obsidian/80 px-3 py-2 text-xs text-slate-100 backdrop-blur">
          Id 磁链 {id.toFixed(2)} A<br />Iq 转矩 {iq.toFixed(2)} A
        </div>
      </Html>
    </group>
  );
}

const RotorFluxMemo = memo(RotorFlux, (prev, next) =>
  Math.abs(prev.theta - next.theta) < 1e-3 &&
  Math.abs(prev.id - next.id) < 1e-3 &&
  Math.abs(prev.iq - next.iq) < 1e-3,
);

export function RotorFluxScene(props: Props) {
  return (
    <div className="h-[320px] overflow-hidden rounded-3xl border border-mintline/20 bg-[#04101d] shadow-mint">
      <Canvas camera={{ position: [0, -3.8, 2.4], fov: 48 }}>
        <ambientLight intensity={0.58} />
        <pointLight position={[2, -3, 4]} intensity={18} color="#43f7b5" />
        <RotorFluxMemo {...props} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={5.5} />
      </Canvas>
    </div>
  );
}
