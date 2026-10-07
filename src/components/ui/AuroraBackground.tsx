import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, Line, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

export type AuroraVariant = 'volt' | 'ocean' | 'grape' | 'sunset';

interface AuroraBackgroundProps {
  variant?: AuroraVariant;
  /** 0–1 strength of the glows */
  intensity?: number;
  /** Faint circuit lines across the hero */
  lines?: boolean;
}

/**
 * The SaveVolt signature: soft aurora glows and faint "power line" strokes behind dark hero
 * headers. Pure SVG, so it scales to any header size and costs nothing at runtime.
 */
const AuroraBackground = ({ variant = 'volt', intensity = 1, lines = true }: AuroraBackgroundProps) => {
  const { colors } = useTheme();
  const palette: Record<AuroraVariant, [string, string, string]> = {
    volt: [colors.auroraA, colors.auroraB, colors.auroraC],
    ocean: [colors.auroraB, colors.info, colors.auroraA],
    grape: [colors.auroraC, colors.rose, colors.auroraB],
    sunset: [colors.amber, colors.rose, colors.auroraC],
  };
  const [a, b, c] = palette[variant];
  const o = Math.max(0, Math.min(intensity, 1));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="auroraA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={a} stopOpacity={0.42 * o} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={b} stopOpacity={0.32 * o} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraC" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={c} stopOpacity={0.36 * o} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="330" cy="40" rx="190" ry="130" fill="url(#auroraA)" />
        <Ellipse cx="40" cy="250" rx="200" ry="120" fill="url(#auroraC)" />
        <Ellipse cx="210" cy="150" rx="150" ry="70" fill="url(#auroraB)" />
        {lines && (
          <>
            <Line x1="-20" y1="210" x2="420" y2="120" stroke={a} strokeOpacity={0.09 * o} strokeWidth={1} />
            <Line x1="-20" y1="240" x2="420" y2="150" stroke={b} strokeOpacity={0.07 * o} strokeWidth={1} />
            <Line x1="-20" y1="270" x2="420" y2="180" stroke={c} strokeOpacity={0.06 * o} strokeWidth={1} />
          </>
        )}
      </Svg>
    </View>
  );
};

export default memo(AuroraBackground);
