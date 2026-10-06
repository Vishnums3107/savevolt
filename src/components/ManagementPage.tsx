import React, { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Spacing, Typography } from '../theme';
import AccessibleTouchable from './AccessibleTouchable';
import FocusAwareStatusBar from './FocusAwareStatusBar';

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: Spacing.xl, paddingTop: 100, paddingBottom: Spacing.xl },
  title: { ...Typography.h1, color: c.textOnDark },
  subtitle: { ...Typography.bodyMedium, color: c.textOnDarkSub, marginTop: Spacing.sm },
  body: { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md },
  card: { padding: Spacing.lg, backgroundColor: c.card, borderRadius: Radius.lg, gap: Spacing.sm },
  heading: { ...Typography.h3, color: c.text },
  text: { ...Typography.bodyMedium, color: c.textSecondary },
  value: { ...Typography.bodyMedium, color: c.text },
  notice: { ...Typography.bodyMedium, color: c.primaryText },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  input: { ...Typography.bodyMedium, color: c.text, backgroundColor: c.background, borderRadius: Radius.md,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: Spacing.md, minHeight: 48 },
  button: { borderRadius: Radius.md, backgroundColor: c.primarySoft, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  buttonText: { ...Typography.label, color: c.primaryText, textAlign: 'center' },
  danger: { backgroundColor: c.dangerSoft },
  dangerText: { color: c.dangerText },
  disabled: { opacity: 0.5 },
});

export const useManagementStyles = () => useThemedStyles(createStyles);

export const ManagementCard = ({ children }: { children: ReactNode }) => {
  const s = useManagementStyles();
  return <View style={s.card}>{children}</View>;
};

export const ManagementButton = ({ label, onPress, disabled = false, danger = false }: {
  label: string; onPress: () => void; disabled?: boolean; danger?: boolean;
}) => {
  const s = useManagementStyles();
  return <AccessibleTouchable label={label} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled }} style={[s.button, danger && s.danger, disabled && s.disabled]}>
    <Text style={[s.buttonText, danger && s.dangerText]}>{label}</Text>
  </AccessibleTouchable>;
};

export const ManagementInput = ({ label, ...props }: TextInputProps & { label: string }) => {
  const s = useManagementStyles();
  const { colors, isDark } = useTheme();
  return <><Text style={s.value}>{label}</Text><TextInput accessibilityLabel={label} style={s.input}
    placeholderTextColor={colors.textMuted} keyboardAppearance={isDark ? 'dark' : 'light'} {...props} /></>;
};

export default function ManagementPage({ title, subtitle, children }: {
  title: string; subtitle: string; children: ReactNode;
}) {
  const s = useManagementStyles();
  const { colors } = useTheme();
  return <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
    <FocusAwareStatusBar variant="hero" />
    <LinearGradient colors={colors.heroGradient} style={s.header}>
      <Text style={s.title} accessibilityRole="header">{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>
    </LinearGradient>
    <View style={s.body}>{children}</View>
  </ScrollView>;
}
