// ============================================================
// MATRA — Tree Canopy Background
// ============================================================
// Warm light filtering through animated leaves.
// Gentle drifting leaf particles with depth.
// Creamy oak backdrop with living canopy.
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Leaf {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  driftDuration: number;
  blurred: boolean;
  color: string;
  rotation: number;
}

function generateLeaves(count: number): Leaf[] {
  const leafColors = [
    'rgba(107, 143, 60, 0.25)',   // forest green
    'rgba(139, 175, 92, 0.20)',   // spring green
    'rgba(160, 184, 120, 0.18)',  // sage
    'rgba(122, 158, 74, 0.22)',   // olive
    'rgba(196, 154, 60, 0.12)',   // golden (light patch)
    'rgba(139, 115, 85, 0.06)',   // bark brown (soft dot)
  ];

  return Array.from({ length: count }, (_, i) => {
    const blurred = Math.random() > 0.6;
    return {
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      y: Math.random() * SCREEN_HEIGHT,
      size: blurred ? Math.random() * 12 + 6 : Math.random() * 6 + 2,
      opacity: blurred ? Math.random() * 0.15 + 0.05 : Math.random() * 0.35 + 0.1,
      delay: Math.random() * 5000,
      driftDuration: Math.random() * 10000 + 8000,
      blurred,
      color: leafColors[Math.floor(Math.random() * leafColors.length)],
      rotation: Math.random() * 360,
    };
  });
}

function DriftLeaf({ leaf }: { leaf: Leaf }) {
  const drift = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    drift.value = withDelay(
      leaf.delay,
      withRepeat(
        withTiming(1, {
          duration: leaf.driftDuration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );
    sway.value = withDelay(
      leaf.delay + 800,
      withRepeat(
        withTiming(1, {
          duration: leaf.driftDuration * 0.7,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sway.value, [0, 1], [leaf.opacity * 0.5, leaf.opacity]),
    transform: [
      { translateY: interpolate(drift.value, [0, 1], [0, -20]) },
      { translateX: interpolate(drift.value, [0, 0.5, 1], [0, 10, 0]) },
      { rotate: `${interpolate(sway.value, [0, 1], [leaf.rotation - 8, leaf.rotation + 8])}deg` },
      { scale: interpolate(sway.value, [0, 0.5, 1], [1, 1.05, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: leaf.x,
          top: leaf.y,
          width: leaf.size,
          height: leaf.size * (leaf.blurred ? 0.7 : 1),
          borderRadius: leaf.blurred ? leaf.size / 2 : leaf.size / 3,
          backgroundColor: leaf.color,
        },
        animatedStyle,
      ]}
    />
  );
}

interface SpaceOceanProps {
  particleCount?: number;
  starCount?: number;
  children?: React.ReactNode;
  showVignette?: boolean;
}

export function SpaceOcean({ particleCount = 40, starCount, children, showVignette = true }: SpaceOceanProps) {
  const count = starCount ?? particleCount;
  const leaves = useMemo(() => generateLeaves(count), [count]);

  return (
    <View style={styles.container}>
      {/* Warm light gradient overlay */}
      {showVignette && (
        <LinearGradient
          colors={['rgba(237, 230, 216, 0.6)', 'transparent', 'rgba(237, 230, 216, 0.3)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      )}

      {/* Floating leaf particles */}
      <View style={styles.particleContainer}>
        {leaves.map((l) => (
          <DriftLeaf key={l.id} leaf={l} />
        ))}
      </View>

      {children}
    </View>
  );
}

export { SpaceOcean as StarField };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.void,
  },
  particleContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
