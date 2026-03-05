// ============================================================
// MATRA — Voice Waveform Visualizer
// ============================================================
// Warm organic waveform bars. Smooth ease-in-out curves.
// Forest green tones. No spring bounce.
// ============================================================

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Colors } from '../../theme/tokens';

interface WaveformBarProps {
  index: number;
  isActive: boolean;
  amplitude: number;
  color?: string;
}

function WaveformBar({ index, isActive, amplitude, color = Colors.accent.cyan }: WaveformBarProps) {
  const animation = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      animation.value = withDelay(
        index * 80,
        withRepeat(
          withTiming(1, {
            duration: 700 + Math.random() * 500,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true
        )
      );
    } else {
      animation.value = withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) });
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => {
    const height = isActive
      ? interpolate(animation.value, [0, 1], [4, 24 * amplitude])
      : 4;

    return {
      height,
      opacity: interpolate(animation.value, [0, 1], [0.3, 0.9]),
    };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

interface VoiceWaveformProps {
  isActive: boolean;
  barCount?: number;
  amplitudes?: number[];
  color?: string;
}

export function VoiceWaveform({
  isActive,
  barCount = 24,
  amplitudes,
  color,
}: VoiceWaveformProps) {
  const defaultAmplitudes = Array.from({ length: barCount }, () => Math.random() * 0.8 + 0.2);
  const bars = amplitudes || defaultAmplitudes;

  return (
    <View style={styles.container}>
      {bars.map((amp, i) => (
        <WaveformBar
          key={i}
          index={i}
          isActive={isActive}
          amplitude={amp}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
});
