import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Group, PointLight } from 'three';
import { useSimulationStore } from '../../store/simulationStore';

interface MotorSceneProps {
  /** 电角度 θ_e（弧度），驱动合成磁通矢量旋转 */
  thetaE: number;
  /** 极对数 p：机械角度 = θ_e / p */
  polePairs: number;
  /** Iα 分量（A） */
  iAlpha: number;
  /** Iβ 分量（A） */
  iBeta: number;
  /** |I| 归一化基准（A），用来控制定子绕组发光强度与矢量长度归一化 */
  amplitude: number;
  /** 三相瞬时电流，用于绕组上色 */
  phaseCurrents?: { ia: number; ib: number; ic: number };
  /** 静态模式：reduced motion / 静态预览时不做帧间插值 */
  staticFrame?: boolean;
}

/** 点光源跟随相机：保证侧光稳定，cell shading 高光不漂移 */
function CameraLight() {
  const lightRef = useRef<PointLight>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!lightRef.current) return;
    lightRef.current.position.copy(camera.position);
  });
  return <pointLight ref={lightRef} intensity={28} distance={18} decay={1.6} color="#e7f3ff" />;
}

function MotorCore({ thetaE, polePairs, iAlpha, iBeta, amplitude, phaseCurrents, staticFrame }: MotorSceneProps) {
  const rotor = useRef<Group>(null);
  const fieldVec = useRef<Group>(null);
  const coils = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  const rotorPoles = useMemo(
    () => Array.from({ length: polePairs * 2 }, (_, i) => (i / (polePairs * 2)) * Math.PI * 2),
    [polePairs],
  );

  // 转子按机械角度 θm = θ_e / p 旋转；静态模式下直接 set
  const thetaMechanical = thetaE / Math.max(1, polePairs);
  // 合成磁通矢量方向用 atan2(Iβ, Iα)；长度 = clamp(|I|/amplitude)
  const Imag = Math.hypot(iAlpha, iBeta);
  const fluxAngle = Math.abs(Imag) > 1e-4 ? Math.atan2(iBeta, iAlpha) : 0;
  const fluxLen = Math.min(1.15, Imag / Math.max(amplitude, 0.1));

  useFrame((_, delta) => {
    if (rotor.current) {
      if (staticFrame) {
        rotor.current.rotation.z = thetaMechanical;
      } else {
        // 平滑插值到目标角，避免被 store 大跳触发抖动
        const cur = rotor.current.rotation.z;
        let diff = thetaMechanical - cur;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        rotor.current.rotation.z = cur + diff * Math.min(1, delta * 12);
      }
    }
    if (fieldVec.current) {
      if (staticFrame) {
        fieldVec.current.rotation.z = fluxAngle;
      } else {
        const cur = fieldVec.current.rotation.z;
        let diff = fluxAngle - cur;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        fieldVec.current.rotation.z = cur + diff * Math.min(1, delta * 14);
      }
    }
  });

  const phaseValues = [
    phaseCurrents?.ia ?? amplitude,
    phaseCurrents?.ib ?? -amplitude / 2,
    phaseCurrents?.ic ?? -amplitude / 2,
  ];

  // 矢量箭头长度参数（cylinder 在 +x 方向，长度 = bodyLen + headLen）
  const bodyLen = 0.55 + fluxLen * 0.55;
  const headLen = 0.22;
  const totalLen = bodyLen + headLen;

  return (
    <group rotation={[0, 0, -0.35]}>
      {/* 定子铁芯 —— cell shading 风格：toon 材质 + 弱镜面 */}
      <mesh>
        <torusGeometry args={[1.35, 0.09, 18, 96]} />
        <meshToonMaterial color="#3a5a7e" />
      </mesh>
      {/* 12 个槽 / 三相绕组截面 */}
      {coils.map((angle, index) => {
        const phase = index % 3;
        const phaseCurrent = phaseValues[phase];
        const normalized = Math.min(1.4, Math.abs(phaseCurrent) / Math.max(amplitude, 0.1));
        // 绕组保留三相色卡（A=cyan / B=mint / C=warn），区别于磁通矢量的 mint
        const color = phase === 0 ? '#34d6ff' : phase === 1 ? '#43f7b5' : '#ffb84d';
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0]}
            rotation={[0, 0, angle]}
            scale={[1, 1 + normalized * 0.35, 1]}
          >
            <boxGeometry args={[0.16, 0.44, 0.2]} />
            <meshToonMaterial color={color} />
          </mesh>
        );
      })}
      {/* 转子 */}
      <group ref={rotor}>
        <mesh>
          <cylinderGeometry args={[0.62, 0.62, 0.28, 80]} />
          <meshToonMaterial color="#cfe2f5" />
        </mesh>
        {rotorPoles.map((angle, i) => (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0.16]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.18, 0.5, 0.08]} />
            {/* N 极红 / S 极蓝，靠形状 + 颜色 + 对称布局三通道区分（a11y 友好） */}
            <meshToonMaterial color={i % 2 === 0 ? '#ff5c7a' : '#34d6ff'} />
          </mesh>
        ))}
      </group>
      {/* 合成磁通矢量：从中心出发，方向 = atan2(Iβ, Iα)，长度 ∝ |I|，颜色 = accent.measure (mint) */}
      <group ref={fieldVec} position={[0, 0, 0.36]}>
        {/* 矢量主干 */}
        <mesh position={[bodyLen / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, bodyLen, 16]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        {/* 箭头 */}
        <mesh position={[bodyLen + headLen / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.11, headLen, 24]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        {/* 中心球作为矢量起点视觉锚 */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshToonMaterial color="#43f7b5" />
        </mesh>
        {/* 长度刻度环：根据 |I| 做 1/3、2/3 标记，方便读出幅值占比 */}
        {[totalLen / 3, (totalLen * 2) / 3].map((r) => (
          <mesh key={r} position={[r, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.025, 0.008, 6, 18]} />
            <meshToonMaterial color="#43f7b5" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const MotorCoreMemo = memo(MotorCore, (prev, next) => {
  if (prev.polePairs !== next.polePairs) return false;
  if (prev.staticFrame !== next.staticFrame) return false;
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

interface PublicProps {
  /** 电角度 rad；不传则用 mechanicalDeg + rpm × time（兼容旧调用） */
  thetaE?: number;
  polePairs?: number;
  iAlpha?: number;
  iBeta?: number;
  amplitude?: number;
  phaseCurrents?: { ia: number; ib: number; ic: number };
  /** 屏幕阅读器读到的描述（缺省自动生成） */
  ariaLabel?: string;
}

/**
 * 立体电机视图：作为 MotorAnatomy2D 的兄弟卡片，从任意视角观察定子 / 转子 / 合成磁通矢量。
 * - OrbitControls 默认禁 zoom + 禁 pan，只放开 rotate，避免用户误缩离场景。
 * - 灯光两点：环境光 + 跟随相机的点光，cell shading 风格无过亮镜面。
 * - prefers-reduced-motion 下 staticFrame = true，转子停在 θm = θ_e / p 的快照位置。
 */
export function Motor3D({
  thetaE,
  polePairs = 4,
  iAlpha,
  iBeta,
  amplitude = 4,
  phaseCurrents,
  ariaLabel,
}: PublicProps) {
  const time = useSimulationStore((s) => s.time);
  const motorBasics = useSimulationStore((s) => s.motorBasics);
  const reduced = usePrefersReducedMotion();

  // 兼容旧入口：未传 thetaE 时按 motorBasics 推导（机械角→电角）
  const resolvedThetaE = useMemo(() => {
    if (typeof thetaE === 'number') return thetaE;
    const live = motorBasics.mechanicalDeg + (motorBasics.rpm / 60) * 360 * time;
    return (live * Math.PI) / 180 * motorBasics.polePairs;
  }, [thetaE, time, motorBasics]);

  const resolvedPolePairs = thetaE !== undefined ? polePairs : motorBasics.polePairs;

  // 默认 αβ 矢量：演示模式从 (cos θ_e, sin θ_e) × amplitude 推导，让矢量在旋转
  const resolvedAlpha = iAlpha ?? amplitude * Math.cos(resolvedThetaE);
  const resolvedBeta = iBeta ?? amplitude * Math.sin(resolvedThetaE);
  const Imag = Math.hypot(resolvedAlpha, resolvedBeta);

  const thetaEDeg = ((((resolvedThetaE * 180) / Math.PI) % 360) + 360) % 360;
  const autoLabel =
    ariaLabel ??
    `三维 PMSM 视图：极对数 ${resolvedPolePairs}，当前电角度 θ_e=${thetaEDeg.toFixed(0)}°，合成电流矢量 |I|=${Imag.toFixed(2)} A，方向 ${(((Math.atan2(resolvedBeta, resolvedAlpha) * 180) / Math.PI + 360) % 360).toFixed(0)}°。可用鼠标拖动旋转视角。`;

  return (
    <div
      role="img"
      aria-label={autoLabel}
      className="relative h-[360px] overflow-hidden rounded-2xl border border-line-subtle bg-bg-base"
    >
      <span className="sr-only">{autoLabel}</span>
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-line-subtle bg-bg-surface/80 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-ink-muted backdrop-blur">
        drag to rotate · zoom locked
      </div>
      <Canvas camera={{ position: [0, -4.2, 2.7], fov: 45 }} dpr={[1, 1.8]}>
        <color attach="background" args={['#07111f']} />
        {/* 两点照明：环境光给整体补亮 + 跟随相机的点光给侧面立体感 */}
        <ambientLight intensity={0.62} />
        <CameraLight />
        <MotorCoreMemo
          thetaE={resolvedThetaE}
          polePairs={resolvedPolePairs}
          iAlpha={resolvedAlpha}
          iBeta={resolvedBeta}
          amplitude={amplitude}
          phaseCurrents={phaseCurrents}
          staticFrame={reduced}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate
          minDistance={3.2}
          maxDistance={6}
        />
      </Canvas>
    </div>
  );
}
