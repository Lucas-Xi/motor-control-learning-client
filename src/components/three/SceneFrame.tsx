import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';
import { CameraLight } from './CameraLight';
import { THREE_COLORS } from './colors';

interface SceneFrameProps {
  ariaLabel: string;
  badge?: string;
  camera?: {
    fov?: number;
    position?: [number, number, number];
  };
  children: ReactNode;
  className?: string;
  controls?: {
    enablePan?: boolean;
    enableRotate?: boolean;
    enableZoom?: boolean;
    maxDistance?: number;
    minDistance?: number;
  };
  lightIntensity?: number;
}

export function SceneFrame({
  ariaLabel,
  badge,
  camera,
  children,
  className = 'relative h-[320px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base',
  controls,
  lightIntensity = 26,
}: SceneFrameProps) {
  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <span className="sr-only">{ariaLabel}</span>
      {badge && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-line-subtle bg-bg-surface/90 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          {badge}
        </div>
      )}
      <Canvas
        camera={{ position: camera?.position ?? [0, -3.8, 2.4], fov: camera?.fov ?? 48 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[THREE_COLORS.background]} />
        <ambientLight intensity={0.62} />
        <CameraLight intensity={lightIntensity} />
        {children}
        <OrbitControls
          enablePan={controls?.enablePan ?? false}
          enableRotate={controls?.enableRotate ?? true}
          enableZoom={controls?.enableZoom ?? false}
          minDistance={controls?.minDistance}
          maxDistance={controls?.maxDistance}
        />
      </Canvas>
    </div>
  );
}