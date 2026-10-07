import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { create } from 'zustand';
import { ThemeColors, useTheme, useThemedStyles } from '../../context/ThemeContext';
import { Radius, Typography } from '../../theme';
import AccessibleTouchable from '../AccessibleTouchable';

type ToastTone = 'success' | 'info' | 'error' | 'reward';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  current: ToastMessage | null;
  show: (message: string, options?: { tone?: ToastTone; action?: ToastMessage['action'] }) => void;
  hide: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, options) => set({ current: { id: nextId++, message, tone: options?.tone ?? 'success', action: options?.action } }),
  hide: () => set({ current: null }),
}));

/** Short confirmation that does not interrupt (use instead of an OK-only alert). */
export const toast = {
  success: (message: string, action?: ToastMessage['action']) => useToastStore.getState().show(message, { tone: 'success', action }),
  info: (message: string, action?: ToastMessage['action']) => useToastStore.getState().show(message, { tone: 'info', action }),
  error: (message: string) => useToastStore.getState().show(message, { tone: 'error' }),
  reward: (message: string) => useToastStore.getState().show(message, { tone: 'reward' }),
};

const ICONS: Record<ToastTone, string> = {
  success: 'check-circle',
  info: 'information',
  error: 'alert-circle',
  reward: 'star-four-points',
};

/** Mount once near the root. */
export const ToastHost = () => {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(hide, current.action ? 5000 : 3200);
    return () => clearTimeout(timer);
  }, [current, anim, hide]);

  if (!current) return null;
  const tint = current.tone === 'error' ? colors.danger : current.tone === 'reward' ? colors.amber : current.tone === 'info' ? colors.info : colors.primary;
  return (
    <View style={s.host} pointerEvents="box-none">
      <Animated.View
        style={[s.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Icon name={ICONS[current.tone]} size={20} color={tint} accessible={false} importantForAccessibility="no" />
        <Text style={s.text}>{current.message}</Text>
        {current.action ? (
          <AccessibleTouchable
            label={current.action.label}
            onPress={() => { current.action!.onPress(); hide(); }}
            style={s.action}
          >
            <Text style={[s.actionText, { color: tint }]}>{current.action.label}</Text>
          </AccessibleTouchable>
        ) : null}
      </Animated.View>
    </View>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, bottom: 104, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.toastBg, borderRadius: Radius.lg,
    paddingVertical: 12, paddingHorizontal: 16, maxWidth: 520, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  text: { flex: 1, ...Typography.bodyMedium, color: c.toastText },
  action: { paddingHorizontal: 6 },
  actionText: { ...Typography.label, textTransform: 'uppercase' },
});
