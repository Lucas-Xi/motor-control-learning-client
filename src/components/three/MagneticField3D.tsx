import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';

interface Props {
  angle: number;
  amplitude: number;
}

function Field({ angle, amplitude }: Props) {
  const ref = useRef<Group>(null);
  const coilAngles = useMemo(() => [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3], []);
  const halos = useMemo(() => [0.62, 0.82, 1.02], []);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const cur = ref.current.rotation.z;
    let diff = angle - cur;
    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    ref.current.rotation.z = cur + diff * Math.min(1, delta * 10);
  });
  return (
    <group rotation={[Math.PI / 2.6, 0, 0]}>
      <mesh>
        <torusGeometry args={[1.1, 0.025, 12, 96]} />
        <meshStandardMaterial color="#1d3a55" emissive="#061e31" />
      </mesh>
      {coilAngles.map((coil, index) => (
        <mesh key={index} position={[Math.cos(coil) * 1.1, Math.sin(coil) * 1.1, 0]} rotation={[0, 0, coil]}>
          <boxGeometry args={[0.12, 0.42, 0.08]} />
          <meshStandardMaterial color={index === 0 ? '#34d6ff' : index === 1 ? '#43f7b5' : '#ffb84d'} emissive={index === 0 ? '#07334d' : index === 1 ? '#073d2e' : '#4a2a04'} />
        </mesh>
      ))}
      <group ref={ref} scale={[1 + amplitude / 18, 1 + amplitude / 18, 1]}>
        {halos.map((radius, index) => (
          <mesh key={index} scale={[radius, radius, radius]}>
            <torusGeometry args={[0.62, 0.008, 8, 72]} />
            <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" transparent opacity={0.22 - index * 0.045} />
          </mesh>
        ))}
        <mesh position={[0.48, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.95, 20]} />
          <meshStandardMaterial color="#34d6ff" emissive="#063a54" />
        </mesh>
        <mesh position={[0.98, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <coneGeometry args={[0.14, 0.36, 28]} />
          <meshStandardMaterial color="#34d6ff" emissive="#063a54" />
        </mesh>
      </group>
    </group>
  );
}

const FieldMemo = memo(Field, (prev, next) =>
  Math.abs(prev.angle - next.angle) < 1e-3 && Math.abs(prev.amplitude - next.amplitude) < 1e-3,
);

export function MagneticField3D(props: Props) {
  return (
    <div className="relative h-64 overflow-hidden rounded-2xl border border-white/10 bg-[#06101d]">
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-cyanline/25 bg-obsidian/70 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">drag field view</div>
      <Canvas camera={{ position: [0, -3.2, 2.1], fov: 48 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[2, -2, 3]} intensity={18} color="#34d6ff" />
        <FieldMemo {...props} />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  );
}
