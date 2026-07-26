import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { PointLight } from 'three';

interface CameraLightProps {
  color?: string;
  decay?: number;
  distance?: number;
  intensity?: number;
}

export function CameraLight({
  color = '#e7f3ff',
  decay = 1.6,
  distance = 18,
  intensity = 26,
}: CameraLightProps) {
  const lightRef = useRef<PointLight>(null);
  const { camera } = useThree();

  useFrame(() => {
    lightRef.current?.position.copy(camera.position);
  });

  return <pointLight ref={lightRef} color={color} decay={decay} distance={distance} intensity={intensity} />;
}