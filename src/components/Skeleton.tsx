import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  DimensionValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { Radius, Shadows, Spacing } from '../theme';

/** Looping opacity pulse for a placeholder block; static when reduce motion is on. */
const usePulse = () => {
  const value = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(value, { toValue: 0.55, duration: 700, useNativeDriver: true }),
          ]),
        );
        animation.start();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [value]);

  return value;
};

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A single pulsing placeholder block. Decorative; wrap groups in SkeletonCard for a label. */
export const Skeleton = ({ width = '100%', height = 14, radius = Radius.sm, style }: SkeletonProps) => {
  const s = useThemedStyles(createStyles);
  const opacity = usePulse();
  return (
    <Animated.View
      style={[s.block, { width, height, borderRadius: radius, opacity }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
};

interface SkeletonCardProps {
  /** Number of text lines under the title bar */
  lines?: number;
  /** What is loading, announced to screen readers */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** Card-shaped placeholder: a title bar plus a few text lines. */
export const SkeletonCard = ({ lines = 3, label = 'Loading', style }: SkeletonCardProps) => {
  const s = useThemedStyles(createStyles);
  return (
    <View
      style={[s.card, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <Skeleton width="45%" height={18} />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? '70%' : '100%'}
          style={s.line}
        />
      ))}
    </View>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  block: { backgroundColor: c.skeleton },
  card: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  line: { marginTop: Spacing.md },
});

export default Skeleton;
