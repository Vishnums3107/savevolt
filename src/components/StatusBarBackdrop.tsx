import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useStatusBarColor } from './statusBarColor';

/**
 * Solid background behind the status bar so scrolled content never runs under the clock and
 * icons. The top inset is 0 where the system draws an opaque status bar itself (Android 14 and
 * older), so this only appears on edge-to-edge devices.
 */
const StatusBarBackdrop = () => {
  const insets = useContext(SafeAreaInsetsContext);
  const { colors } = useTheme();
  const color = useStatusBarColor((state) => state.color);
  const top = insets?.top ?? 0;
  if (top <= 0) return null;
  return <View pointerEvents="none" style={[styles.backdrop, { height: top, backgroundColor: color ?? colors.background }]} />;
};

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0 },
});

export default StatusBarBackdrop;
