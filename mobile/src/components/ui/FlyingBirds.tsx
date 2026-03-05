// ============================================================
// MATRA — Flying Birds Background (Reanimated)
// ============================================================
// Small bird silhouettes gliding across the screen.
// Gentle sine-wave flight path with slow fade in/out.
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

interface BirdData {
  id: number;
  startX: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  waveAmplitude: number;
  color: string;
  direction: 1 | -1; // 1 = left-to-right, -1 = right-to-left
}

function generateBirds(count: number): BirdData[] {
  const colors = [
    'rgba(100, 85, 65, 0.35)',
    'rgba(80, 70, 55, 0.30)',
    'rgba(110, 95, 75, 0.28)',
    'rgba(90, 78, 60, 0.32)',
  ];

  return Array.from({ length: count }, (_, i) => {
    const direction = Math.random() > 0.5 ? 1 : -1 as 1 | -1;
    return {
      id: i,
      startX: direction === 1 ? -40 : SCREEN_WIDTH + 40,
      y: SCREEN_HEIGHT * 0.12 + Math.random() * SCREEN_HEIGHT * 0.35,
      size: Math.random() * 8 + 10,
      delay: Math.random() * 12000 + i * 3000,
      duration: Math.random() * 12000 + 18000,
      waveAmplitude: Math.random() * 25 + 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      direction,
    };
  });
}

function AnimatedBird({ bird }: { bird: BirdData }) {
  const progress = useSharedValue(0);
  const wingFlap = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      bird.delay,
      withRepeat(
        withTiming(1, { duration: bird.duration, easing: Easing.linear }),
        -1,
        false
      )
    );
    wingFlap.value = withDelay(
      bird.delay,
      withRepeat(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const travelDistance = SCREEN_WIDTH + 80;
    const tx = bird.startX + bird.direction * progress.value * travelDistance;
    const ty = bird.y + Math.sin(progress.value * Math.PI * 4) * bird.waveAmplitude;
    const flapScale = interpolate(wingFlap.value, [0, 0.5, 1], [0.7, 1.3, 0.7]);
    // Fade in at start, fade out at end
    const opacity = interpolate(progress.value, [0, 0.05, 0.9, 1], [0, 1, 1, 0]);

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scaleY: flapScale },
        { scaleX: bird.direction === -1 ? -1 : 1 },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: bird.size * 2.5,
          height: bird.size,
        },
        animatedStyle,
      ]}
    >
      <Svg width={bird.size * 2.5} height={bird.size} viewBox="0 0 25 10">
        {/* Simple bird silhouette — two curved wing strokes */}
        <Path
          d="M 0 8 Q 6 0, 12.5 5 Q 19 0, 25 8"
          stroke={bird.color}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

interface FlyingBirdsProps {
  count?: number;
}

export function FlyingBirds({ count = 5 }: FlyingBirdsProps) {
  const birds = useMemo(() => generateBirds(count), [count]);

  return (
    <View style={styles.container} pointerEvents="none">
      {birds.map((b) => (
        <AnimatedBird key={b.id} bird={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
