// ============================================================
// MATRA — Corner Bush (SVG + Reanimated)
// ============================================================
// A small organic bush protruding from the bottom-right corner.
// Gentle wind sway animation on leaves.
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LeafCluster {
  id: number;
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: number;
  duration: number;
}

function generateLeafClusters(): LeafCluster[] {
  const colors = [
    'rgba(107, 143, 60, 0.50)',
    'rgba(139, 175, 92, 0.45)',
    'rgba(90, 130, 50, 0.48)',
    'rgba(122, 158, 74, 0.42)',
    'rgba(80, 125, 45, 0.46)',
    'rgba(100, 150, 55, 0.44)',
  ];

  // Leaf positions relative to bottom-right corner
  const positions = [
    { x: SCREEN_WIDTH - 25, y: SCREEN_HEIGHT - 65, r: 18 },
    { x: SCREEN_WIDTH - 50, y: SCREEN_HEIGHT - 75, r: 15 },
    { x: SCREEN_WIDTH - 15, y: SCREEN_HEIGHT - 45, r: 14 },
    { x: SCREEN_WIDTH - 40, y: SCREEN_HEIGHT - 55, r: 16 },
    { x: SCREEN_WIDTH - 60, y: SCREEN_HEIGHT - 60, r: 12 },
    { x: SCREEN_WIDTH - 30, y: SCREEN_HEIGHT - 85, r: 13 },
    { x: SCREEN_WIDTH - 55, y: SCREEN_HEIGHT - 80, r: 11 },
    { x: SCREEN_WIDTH - 10, y: SCREEN_HEIGHT - 30, r: 16 },
    { x: SCREEN_WIDTH - 45, y: SCREEN_HEIGHT - 40, r: 13 },
    { x: SCREEN_WIDTH - 70, y: SCREEN_HEIGHT - 50, r: 10 },
    { x: SCREEN_WIDTH - 20, y: SCREEN_HEIGHT - 55, r: 12 },
    { x: SCREEN_WIDTH - 35, y: SCREEN_HEIGHT - 90, r: 10 },
  ];

  return positions.map((pos, i) => ({
    id: i,
    cx: pos.x + (Math.random() - 0.5) * 8,
    cy: pos.y + (Math.random() - 0.5) * 6,
    r: pos.r + (Math.random() - 0.5) * 4,
    color: colors[i % colors.length],
    delay: Math.random() * 3000,
    duration: Math.random() * 4000 + 4000,
  }));
}

function AnimatedLeaf({ leaf }: { leaf: LeafCluster }) {
  const sway = useSharedValue(0);

  useEffect(() => {
    sway.value = withDelay(
      leaf.delay,
      withRepeat(
        withTiming(1, { duration: leaf.duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sway.value, [0, 0.5, 1], [-3, 4, -3]) },
      { translateY: interpolate(sway.value, [0, 1], [-2, 2]) },
      { scale: interpolate(sway.value, [0, 0.5, 1], [0.95, 1.06, 0.95]) },
    ],
    opacity: interpolate(sway.value, [0, 0.5, 1], [0.8, 1, 0.8]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: leaf.cx - leaf.r,
          top: leaf.cy - leaf.r,
          width: leaf.r * 2,
          height: leaf.r * 2,
          borderRadius: leaf.r,
          backgroundColor: leaf.color,
        },
        animatedStyle,
      ]}
    />
  );
}

export function CornerBush() {
  const leaves = useMemo(() => generateLeafClusters(), []);

  // Anchor point at bottom-right
  const bx = SCREEN_WIDTH;
  const by = SCREEN_HEIGHT;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Small woody stems */}
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={StyleSheet.absoluteFill}
      >
        <Path
          d={`M ${bx} ${by} C ${bx - 25} ${by - 30}, ${bx - 35} ${by - 50}, ${bx - 45} ${by - 75}`}
          stroke="rgba(139, 115, 85, 0.18)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${bx} ${by - 10} C ${bx - 20} ${by - 25}, ${bx - 40} ${by - 40}, ${bx - 60} ${by - 55}`}
          stroke="rgba(139, 115, 85, 0.15)"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${bx - 5} ${by} C ${bx - 15} ${by - 20}, ${bx - 20} ${by - 35}, ${bx - 30} ${by - 50}`}
          stroke="rgba(139, 115, 85, 0.12)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>

      {/* Animated leaf clusters */}
      {leaves.map((l) => (
        <AnimatedLeaf key={l.id} leaf={l} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
