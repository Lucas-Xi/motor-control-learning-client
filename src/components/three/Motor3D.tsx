import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useSimulationStore } from '../../store/simulationStore';

interface MotorSceneProps {
  speedRpm: number;
  polePairs: number;
  vectorAngle: number;
  amplitude: number;
  phaseCurrents?: { ia: number; ib: number; ic: number };
}

function MotorCore({ speedRpm, polePairs, vectorAngle, amplitude, phaseCurrents }: MotorSceneProps) {
  const rotor = useRef<Group>(null);
  const field = useRef<Group>(null);
  const coils = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  const rotorPoles = useMemo(
    () => Array.from({ length: polePairs * 2 }, (_, i) => (i / (polePairs * 2)) * Math.PI * 2),
    [polePairs],
  );
  useFrame((_, delta) => {
    // 转子角度由仿真时钟 time 直接推导：time 不变 → rotor 不动；
    // 单步把 time 推进 0.02 → rotor 也按 ω·dt 前进。这样暂停 / 单步 / 运行 视觉一致。
    const time = useSimulationStore.getState().time;
    if (rotor.current) rotor.current.rotation.z = (speedRpm / 60) * Math.PI * 2 * time;
    if (field.current) {
      const cur = field.current.rotation.z;
      let diff = vectorAngle - cur;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      field.current.rotation.z = cur + diff * Math.min(1, delta * 9);
    }
  });
  const fieldScale = 0.7 + Math.min(1.4, amplitude / 8) * 0.35;
  const phaseValues = [phaseCurrents?.ia ?? amplitude, phaseCurrents?.ib ?? -amplitude / 2, phaseCurrents?.ic ?? -amplitude / 2];
  return (
    <group rotation={[0, 0, -0.35]}>
      <mesh>
        <torusGeometry args={[1.35, 0.09, 18, 96]} />
        <meshStandardMaterial color="#274663" metalness={0.45} roughness={0.35} emissive="#061d30" />
      </mesh>
      {coils.map((angle, index) => {
        const phase = index % 3;
        const phaseCurrent = phaseValues[phase];
        const normalized = Math.min(1.4, Math.abs(phaseCurrent) / Math.max(amplitude, 0.1));
        const color = phase === 0 ? '#34d6ff' : phase === 1 ? '#43f7b5' : '#ffb84d';
        const emissive = phase === 0 ? '#06304a' : phase === 1 ? '#073d2e' : '#4a2a04';
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0]} rotation={[0, 0, angle]} scale={[1, 1 + normalized * 0.35, 1]}>
            <boxGeometry args={[0.16, 0.44, 0.2]} />
            <meshStandardMaterial color={color} emissive={phaseCurrent >= 0 ? emissive : '#250715'} emissiveIntensity={0.55 + normalized * 1.6} />
          </mesh>
        );
      })}
      <group ref={rotor}>
        <mesh>
          <cylinderGeometry args={[0.62, 0.62, 0.28, 80]} />
          <meshStandardMaterial color="#d7ecff" metalness={0.65} roughness={0.22} />
        </mesh>
        {rotorPoles.map((angle, i) => (
          <mesh key={i} position={[Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0.16]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.18, 0.5, 0.08]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#ff5c7a' : '#34d6ff'} emissive={i % 2 === 0 ? '#4a0616' : '#052b3e'} />
          </mesh>
        ))}
      </group>
      <group ref={field} scale={[fieldScale, fieldScale, fieldScale]}>
        {[0.74, 0.92, 1.1].map((scale, index) => (
          <mesh key={scale} scale={[scale, scale, scale]} position={[0, 0, 0.32]}>
            <torusGeometry args={[0.72, 0.01, 8, 96]} />
            <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" transparent opacity={0.22 - index * 0.05} />
          </mesh>
        ))}
        <mesh position={[0.55, 0, 0.35]} rotation={[0, Math.PI / 2, 0]}>
          <coneGeometry args={[0.09, 0.32, 24]} />
          <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" />
        </mesh>
        <mesh position={[0.25, 0, 0.35]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.58, 16]} />
          <meshStandardMaterial color="#43f7b5" emissive="#0b4a35" />
        </mesh>
      </group>
      <Html position={[-1.5, -1.35, 0.55]}>
        <div className="rounded-xl border border-cyanline/30 bg-obsidian/80 px-3 py-2 text-xs text-cyan-100 shadow-neon backdrop-blur">
          rotor {Math.round(speedRpm)} rpm / {polePairs} 极对
        </div>
      </Html>
      <Html position={[0.92, 1.55, 0.48]}>
        <div className="rounded-full border border-mintline/30 bg-obsidian/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-mintline shadow-mint backdrop-blur">
          phase glow = current
        </div>
      </Html>
    </group>
  );
}

const MotorCoreMemo = memo(MotorCore, (prev, next) => {
  if (prev.polePairs !== next.polePairs) return false;
  if (prev.speedRpm !== next.speedRpm) return false;
  if (Math.abs(prev.vectorAngle - next.vectorAngle) > 1e-3) return false;
  if (Math.abs(prev.amplitude - next.amplitude) > 1e-3) return false;
  const a = prev.phaseCurrents;
  const b = next.phaseCurrents;
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.ia - b.ia) < 1e-3 && Math.abs(a.ib - b.ib) < 1e-3 && Math.abs(a.ic - b.ic) < 1e-3;
});

export function Motor3D({ speedRpm = 900, polePairs = 4, vectorAngle = 0, amplitude = 4, phaseCurrents }: Partial<MotorSceneProps>) {
  return (
    <div className="relative h-[360px] overflow-hidden rounded-3xl border border-cyanline/20 bg-[#04101d] shadow-neon">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-cyanline/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_45%,transparent_36%,rgba(52,214,255,.08)_37%,transparent_54%)]" />
      <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-cyanline/25 bg-obsidian/70 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">orbit enabled</div>
      <Canvas camera={{ position: [0, -4.2, 2.7], fov: 45 }} dpr={[1, 1.8]}>
        <color attach="background" args={['#04101d']} />
        <ambientLight intensity={0.55} />
        <pointLight position={[3, -4, 5]} intensity={22} color="#34d6ff" />
        <pointLight position={[-4, 2, 3]} intensity={10} color="#43f7b5" />
        <MotorCoreMemo speedRpm={speedRpm} polePairs={polePairs} vectorAngle={vectorAngle} amplitude={amplitude} phaseCurrents={phaseCurrents} />
        <OrbitControls enablePan={false} minDistance={2.6} maxDistance={6} />
      </Canvas>
    </div>
  );
}
