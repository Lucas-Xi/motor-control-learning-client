import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { PHASE_COLORS, THREE_COLORS } from './colors';
import { approachAngle } from './rotation';
import { SceneFrame } from './SceneFrame';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { VectorArrow } from './VectorArrow';

interface MotorSceneProps {
  thetaE: number;
  polePairs: number;
  iAlpha: number;
  iBeta: number;
  amplitude: number;
  phaseCurrents?: { ia: number; ib: number; ic: number };
  staticFrame?: boolean;
}

function MotorCore({ thetaE, polePairs, iAlpha, iBeta, amplitude, phaseCurrents, staticFrame }: MotorSceneProps) {
  const rotor = useRef<Group>(null);
  const fieldVec = useRef<Group>(null);
  const safePolePairs = Math.max(1, Math.round(polePairs));
  const coils = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  const rotorPoles = useMemo(
    () => Array.from({ length: safePolePairs * 2 }, (_, i) => (i / (safePolePairs * 2)) * Math.PI * 2),
    [safePolePairs],
  );

  const thetaMechanical = thetaE / safePolePairs;
  const imag = Math.hypot(iAlpha, iBeta);
  const fluxAngle = imag > 1e-4 ? Math.atan2(iBeta, iAlpha) : 0;
  const fluxLength = 0.62 + Math.min(1.15, imag / Math.max(amplitude, 0.1)) * 0.62;
  const phaseValues = [
    phaseCurrents?.ia ?? amplitude,
    phaseCurrents?.ib ?? -amplitude / 2,
    phaseCurrents?.ic ?? -amplitude / 2,
  ];

  useFrame((_, delta) => {
    if (rotor.current) rotor.current.rotation.z = staticFrame ? thetaMechanical : approachAngle(rotor.current.rotation.z, thetaMechanical, delta, 12);
    if (fieldVec.current) fieldVec.current.rotation.z = staticFrame ? fluxAngle : approachAngle(fieldVec.current.rotation.z, fluxAngle, delta, 14);
  });

  return (
    <group rotation={[0, 0, -0.35]}>
      <mesh>
        <torusGeometry args={[1.35, 0.09, 18, 96]} />
        <meshToonMaterial color={THREE_COLORS.stator} />
      </mesh>
      {coils.map((angle, index) => {
        const phase = index % 3;
        const normalized = Math.min(1.4, Math.abs(phaseValues[phase]) / Math.max(amplitude, 0.1));
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0]}
            rotation={[0, 0, angle]}
            scale={[1, 1 + normalized * 0.35, 1]}
          >
            <boxGeometry args={[0.16, 0.44, 0.2]} />
            <meshToonMaterial color={PHASE_COLORS[phase]} />
          </mesh>
        );
      })}
      <group ref={rotor}>
        <mesh>
          <cylinderGeometry args={[0.62, 0.62, 0.28, 80]} />
          <meshToonMaterial color={THREE_COLORS.rotor} />
        </mesh>
        {rotorPoles.map((angle, i) => (
          <mesh key={i} position={[Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0.16]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.18, 0.5, 0.08]} />
            <meshToonMaterial color={i % 2 === 0 ? THREE_COLORS.fault : THREE_COLORS.primary} />
          </mesh>
        ))}
      </group>
      <group ref={fieldVec} position={[0, 0, 0.36]}>
        <VectorArrow color={THREE_COLORS.measure} length={fluxLength} bodyRadius={0.04} headRadius={0.11} />
        {[fluxLength / 3, (fluxLength * 2) / 3].map((r) => (
          <mesh key={r} position={[r, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.025, 0.008, 6, 18]} />
            <meshToonMaterial color={THREE_COLORS.measure} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const MotorCoreMemo = memo(MotorCore, (prev, next) => {
  if (prev.polePairs !== next.polePairs || prev.staticFrame !== next.staticFrame) return false;
  if (Math.abs(prev.thetaE - next.thetaE) > 1e-3) return false;
  if (Math.abs(prev.iAlpha - next.iAlpha) > 1e-3) return false;
  if (Math.abs(prev.iBeta - next.iBeta) > 1e-3) return false;
  if (Math.abs(prev.amplitude - next.amplitude) > 1e-3) return false;
  const a = prev.phaseCurrents;
  const b = next.phaseCurrents;
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.ia - b.ia) < 1e-3 && Math.abs(a.ib - b.ib) < 1e-3 && Math.abs(a.ic - b.ic) < 1e-3;
});

interface PublicProps {
  thetaE?: number;
  polePairs?: number;
  iAlpha?: number;
  iBeta?: number;
  amplitude?: number;
  phaseCurrents?: { ia: number; ib: number; ic: number };
  ariaLabel?: string;
}

export function Motor3D({ thetaE = 0, polePairs = 4, iAlpha, iBeta, amplitude = 4, phaseCurrents, ariaLabel }: PublicProps) {
  const reduced = usePrefersReducedMotion();
  const resolvedAlpha = iAlpha ?? amplitude * Math.cos(thetaE);
  const resolvedBeta = iBeta ?? amplitude * Math.sin(thetaE);
  const imag = Math.hypot(resolvedAlpha, resolvedBeta);
  const thetaEDeg = ((((thetaE * 180) / Math.PI) % 360) + 360) % 360;
  const fluxDeg = (((Math.atan2(resolvedBeta, resolvedAlpha) * 180) / Math.PI + 360) % 360).toFixed(0);
  const label =
    ariaLabel ??
    `三维 PMSM 视图：极对数 ${Math.round(polePairs)}，电角度 ${thetaEDeg.toFixed(0)}°，合成电流矢量 ${imag.toFixed(2)} A，方向 ${fluxDeg}°。`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge="drag to rotate · zoom locked"
      camera={{ position: [0, -4.2, 2.7], fov: 45 }}
      className="relative h-[360px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 3.2, maxDistance: 6 }}
      lightIntensity={28}
    >
      <MotorCoreMemo
        thetaE={thetaE}
        polePairs={polePairs}
        iAlpha={resolvedAlpha}
        iBeta={resolvedBeta}
        amplitude={amplitude}
        phaseCurrents={phaseCurrents}
        staticFrame={reduced}
      />
    </SceneFrame>
  );
}