// ============================================================
// MATRA — Tree Trunk Background (SVG + Reanimated)
// ============================================================
// A majestic tree trunk rising from the bottom with
// organic branches spreading. Creamy oak coloring.
// Animated leaves gently blowing.
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

interface LeafBud {
  id: number;
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: number;
  duration: number;
}

function generateLeafBuds(count: number): LeafBud[] {
  const colors = [
    'rgba(107, 143, 60, 0.45)',
    'rgba(139, 175, 92, 0.40)',
    'rgba(160, 184, 120, 0.42)',
    'rgba(122, 158, 74, 0.38)',
    'rgba(90, 140, 50, 0.35)',
    'rgba(80, 130, 45, 0.42)',
    'rgba(100, 155, 55, 0.38)',
  ];

  // Cluster buds around branch endpoints and along branches
  const branchTips = [
    { x: SCREEN_WIDTH * 0.15, y: SCREEN_HEIGHT * 0.33, spread: 80 },
    { x: SCREEN_WIDTH * 0.35, y: SCREEN_HEIGHT * 0.23, spread: 70 },
    { x: SCREEN_WIDTH * 0.55, y: SCREEN_HEIGHT * 0.27, spread: 75 },
    { x: SCREEN_WIDTH * 0.75, y: SCREEN_HEIGHT * 0.21, spread: 65 },
    { x: SCREEN_WIDTH * 0.85, y: SCREEN_HEIGHT * 0.35, spread: 80 },
    { x: SCREEN_WIDTH * 0.25, y: SCREEN_HEIGHT * 0.43, spread: 70 },
    { x: SCREEN_WIDTH * 0.65, y: SCREEN_HEIGHT * 0.40, spread: 75 },
    { x: SCREEN_WIDTH * 0.06, y: SCREEN_HEIGHT * 0.25, spread: 50 },
    { x: SCREEN_WIDTH * 0.94, y: SCREEN_HEIGHT * 0.27, spread: 50 },
    { x: SCREEN_WIDTH * 0.45, y: SCREEN_HEIGHT * 0.30, spread: 60 },
    { x: SCREEN_WIDTH * 0.30, y: SCREEN_HEIGHT * 0.29, spread: 55 },
    { x: SCREEN_WIDTH * 0.70, y: SCREEN_HEIGHT * 0.31, spread: 55 },
  ];

  return Array.from({ length: count }, (_, i) => {
    const tip = branchTips[i % branchTips.length];
    return {
      id: i,
      cx: tip.x + (Math.random() - 0.5) * tip.spread,
      cy: tip.y + (Math.random() - 0.5) * 50,
      r: Math.random() * 18 + 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 4000,
      duration: Math.random() * 5000 + 5000,
    };
  });
}

function AnimatedLeafBud({ bud }: { bud: LeafBud }) {
  const sway = useSharedValue(0);

  useEffect(() => {
    sway.value = withDelay(
      bud.delay,
      withRepeat(
        withTiming(1, { duration: bud.duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sway.value, [0, 0.5, 1], [-6, 6, -6]) },
      { translateY: interpolate(sway.value, [0, 1], [-4, 4]) },
      { scale: interpolate(sway.value, [0, 0.5, 1], [0.92, 1.08, 0.92]) },
    ],
    opacity: interpolate(sway.value, [0, 0.5, 1], [0.75, 1, 0.75]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: bud.cx - bud.r,
          top: bud.cy - bud.r,
          width: bud.r * 2,
          height: bud.r * 2,
          borderRadius: bud.r,
          backgroundColor: bud.color,
        },
        animatedStyle,
      ]}
    />
  );
}

interface TreeTrunkProps {
  opacity?: number;
}

export function TreeTrunk({ opacity = 0.15 }: TreeTrunkProps) {
  const buds = useMemo(() => generateLeafBuds(55), []);
  const cx = SCREEN_WIDTH * 0.5;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* SVG tree trunk and branches */}
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={StyleSheet.absoluteFill}
      >
        {/* Main trunk */}
        <Path
          d={`
            M ${cx - 24} ${SCREEN_HEIGHT}
            C ${cx - 28} ${SCREEN_HEIGHT * 0.75}, ${cx - 20} ${SCREEN_HEIGHT * 0.6}, ${cx - 14} ${SCREEN_HEIGHT * 0.50}
            C ${cx - 8} ${SCREEN_HEIGHT * 0.43}, ${cx - 2} ${SCREEN_HEIGHT * 0.37}, ${cx + 5} ${SCREEN_HEIGHT * 0.33}
            L ${cx + 18} ${SCREEN_HEIGHT * 0.33}
            C ${cx + 12} ${SCREEN_HEIGHT * 0.37}, ${cx + 8} ${SCREEN_HEIGHT * 0.43}, ${cx + 14} ${SCREEN_HEIGHT * 0.50}
            C ${cx + 20} ${SCREEN_HEIGHT * 0.6}, ${cx + 28} ${SCREEN_HEIGHT * 0.75}, ${cx + 24} ${SCREEN_HEIGHT}
            Z
          `}
          fill={`rgba(139, 115, 85, ${opacity})`}
        />

        {/* Left main branch */}
        <Path
          d={`
            M ${cx - 8} ${SCREEN_HEIGHT * 0.55}
            C ${cx - 40} ${SCREEN_HEIGHT * 0.47}, ${cx - 80} ${SCREEN_HEIGHT * 0.37}, ${SCREEN_WIDTH * 0.15} ${SCREEN_HEIGHT * 0.33}
          `}
          stroke={`rgba(139, 115, 85, ${opacity * 0.8})`}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />

        {/* Right main branch */}
        <Path
          d={`
            M ${cx + 8} ${SCREEN_HEIGHT * 0.53}
            C ${cx + 50} ${SCREEN_HEIGHT * 0.43}, ${cx + 100} ${SCREEN_HEIGHT * 0.30}, ${SCREEN_WIDTH * 0.85} ${SCREEN_HEIGHT * 0.35}
          `}
          stroke={`rgba(139, 115, 85, ${opacity * 0.8})`}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
        />

        {/* Upper left branch */}
        <Path
          d={`
            M ${cx - 5} ${SCREEN_HEIGHT * 0.47}
            C ${cx - 30} ${SCREEN_HEIGHT * 0.35}, ${cx - 60} ${SCREEN_HEIGHT * 0.25}, ${SCREEN_WIDTH * 0.35} ${SCREEN_HEIGHT * 0.23}
          `}
          stroke={`rgba(139, 115, 85, ${opacity * 0.7})`}
          strokeWidth={5.5}
          fill="none"
          strokeLinecap="round"
        />

        {/* Upper right branch */}
        <Path
          d={`
            M ${cx + 5} ${SCREEN_HEIGHT * 0.45}
            C ${cx + 35} ${SCREEN_HEIGHT * 0.31}, ${cx + 70} ${SCREEN_HEIGHT * 0.23}, ${SCREEN_WIDTH * 0.75} ${SCREEN_HEIGHT * 0.21}
          `}
          stroke={`rgba(139, 115, 85, ${opacity * 0.7})`}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />

        {/* Small twig branches */}
        <Path
          d={`M ${SCREEN_WIDTH * 0.15} ${SCREEN_HEIGHT * 0.33} C ${SCREEN_WIDTH * 0.10} ${SCREEN_HEIGHT * 0.29}, ${SCREEN_WIDTH * 0.08} ${SCREEN_HEIGHT * 0.27}, ${SCREEN_WIDTH * 0.06} ${SCREEN_HEIGHT * 0.25}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.5})`}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${SCREEN_WIDTH * 0.85} ${SCREEN_HEIGHT * 0.35} C ${SCREEN_WIDTH * 0.90} ${SCREEN_HEIGHT * 0.31}, ${SCREEN_WIDTH * 0.92} ${SCREEN_HEIGHT * 0.29}, ${SCREEN_WIDTH * 0.94} ${SCREEN_HEIGHT * 0.27}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.5})`}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />

        {/* Additional mid-branches for fullness */}
        <Path
          d={`M ${cx - 3} ${SCREEN_HEIGHT * 0.51} C ${cx - 20} ${SCREEN_HEIGHT * 0.45}, ${cx - 45} ${SCREEN_HEIGHT * 0.41}, ${SCREEN_WIDTH * 0.25} ${SCREEN_HEIGHT * 0.43}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.6})`}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${cx + 3} ${SCREEN_HEIGHT * 0.49} C ${cx + 25} ${SCREEN_HEIGHT * 0.43}, ${cx + 55} ${SCREEN_HEIGHT * 0.39}, ${SCREEN_WIDTH * 0.65} ${SCREEN_HEIGHT * 0.40}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.6})`}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />

        {/* Root system at bottom */}
        <Path
          d={`M ${cx - 24} ${SCREEN_HEIGHT} C ${cx - 55} ${SCREEN_HEIGHT * 0.94}, ${cx - 90} ${SCREEN_HEIGHT * 0.97}, ${SCREEN_WIDTH * 0.08} ${SCREEN_HEIGHT}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.6})`}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${cx + 24} ${SCREEN_HEIGHT} C ${cx + 55} ${SCREEN_HEIGHT * 0.93}, ${cx + 90} ${SCREEN_HEIGHT * 0.96}, ${SCREEN_WIDTH * 0.92} ${SCREEN_HEIGHT}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.6})`}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${cx - 10} ${SCREEN_HEIGHT} C ${cx - 30} ${SCREEN_HEIGHT * 0.96}, ${cx - 45} ${SCREEN_HEIGHT * 0.98}, ${SCREEN_WIDTH * 0.25} ${SCREEN_HEIGHT}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.4})`}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={`M ${cx + 10} ${SCREEN_HEIGHT} C ${cx + 30} ${SCREEN_HEIGHT * 0.96}, ${cx + 45} ${SCREEN_HEIGHT * 0.98}, ${SCREEN_WIDTH * 0.75} ${SCREEN_HEIGHT}`}
          stroke={`rgba(139, 115, 85, ${opacity * 0.4})`}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>

      {/* Animated leaf buds at branch tips */}
      {buds.map((b) => (
        <AnimatedLeafBud key={b.id} bud={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
