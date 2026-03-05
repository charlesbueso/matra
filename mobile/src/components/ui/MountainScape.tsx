// ============================================================
// MATRA — Mountain Landscape Background (SVG + Reanimated)
// ============================================================
// Soft layered mountains in the distance with drifting clouds.
// Warm muted tones. Fades in slowly for a panoramic reveal.
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Cloud data ──

interface CloudData {
  id: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  delay: number;
  driftDuration: number;
  driftRange: number;
}

function generateClouds(count: number): CloudData[] {
  const colors = [
    'rgba(255, 252, 245, 0.55)',
    'rgba(250, 247, 240, 0.50)',
    'rgba(245, 240, 232, 0.52)',
    'rgba(255, 250, 242, 0.48)',
    'rgba(240, 235, 225, 0.50)',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    cx: (i / count) * SCREEN_WIDTH * 1.2 - SCREEN_WIDTH * 0.1 + (Math.random() - 0.5) * 40,
    cy: SCREEN_HEIGHT * 0.25 + Math.random() * SCREEN_HEIGHT * 0.20,
    rx: Math.random() * 70 + 50,
    ry: Math.random() * 18 + 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 3000,
    driftDuration: Math.random() * 20000 + 25000,
    driftRange: Math.random() * 30 + 15,
  }));
}

// ── Animated Cloud ──

function AnimatedCloud({ cloud }: { cloud: CloudData }) {
  const drift = useSharedValue(0);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withDelay(
      cloud.delay + 800,
      withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) })
    );
    drift.value = withDelay(
      cloud.delay,
      withRepeat(
        withTiming(1, { duration: cloud.driftDuration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 0.5, 1], [-cloud.driftRange, cloud.driftRange, -cloud.driftRange]) },
      { translateY: interpolate(drift.value, [0, 1], [-4, 4]) },
    ],
    opacity: fadeIn.value * interpolate(drift.value, [0, 0.5, 1], [0.7, 1, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cloud.cx - cloud.rx,
          top: cloud.cy - cloud.ry,
          width: cloud.rx * 2,
          height: cloud.ry * 2,
          borderRadius: cloud.ry,
          backgroundColor: cloud.color,
        },
        animatedStyle,
      ]}
    />
  );
}

// ── Main Component ──

interface MountainScapeProps {
  mountainOpacity?: number;
  cloudCount?: number;
}

export function MountainScape({ mountainOpacity = 0.12, cloudCount = 8 }: MountainScapeProps) {
  const fadeIn = useSharedValue(0);
  const clouds = useMemo(() => generateClouds(cloudCount), [cloudCount]);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) });
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  // Mountain baseline — at the very bottom of the screen, above the navbar
  const mBase = SCREEN_HEIGHT;

  return (
    <Animated.View style={[styles.container, fadeStyle]} pointerEvents="none">
      {/* SVG mountain silhouettes */}
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={styles.svg}
      >
        {/* Far mountain range — lighter, tallest peaks */}
        <Path
          d={`
            M 0 ${mBase}
            L ${SCREEN_WIDTH * 0.08} ${mBase - 160}
            L ${SCREEN_WIDTH * 0.18} ${mBase - 440}
            Q ${SCREEN_WIDTH * 0.22} ${mBase - 520}, ${SCREEN_WIDTH * 0.26} ${mBase - 420}
            L ${SCREEN_WIDTH * 0.35} ${mBase - 240}
            L ${SCREEN_WIDTH * 0.42} ${mBase - 340}
            Q ${SCREEN_WIDTH * 0.48} ${mBase - 400}, ${SCREEN_WIDTH * 0.54} ${mBase - 320}
            L ${SCREEN_WIDTH * 0.62} ${mBase - 180}
            L ${SCREEN_WIDTH * 0.70} ${mBase - 300}
            L ${SCREEN_WIDTH * 0.78} ${mBase - 540}
            Q ${SCREEN_WIDTH * 0.82} ${mBase - 620}, ${SCREEN_WIDTH * 0.86} ${mBase - 520}
            L ${SCREEN_WIDTH * 0.93} ${mBase - 240}
            L ${SCREEN_WIDTH} ${mBase - 120}
            L ${SCREEN_WIDTH} ${mBase}
            Z
          `}
          fill={`rgba(180, 170, 155, ${mountainOpacity * 0.6})`}
        />

        {/* Mid mountain — slightly darker, medium peaks */}
        <Path
          d={`
            M 0 ${mBase}
            L ${SCREEN_WIDTH * 0.05} ${mBase - 90}
            L ${SCREEN_WIDTH * 0.15} ${mBase - 320}
            Q ${SCREEN_WIDTH * 0.20} ${mBase - 390}, ${SCREEN_WIDTH * 0.25} ${mBase - 300}
            L ${SCREEN_WIDTH * 0.32} ${mBase - 140}
            L ${SCREEN_WIDTH * 0.40} ${mBase - 220}
            L ${SCREEN_WIDTH * 0.50} ${mBase - 400}
            Q ${SCREEN_WIDTH * 0.55} ${mBase - 480}, ${SCREEN_WIDTH * 0.60} ${mBase - 380}
            L ${SCREEN_WIDTH * 0.68} ${mBase - 180}
            L ${SCREEN_WIDTH * 0.75} ${mBase - 280}
            L ${SCREEN_WIDTH * 0.85} ${mBase - 160}
            L ${SCREEN_WIDTH * 0.92} ${mBase - 260}
            Q ${SCREEN_WIDTH * 0.96} ${mBase - 300}, ${SCREEN_WIDTH} ${mBase - 200}
            L ${SCREEN_WIDTH} ${mBase}
            Z
          `}
          fill={`rgba(165, 155, 140, ${mountainOpacity * 0.8})`}
        />

        {/* Near foothills — darker, rolling */}
        <Path
          d={`
            M 0 ${mBase}
            L ${SCREEN_WIDTH * 0.10} ${mBase - 110}
            Q ${SCREEN_WIDTH * 0.18} ${mBase - 170}, ${SCREEN_WIDTH * 0.28} ${mBase - 110}
            L ${SCREEN_WIDTH * 0.38} ${mBase - 70}
            Q ${SCREEN_WIDTH * 0.48} ${mBase - 150}, ${SCREEN_WIDTH * 0.58} ${mBase - 90}
            L ${SCREEN_WIDTH * 0.68} ${mBase - 50}
            Q ${SCREEN_WIDTH * 0.78} ${mBase - 130}, ${SCREEN_WIDTH * 0.88} ${mBase - 70}
            L ${SCREEN_WIDTH} ${mBase - 36}
            L ${SCREEN_WIDTH} ${mBase}
            Z
          `}
          fill={`rgba(150, 140, 125, ${mountainOpacity})`}
        />
      </Svg>

      {/* Animated clouds */}
      {clouds.map((c) => (
        <AnimatedCloud key={c.id} cloud={c} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
