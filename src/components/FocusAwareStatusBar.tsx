import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { newStatusBarOwner, useStatusBarColor } from './statusBarColor';

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
  const owner = useRef(0);
  if (owner.current === 0) owner.current = newStatusBarOwner();
  const background = variant === 'hero' ? colors.heroGradient[0] : colors.background;

  // Edge-to-edge Android ignores backgroundColor, so StatusBarBackdrop paints this colour too
  useEffect(() => {
    if (!isFocused) return undefined;
    const id = owner.current;
    useStatusBarColor.getState().claim(id, background);
    return () => useStatusBarColor.getState().release(id);
  }, [isFocused, background]);

  if (!isFocused) return null;

  return variant === 'hero' ? (
    <StatusBar barStyle="light-content" backgroundColor={background} />
  ) : (
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={background} />
  );
};

export default FocusAwareStatusBar;
