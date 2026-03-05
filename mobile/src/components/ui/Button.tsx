// ============================================================
// MATRA — Reusable Button Component
// ============================================================
// Soft rounded corners (20px), warm cream bg,
// subtle shadow when active, gentle press feedback.
// Smooth ease-in-out only.
// ============================================================

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Animation } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'premium' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 38, paddingHorizontal: Spacing.lg, fontSize: Typography.sizes.caption },
  md: { height: 50, paddingHorizontal: Spacing.xl, fontSize: Typography.sizes.body },
  lg: { height: 58, paddingHorizontal: Spacing.xxl, fontSize: Typography.sizes.h4 },
};

const EASE = Easing.inOut(Easing.quad);

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: Animation.duration.fast, easing: EASE });
    glowOpacity.value = withTiming(1, { duration: Animation.duration.fast, easing: EASE });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: Animation.duration.normal, easing: EASE });
    glowOpacity.value = withTiming(0, { duration: Animation.duration.slow, easing: EASE });
  };

  const sizeStyle = sizeStyles[size];
  const isGradient = variant === 'primary' || variant === 'premium';

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={Colors.text.starlight} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            style={[
              styles.text,
              { fontSize: sizeStyle.fontSize },
              variant === 'ghost' && styles.textGhost,
              variant === 'secondary' && styles.textSecondary,
              disabled && styles.textDisabled,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </>
  );

  if (isGradient) {
    const gradientColors = variant === 'premium'
      ? Colors.gradients.premium
      : Colors.gradients.bioluminescent;

    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[animatedStyle, style]}
      >
        <LinearGradient
          colors={gradientColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.base,
            {
              height: sizeStyle.height,
              paddingHorizontal: sizeStyle.paddingHorizontal,
            },
            disabled && styles.disabled,
          ]}
        >
          {content}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        styles.base,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
        },
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        style,
      ]}
    >
      {/* Inner glow layer */}
      <Animated.View style={[styles.innerGlow, glowStyle]} />
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,  // 20px — soft rounded
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  secondary: {
    backgroundColor: 'rgba(107, 143, 60, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(107, 143, 60, 0.25)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: 'rgba(196, 102, 90, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 102, 90, 0.3)',
  },
  disabled: {
    opacity: 0.35,
  },
  text: {
    color: Colors.text.starlight,
    fontFamily: Typography.fonts.bodySemiBold,
    letterSpacing: Typography.letterSpacing.wide,
  },
  textGhost: {
    color: Colors.accent.cyan,
  },
  textSecondary: {
    color: Colors.accent.cyan,
  },
  textDisabled: {
    color: Colors.text.shadow,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(107, 143, 60, 0.06)',
    borderRadius: BorderRadius.lg,
  },
});
