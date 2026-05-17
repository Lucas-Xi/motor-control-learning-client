import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Group, PointLight } from 'three';

interface Props {
  /** 电角度 θ_e（rad），rotor + dq 轴跟着旋转 */
  theta: number;
  /** d 轴分量（A） */
  id: number;
  /** q 轴分量（A） */
  iq: number;
  /** αβ 分量（A），用于在静止系画合成磁通矢量；缺省时由 (id, iq, θ) 反推 */
  iAlpha?: number;
  /** αβ 分量（A） */
  iBeta?: number;
  /** 幅值归一基准（A） */
  amplitude?: number;
  /** 屏幕阅读器描述 */
  ariaLabel?: string;
}

interface SceneProps extends Required<Pick<Props, 'theta' | 'id' | 'iq' | 'amplitude'>> {
  iAlpha: number;
  iBeta: number;
  staticFrame: boolean;
}

function CameraLight() {
  const lightRef = useRef<PointLight>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!lightRef.current) return;
    lightRef.current.position.copy(camera.position);
  });
  return <pointLight ref={lightRef} intensity={24} distance={16} decay={1.6} color="#e7f3ff" />;
}

function RotorFlux({ theta, id, iq, iAlpha, iBeta, amplitude, staticFrame }: SceneProps) {
  const dqAxes = useRef<Group>(null);
  const fluxVec = useRef<Group>(null);
  const Imag = Math.hypot(iAlpha, iBeta);
  const fluxAngle = Imag > 1e-4 ? Math.atan2(iBeta, iAlpha) : 0;
  const fluxLen = Math.min(1.15, Imag / Math.max(amplitude, 0.1));
  useFrame((_, delta) => {
    if (dqAxes.current) {
      if (staticFrame) {
        dqAxes.current.rotation.z = theta;
      } else {
        const cur = dqAxes.current.rotation.z;
        let diff = theta - cur;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        dqAxes.current.rotation.z = cur + diff * Math.min(1, delta * 12);
      }
    }
    if (fluxVec.current) {
      if (staticFrame) {
        fluxVec.current.rotation.z = fluxAngle;
      } else {
        const cur = fluxVec.current.rotation.z;
        let diff = fluxAngle - cur;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        fluxVec.current.rotation.z = cur + diff * Math.min(1, delta * 14);
      }
    }
  });

  // d 轴矢量长度按 id 比例；q 轴按 iq 比例
  const dLen = 0.35 + Math.min(1.0, Math.abs(id) / Math.max(amplitude, 0.1)) * 0.55;
  const qLen = 0.35 + Math.min(1.0, Math.abs(iq) / Math.max(amplitude, 0.1)) * 0.55;
  const fluxBody = 0.55 + fluxLen * 0.55;
  const fluxHead = 0.22;

  return (
    <group rotation={[Math.PI / 2.7, 0, -0.2]}>
      {/* αβ 静止平面：圆盘 + 网格 */}
      <mesh>
        <cylinderGeometry args={[1.05, 1.05, 0.04, 96]} />
        <meshToonMaterial color="#0d1929" />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <torusGeometry args={[1.0, 0.005, 4, 96]} />
        <meshToonMaterial color="#2c3d57" />
      </mesh>
      {/* α 轴（指向 +x，深一点颜色）/ β 轴（指向 +y） */}
      <mesh position={[0.45, 0, 0.025]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 12]} />
        <meshToonMaterial color="#5d7793" />
      </mesh>
      <mesh position={[0, 0.45, 0.025]}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 12]} />
        <meshToonMaterial color="#5d7793" />
      </mesh>

      {/* 合成磁通矢量：αβ 平面里转的箭头，颜色 mint */}
      <group ref={fluxVec} position={[0, 0, 0.05]}>
        <mesh position={[fluxBody / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, fluxBody, 16]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        <mesh position={[fluxBody + fluxHead / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.11, fluxHead, 24]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
      </group>

      {/* dq 旋转坐标系：d 轴 mint、q 轴 fault 色（红粉），便于和 mint 主矢量做对比 */}
      <group ref={dqAxes} position={[0, 0, 0.08]}>
        <mesh position={[dLen / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.026, 0.026, dLen, 12]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        <mesh position={[dLen, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.07, 0.16, 18]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        <mesh position={[0, qLen / 2, 0]}>
          <cylinderGeometry args={[0.026, 0.026, qLen, 12]} />
          <meshToonMaterial color="#ff5c7a" />
        </mesh>
        <mesh position={[0, qLen, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 18]} />
          <meshToonMaterial color="#ff5c7a" />
        </mesh>
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

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/**
 * 立体 αβ + dq 矢量空间：
 *   - 静止 αβ 平面上画三相合成磁通矢量（mint 箭头，长度 ∝ |I|）
 *   - 旋转 dq 坐标轴（d 跟相主磁链 / q 与 d 正交）随 θ_e 一起转
 *   - OrbitControls 默认禁 zoom，只允许 rotate，避免误缩
 */
export function RotorFluxScene({ theta, id, iq, iAlpha, iBeta, amplitude = 6, ariaLabel }: Props) {
  const reduced = usePrefersReducedMotion();
  const resolvedAlpha = useMemo(
    () => (iAlpha !== undefined ? iAlpha : id * Math.cos(theta) - iq * Math.sin(theta)),
    [iAlpha, id, iq, theta],
  );
  const resolvedBeta = useMemo(
    () => (iBeta !== undefined ? iBeta : id * Math.sin(theta) + iq * Math.cos(theta)),
    [iBeta, id, iq, theta],
  );
  const Imag = Math.hypot(resolvedAlpha, resolvedBeta);
  const thetaDeg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  const label =
    ariaLabel ??
    `三维 αβ-dq 矢量空间：θ_e=${thetaDeg.toFixed(0)}°，合成电流矢量 |I|=${Imag.toFixed(2)} A，Id=${id.toFixed(2)} A，Iq=${iq.toFixed(2)} A。可用鼠标拖动旋转视角。`;

  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-[320px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
    >
      <span className="sr-only">{label}</span>
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-line-subtle bg-bg-surface/80 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-ink-muted backdrop-blur">
        αβ 静止 · dq 旋转 · zoom locked
      </div>
      <Canvas camera={{ position: [0, -3.8, 2.4], fov: 48 }} dpr={[1, 1.8]}>
        <color attach="background" args={['#07111f']} />
        <ambientLight intensity={0.62} />
        <CameraLight />
        <RotorFluxMemo
          theta={theta}
          id={id}
          iq={iq}
          iAlpha={resolvedAlpha}
          iBeta={resolvedBeta}
          amplitude={amplitude}
          staticFrame={reduced}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate
          minDistance={3.0}
          maxDistance={5.5}
        />
      </Canvas>
    </div>
  );
}
