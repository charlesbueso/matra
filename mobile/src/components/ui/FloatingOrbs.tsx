// ============================================================
// MATRA — 3D Floating Orbs (React Three Fiber)
// ============================================================
// Soft translucent orbs floating in 3D space.
// Warm green/amber/cream tones. Gentle bob + rotation.
// ============================================================

import React, { useRef, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Canvas, useFrame, ThreeElements } from '@react-three/fiber/native';
import * as THREE from 'three';

interface OrbData {
  position: [number, number, number];
  color: string;
  scale: number;
  speed: number;
  phaseOffset: number;
}

function Orb({ position, color, scale, speed, phaseOffset }: OrbData) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime() * speed + phaseOffset;
    meshRef.current.position.y = position[1] + Math.sin(t) * 0.3;
    meshRef.current.position.x = position[0] + Math.sin(t * 0.7) * 0.15;
    meshRef.current.rotation.y = t * 0.2;
    meshRef.current.rotation.z = Math.sin(t * 0.5) * 0.1;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.35}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  );
}

interface FloatingOrbsProps {
  count?: number;
  style?: object;
}

export function FloatingOrbs({ count = 6, style }: FloatingOrbsProps) {
  const orbs = useMemo(() => {
    const colors = ['#8BAF5C', '#C49A3C', '#A0B878', '#6B8F3C', '#D4AA4C', '#E5DDD0'];
    return Array.from({ length: count }, (_, i): OrbData => ({
      position: [
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 3 - 2,
      ],
      color: colors[i % colors.length],
      scale: Math.random() * 0.4 + 0.2,
      speed: Math.random() * 0.3 + 0.15,
      phaseOffset: Math.random() * Math.PI * 2,
    }));
  }, [count]);

  // R3F Canvas only works on native (iOS/Android)
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <Canvas
        style={styles.canvas}
        gl={{ alpha: true }}
        camera={{ position: [0, 0, 5], fov: 50 }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 4]} intensity={0.6} color="#F7F2EA" />
        <pointLight position={[-2, 2, 3]} intensity={0.4} color="#C49A3C" />
        {orbs.map((orb, i) => (
          <Orb key={i} {...orb} />
        ))}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  canvas: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
