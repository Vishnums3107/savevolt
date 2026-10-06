import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import AccessibleTouchable from './AccessibleTouchable';
import { useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { Radius, Spacing, Typography } from '../theme';

export interface EmptyStateAction {
  label: string;
  hint?: string;
  onPress: () => void;
}

interface EmptyStateProps {
  /** Emoji shown above the title (decorative, hidden from screen readers) */
  icon: string;
  title: string;
  body?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** 'screen' fills the available space; 'inline' sits inside a list or card */
  variant?: 'screen' | 'inline';
  style?: StyleProp<ViewStyle>;
}

/**
 * Themed empty state with a softly pulsing glow behind the icon. The pulse is skipped when the
 * user has asked the OS to reduce motion.
 */
const EmptyState = ({
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
  variant = 'screen',
  style,
}: EmptyStateProps) => {
  const s = useThemedStyles(createStyles);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        );
        animation.start();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [pulse]);

  const glowStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.5] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
  };

  return (
    <View style={[variant === 'screen' ? s.screen : s.inline, style]}>
      <View style={s.iconWrap}>
        <Animated.View style={[s.glow, glowStyle]} />
        <Text style={s.icon} accessible={false} importantForAccessibility="no">{icon}</Text>
      </View>
      <Text style={s.title} accessibilityRole="header">{title}</Text>
      {body ? <Text style={s.body}>{body}</Text> : null}
      {primaryAction && (
        <AccessibleTouchable
          label={primaryAction.label}
          hint={primaryAction.hint}
          style={s.primaryButton}
          onPress={primaryAction.onPress}
        >
          <Text style={s.primaryText}>{primaryAction.label}</Text>
        </AccessibleTouchable>
      )}
      {secondaryAction && (
        <AccessibleTouchable
          label={secondaryAction.label}
          hint={secondaryAction.hint}
          style={s.secondaryButton}
          onPress={secondaryAction.onPress}
        >
          <Text style={s.secondaryText}>{secondaryAction.label}</Text>
        </AccessibleTouchable>
      )}
    </View>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.background,
    padding: 40,
  },
  inline: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  iconWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: c.primaryLight,
  },
  icon: { fontSize: 56 },
  title: { ...Typography.h1, color: c.text, marginBottom: Spacing.sm, textAlign: 'center' },
  body: { ...Typography.bodyMedium, color: c.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  primaryButton: {
    marginTop: 22,
    backgroundColor: c.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { ...Typography.label, color: c.onPrimary },
  secondaryButton: {
    marginTop: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { ...Typography.label, color: c.textSecondary },
});

export default EmptyState;
