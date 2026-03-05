// ============================================================
// MATRA — Tree Roots / Vine Undergrowth
// ============================================================
// Softly swaying organic vine strands at the bottom of screen.
// Warm earthy greens and browns. Organic sine-wave motion.
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Vine {
  id: number;
  x: number;
  height: number;
  width: number;
  delay: number;
  duration: number;
  color: string;
  opacity: number;
}

function generateVines(count: number): Vine[] {
  const colors = [
    'rgba(107, 143, 60, 0.45)',
    'rgba(139, 175, 92, 0.40)',
    'rgba(90, 130, 50, 0.42)',
    'rgba(160, 184, 120, 0.35)',
    'rgba(122, 158, 74, 0.42)',
    'rgba(80, 125, 45, 0.38)',
    'rgba(100, 150, 55, 0.40)',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i / count) * SCREEN_WIDTH + (Math.random() - 0.5) * 14,
    height: Math.random() * 70 + 30,
    width: Math.random() * 3.5 + 2,
    delay: Math.random() * 3000,
    duration: Math.random() * 5000 + 5000,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: Math.random() * 0.4 + 0.25,
  }));
}

function VineStrand({ vine }: { vine: Vine }) {
  const sway = useSharedValue(0);

  useEffect(() => {
    sway.value = withDelay(
      vine.delay,
      withRepeat(
        withTiming(1, {
          duration: vine.duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sway.value, [0, 0.5, 1], [-3, 3, -3]) },
      { rotate: `${interpolate(sway.value, [0, 0.5, 1], [-3, 3, -3])}deg` },
    ],
    opacity: interpolate(sway.value, [0, 0.5, 1], [
      vine.opacity * 0.8,
      vine.opacity,
      vine.opacity * 0.8,
    ]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: vine.x,
          bottom: 0,
          width: vine.width,
          height: vine.height,
          borderTopLeftRadius: vine.width * 2,
          borderTopRightRadius: vine.width * 2,
          borderBottomLeftRadius: vine.width * 0.5,
          borderBottomRightRadius: vine.width * 0.5,
          backgroundColor: vine.color,
        },
        animatedStyle,
      ]}
    />
  );
}

interface BioAlgaeProps {
  strandCount?: number;
  height?: number;
  style?: object;
}

export function BioAlgae({ strandCount = 40, height = 0.25, style }: BioAlgaeProps) {
  const vines = useMemo(() => generateVines(strandCount), [strandCount]);
  const zoneHeight = Dimensions.get('window').height * height;

  return (
    <View style={[styles.container, { height: zoneHeight }, style]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', 'rgba(107, 143, 60, 0.10)', 'rgba(90, 130, 50, 0.08)']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      {vines.map((v) => (
        <VineStrand key={v.id} vine={v} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
});
