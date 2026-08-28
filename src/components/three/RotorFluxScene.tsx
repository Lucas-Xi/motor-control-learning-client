import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useI18n } from '../../i18n/useI18n';
import { THREE_COLORS } from './colors';
import { approachAngle } from './rotation';
import { SceneFrame } from './SceneFrame';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { VectorArrow } from './VectorArrow';

interface Props {
  theta: number;
  id: number;
  iq: number;
  iAlpha?: number;
  iBeta?: number;
  amplitude?: number;
  ariaLabel?: string;
}

interface SceneProps extends Required<Pick<Props, 'theta' | 'id' | 'iq' | 'amplitude'>> {
  iAlpha: number;
  iBeta: number;
  staticFrame: boolean;
}

function RotorFlux({ theta, id, iq, iAlpha, iBeta, amplitude, staticFrame }: SceneProps) {
  const dqAxes = useRef<Group>(null);
  const fluxVec = useRef<Group>(null);
  const imag = Math.hypot(iAlpha, iBeta);
  const fluxAngle = imag > 1e-4 ? Math.atan2(iBeta, iAlpha) : 0;
  const fluxLen = 0.58 + Math.min(1.15, imag / Math.max(amplitude, 0.1)) * 0.6;
  const dLen = 0.35 + Math.min(1, Math.abs(id) / Math.max(amplitude, 0.1)) * 0.55;
  const qLen = 0.35 + Math.min(1, Math.abs(iq) / Math.max(amplitude, 0.1)) * 0.55;

  useFrame((_, delta) => {
    if (dqAxes.current) dqAxes.current.rotation.z = staticFrame ? theta : approachAngle(dqAxes.current.rotation.z, theta, delta, 12);
    if (fluxVec.current) fluxVec.current.rotation.z = staticFrame ? fluxAngle : approachAngle(fluxVec.current.rotation.z, fluxAngle, delta, 14);
  });

  return (
    <group rotation={[Math.PI / 2.7, 0, -0.2]}>
      <mesh>
        <cylinderGeometry args={[1.05, 1.05, 0.04, 96]} />
        <meshToonMaterial color={THREE_COLORS.surface} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <torusGeometry args={[1, 0.005, 4, 96]} />
        <meshToonMaterial color={THREE_COLORS.line} />
      </mesh>
      <mesh position={[0.45, 0, 0.025]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 12]} />
        <meshToonMaterial color={THREE_COLORS.lineStrong} />
      </mesh>
      <mesh position={[0, 0.45, 0.025]}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 12]} />
        <meshToonMaterial color={THREE_COLORS.lineStrong} />
      </mesh>
      <group ref={fluxVec} position={[0, 0, 0.05]}>
        <VectorArrow color={THREE_COLORS.measure} length={fluxLen} bodyRadius={0.04} headRadius={0.11} />
      </group>
      <group ref={dqAxes} position={[0, 0, 0.08]}>
        <VectorArrow color={THREE_COLORS.measure} length={dLen} bodyRadius={0.026} headLength={0.16} headRadius={0.07} originRadius={0} />
        <group rotation={[0, 0, Math.PI / 2]}>
          <VectorArrow color={THREE_COLORS.fault} length={qLen} bodyRadius={0.026} headLength={0.16} headRadius={0.07} originRadius={0} />
        </group>
      </group>
    </group>
  );
}

const RotorFluxMemo = memo(RotorFlux, (prev, next) =>
  prev.staticFrame === next.staticFrame &&
  Math.abs(prev.theta - next.theta) < 1e-3 &&
  Math.abs(prev.id - next.id) < 1e-3 &&
  Math.abs(prev.iq - next.iq) < 1e-3 &&
  Math.abs(prev.iAlpha - next.iAlpha) < 1e-3 &&
  Math.abs(prev.iBeta - next.iBeta) < 1e-3 &&
  Math.abs(prev.amplitude - next.amplitude) < 1e-3,
);

export function RotorFluxScene({ theta, id, iq, iAlpha, iBeta, amplitude = 6, ariaLabel }: Props) {
  const { t } = useI18n();
  const reduced = usePrefersReducedMotion();
  const resolvedAlpha = useMemo(() => (iAlpha !== undefined ? iAlpha : id * Math.cos(theta) - iq * Math.sin(theta)), [iAlpha, id, iq, theta]);
  const resolvedBeta = useMemo(() => (iBeta !== undefined ? iBeta : id * Math.sin(theta) + iq * Math.cos(theta)), [iBeta, id, iq, theta]);
  const imag = Math.hypot(resolvedAlpha, resolvedBeta);
  const thetaDeg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  const label =
    ariaLabel ??
    `${t('three.rotorFluxAriaLead')}${thetaDeg.toFixed(0)}°` +
      `${t('three.rotorFluxAriaImag')}${imag.toFixed(2)} A` +
      `${t('three.rotorFluxAriaId')}${id.toFixed(2)} A` +
      `${t('three.rotorFluxAriaIq')}${iq.toFixed(2)} A${t('three.ariaPeriod')}`;

  return (
    <SceneFrame
      ariaLabel={label}
      badge="αβ static · dq rotating"
      camera={{ position: [0, -3.8, 2.4], fov: 48 }}
      className="relative h-[320px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
      controls={{ enablePan: false, enableZoom: false, minDistance: 3, maxDistance: 5.5 }}
      lightIntensity={24}
    >
      <RotorFluxMemo
        theta={theta}
        id={id}
        iq={iq}
        iAlpha={resolvedAlpha}
        iBeta={resolvedBeta}
        amplitude={amplitude}
        staticFrame={reduced}
      />
    </SceneFrame>
  );
}