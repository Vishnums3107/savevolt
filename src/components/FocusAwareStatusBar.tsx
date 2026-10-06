import React from 'react';
import { StatusBar } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

interface FocusAwareStatusBarProps {
  /**
   * 'hero'    — the screen starts with a dark hero header (light icons in both themes)
   * 'surface' — the screen starts on the plain background (icons follow the theme)
   */
  variant?: 'hero' | 'surface';
}

/**
 * Status bar for screens inside the navigator. Tab screens stay mounted, so only the focused
 * screen renders its status bar; otherwise the last-mounted screen would win.
 * Use a plain StatusBar outside the NavigationContainer (e.g. onboarding).
 */
const FocusAwareStatusBar = ({ variant = 'hero' }: FocusAwareStatusBarProps) => {
  const isFocused = useIsFocused();
  const { colors, isDark } = useTheme();

  if (!isFocused) return null;

  return variant === 'hero' ? (
    <StatusBar barStyle="light-content" backgroundColor={colors.heroGradient[0]} />
  ) : (
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
  );
};

export default FocusAwareStatusBar;
