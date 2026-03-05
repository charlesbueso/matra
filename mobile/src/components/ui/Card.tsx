// ============================================================
// MATRA — Card Component
// ============================================================
// Warm cream surface with subtle shadow.
// Soft border, organic feel. Depth through shadow.
// Smooth ease-in-out on press.
// ============================================================

import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, Shadows, Animation } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EASE = Easing.inOut(Easing.quad);

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'default' | 'elevated' | 'glow';
  style?: ViewStyle;
}

export function Card({ children, onPress, variant = 'default', style }: CardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) scale.value = withTiming(0.98, { duration: Animation.duration.fast, easing: EASE });
  };

  const handlePressOut = () => {
    if (onPress) scale.value = withTiming(1, { duration: Animation.duration.normal, easing: EASE });
  };

  const cardStyle = [
    styles.base,
    variant === 'elevated' && styles.elevated,
    variant === 'glow' && styles.glow,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, ...cardStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.08)',
    ...Shadows.subtle,
  },
  elevated: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(139, 115, 85, 0.12)',
    ...Shadows.card,
  },
  glow: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(107, 143, 60, 0.18)',
    ...Shadows.glow,
  },
});
