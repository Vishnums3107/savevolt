import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useEnergyStore } from '../store/energyStore';
import { themed, ThemeColors } from '../theme';

interface ThemeContextValue {
  isDark: boolean;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  colors: themed(false),
  toggle: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const darkMode = useEnergyStore((s) => s.settings.darkMode);
  const updateSettings = useEnergyStore((s) => s.updateSettings);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark: darkMode,
      colors: themed(darkMode),
      toggle: () => updateSettings({ darkMode: !darkMode }),
    }),
    [darkMode, updateSettings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

/**
 * Builds a stylesheet from the active palette and rebuilds it only when the
 * theme changes. Pass a module-level factory so its identity is stable:
 *
 *   const createStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *   const s = useThemedStyles(createStyles);
 */
export const useThemedStyles = <T,>(factory: (colors: ThemeColors, isDark: boolean) => T): T => {
  const { colors, isDark } = useTheme();
  return useMemo(() => factory(colors, isDark), [factory, colors, isDark]);
};

export type { ThemeColors };
