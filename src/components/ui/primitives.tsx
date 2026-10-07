import React, { ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollViewProps,
  StatusBar,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeColors, useTheme, useThemedStyles } from '../../context/ThemeContext';
import { Radius, Shadows, Spacing, Typography } from '../../theme';
import AccessibleTouchable from '../AccessibleTouchable';
import FocusAwareStatusBar from '../FocusAwareStatusBar';
import AuroraBackground, { AuroraVariant } from './AuroraBackground';
import { alpha, useReducedMotion } from './motion';

export type Tone = 'primary' | 'info' | 'accent' | 'warning' | 'danger' | 'success' | 'neutral';

/** Solid colour, soft tint and readable text colour for a tone. */
export const toneColors = (c: ThemeColors, tone: Tone) => {
  switch (tone) {
    case 'info': return { solid: c.info, soft: c.infoSoft, text: c.info, gradient: c.gradOcean };
    case 'accent': return { solid: c.accent, soft: c.accentLight, text: c.accent, gradient: c.gradGrape };
    case 'warning': return { solid: c.warning, soft: c.warningSoft, text: c.warning, gradient: c.gradSunset };
    case 'danger': return { solid: c.danger, soft: c.dangerSoft, text: c.dangerText, gradient: [c.danger, c.rose] as [string, string] };
    case 'success': return { solid: c.success, soft: c.successSoft, text: c.success, gradient: c.gradVolt };
    case 'neutral': return { solid: c.textSecondary, soft: c.surfaceMuted, text: c.textSecondary, gradient: c.gradNight };
    default: return { solid: c.primary, soft: c.primarySoft, text: c.primaryText, gradient: c.gradVolt };
  }
};

// Fallback top inset when there is no SafeAreaProvider (tests)
const STATUS_TOP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

/** Height drawn under the status bar: 0 where Android draws an opaque status bar itself. */
const useTopInset = () => {
  const insets = useContext(SafeAreaInsetsContext);
  return insets ? insets.top : STATUS_TOP;
};

// ─── Screen ──────────────────────────────────────────────────────

interface ScreenProps extends ScrollViewProps {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Status bar style for what sits at the top of the screen */
  statusBar?: 'hero' | 'surface';
  /** Stack screens: the solid band shown after scrolling also sits behind the floating back button */
  withBack?: boolean;
}

/** Scrolling page with the themed background, pull-to-refresh and room above the tab bar. */
export const Screen = ({
  children, refreshing, onRefresh, statusBar = 'hero', withBack = false, contentContainerStyle, onScroll, ...rest
}: ScreenProps) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const scrollY = useRef(new Animated.Value(0)).current;
  const handleScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScroll }),
    [scrollY, onScroll],
  );
  // Once the hero scrolls away, the status bar (and back button) get a solid band instead of floating over content
  const bandHeight = useTopInset() + (withBack ? 58 : 0);
  const bandOpacity = scrollY.interpolate({ inputRange: [bandHeight * 0.5, bandHeight * 1.5], outputRange: [0, 1], extrapolate: 'clamp' });
  const bandColor = statusBar === 'surface' ? colors.background : colors.heroGradient[0];
  return (
    <View style={s.screen}>
      <Animated.ScrollView
        style={s.screen}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[s.screenContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        ) : undefined}
        {...rest}
      >
        <FocusAwareStatusBar variant={statusBar} />
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[s.screenBand, { height: bandHeight, opacity: bandOpacity, backgroundColor: bandColor }]}
      />
    </View>
  );
};

// ─── Hero header ─────────────────────────────────────────────────

interface HeroHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  variant?: AuroraVariant;
  /** Stack screens leave room for the floating back button */
  withBack?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  /** Extra space at the bottom for cards that overlap the hero */
  overlap?: number;
  style?: StyleProp<ViewStyle>;
}

export const HeroHeader = ({
  eyebrow, title, subtitle, variant = 'volt', withBack = false, right, children, overlap = 0, style,
}: HeroHeaderProps) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const topInset = useTopInset();
  return (
    <LinearGradient
      colors={colors.heroGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, { paddingTop: topInset + (withBack ? 58 : 20), paddingBottom: 26 + overlap }, style]}
    >
      <AuroraBackground variant={variant} />
      <View style={s.heroTop}>
        <View style={s.heroTitles}>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          <Text style={s.heroTitle} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={s.heroSubtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={s.heroRight}>{right}</View> : null}
      </View>
      {children}
    </LinearGradient>
  );
};

/** Translucent panel for content drawn on the hero. */
export const GlassPanel = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => {
  const s = useThemedStyles(createStyles);
  return <View style={[s.glass, style]}>{children}</View>;
};

/** Round translucent icon button for the hero (e.g. settings, assistant). */
export const HeroIconButton = ({ icon, label, onPress, badge }: { icon: string; label: string; onPress: () => void; badge?: boolean }) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <AccessibleTouchable label={label} onPress={onPress} style={s.heroIconButton}>
      <Icon name={icon} size={21} color={colors.textOnDark} accessible={false} importantForAccessibility="no" />
      {badge ? <View style={s.heroIconBadge} /> : null}
    </AccessibleTouchable>
  );
};

// ─── Card & section ──────────────────────────────────────────────

interface CardProps {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  icon?: string;
  tone?: Tone;
  action?: { label: string; onPress: () => void; hint?: string };
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export const Card = ({ children, title, subtitle, icon, tone = 'primary', action, style, padded = true, onPress, accessibilityLabel }: CardProps) => {
  const s = useThemedStyles(createStyles);
  const header = (title || action) ? (
    <View style={s.cardHeader}>
      {icon ? <IconBubble icon={icon} tone={tone} size={34} /> : null}
      <View style={s.cardHeaderText}>
        {title ? <Text style={s.cardTitle} accessibilityRole="header">{title}</Text> : null}
        {subtitle ? <Text style={s.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <AccessibleTouchable label={action.label} hint={action.hint} onPress={action.onPress} style={s.cardAction}>
          <Text style={s.cardActionText}>{action.label}</Text>
        </AccessibleTouchable>
      ) : null}
    </View>
  ) : null;
  const body = (
    <>
      {header}
      {children}
    </>
  );
  if (onPress) {
    return (
      <AccessibleTouchable label={accessibilityLabel ?? title ?? 'Open'} onPress={onPress} style={[s.card, padded && s.cardPadded, style]}>
        {body}
      </AccessibleTouchable>
    );
  }
  return <View style={[s.card, padded && s.cardPadded, style]} accessibilityLabel={accessibilityLabel}>{body}</View>;
};

export const SectionHeader = ({ title, subtitle, action, style }: {
  title: string; subtitle?: string; action?: { label: string; onPress: () => void }; style?: StyleProp<ViewStyle>;
}) => {
  const s = useThemedStyles(createStyles);
  return (
    <View style={[s.sectionHeader, style]}>
      <View style={s.flex}>
        <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <AccessibleTouchable label={action.label} onPress={action.onPress} style={s.sectionAction}>
          <Text style={s.cardActionText}>{action.label}</Text>
        </AccessibleTouchable>
      ) : null}
    </View>
  );
};

// ─── Buttons ─────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export const Button = ({
  label, onPress, variant = 'primary', size = 'md', icon, loading = false, disabled = false, full = false, hint, style,
}: ButtonProps) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const height = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const textStyle: StyleProp<TextStyle> = [
    size === 'sm' ? s.buttonTextSm : s.buttonText,
    variant === 'primary' && { color: colors.onPrimary },
    variant === 'secondary' && { color: colors.primaryText },
    variant === 'ghost' && { color: colors.text },
    variant === 'danger' && { color: colors.dangerText },
    variant === 'glass' && { color: colors.textOnDark },
  ];
  const iconColor = variant === 'primary' ? colors.onPrimary : variant === 'secondary' ? colors.primaryText
    : variant === 'danger' ? colors.dangerText : variant === 'glass' ? colors.textOnDark : colors.text;
  const content = loading ? (
    <ActivityIndicator color={iconColor} />
  ) : (
    <View style={s.buttonInner}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={iconColor} accessible={false} importantForAccessibility="no" /> : null}
      <Text style={textStyle} numberOfLines={1}>{label}</Text>
    </View>
  );
  const shell: StyleProp<ViewStyle> = [
    s.button,
    { minHeight: height, paddingHorizontal: size === 'sm' ? 14 : 20 },
    full && s.buttonFull,
    variant === 'secondary' && { backgroundColor: colors.primarySoft },
    variant === 'ghost' && { backgroundColor: colors.surfaceMuted },
    variant === 'danger' && { backgroundColor: colors.dangerSoft },
    variant === 'glass' && { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.glassBorder },
    (disabled || loading) && s.disabled,
  ];
  return (
    <AccessibleTouchable
      label={label}
      hint={hint}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[full && s.buttonFull, style]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={colors.gradVolt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shell}>
          {content}
        </LinearGradient>
      ) : (
        <View style={shell}>{content}</View>
      )}
    </AccessibleTouchable>
  );
};

// ─── Chips & segmented control ───────────────────────────────────

export const Chip = ({ label, selected = false, onPress, icon, tone = 'primary', onDark = false }: {
  label: string; selected?: boolean; onPress: () => void; icon?: string; tone?: Tone; onDark?: boolean;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  const fg = selected ? (tone === 'primary' ? colors.onPrimary : colors.textOnDark) : onDark ? colors.textOnDarkSub : colors.textSecondary;
  return (
    <AccessibleTouchable
      label={label}
      role="radio"
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      style={[
        s.chip,
        onDark && { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        selected && { backgroundColor: t.solid, borderColor: t.solid },
      ]}
    >
      <View style={s.buttonInner}>
        {icon ? <Icon name={icon} size={15} color={fg} accessible={false} importantForAccessibility="no" /> : null}
        <Text style={[s.chipText, { color: fg }]}>{label}</Text>
      </View>
    </AccessibleTouchable>
  );
};

export function Segmented<T extends string>({ options, value, onChange, onDark = false, style }: {
  options: { key: T; label: string }[]; value: T; onChange: (key: T) => void; onDark?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={[s.segmented, onDark && { backgroundColor: colors.glass, borderColor: colors.glassBorder }, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <AccessibleTouchable
            key={option.key}
            label={option.label}
            role="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={[s.segment, selected && (onDark ? { backgroundColor: colors.glassStrong } : s.segmentSelected)]}
          >
            <Text style={[s.segmentText, onDark && { color: colors.textOnDarkSub }, selected && (onDark ? { color: colors.textOnDark } : s.segmentTextSelected)]}>
              {option.label}
            </Text>
          </AccessibleTouchable>
        );
      })}
    </View>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────

export const Stepper = ({ value, onChange, step = 1, min = 0, max = Number.MAX_SAFE_INTEGER, format, label, compact = false }: {
  value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number;
  format?: (value: number) => string; label: string; compact?: boolean;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const display = format ? format(value) : String(value);
  const set = (next: number) => onChange(Math.min(Math.max(Math.round(next / step) * step, min), max));
  return (
    <View
      style={[s.stepper, compact && s.stepperCompact]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: display }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => set(value + (event.nativeEvent.actionName === 'increment' ? step : -step))}
    >
      <AccessibleTouchable label={`Decrease ${label}`} onPress={() => set(value - step)} disabled={value <= min} style={[s.stepperButton, value <= min && s.disabled]}>
        <Icon name="minus" size={18} color={colors.text} accessible={false} importantForAccessibility="no" />
      </AccessibleTouchable>
      <Text style={s.stepperValue} numberOfLines={1}>{display}</Text>
      <AccessibleTouchable label={`Increase ${label}`} onPress={() => set(value + step)} disabled={value >= max} style={[s.stepperButton, value >= max && s.disabled]}>
        <Icon name="plus" size={18} color={colors.text} accessible={false} importantForAccessibility="no" />
      </AccessibleTouchable>
    </View>
  );
};

// ─── Progress bar ────────────────────────────────────────────────

export const ProgressBar = ({ progress, tone = 'primary', height = 8, track, style, label }: {
  progress: number; tone?: Tone; height?: number; track?: string; style?: StyleProp<ViewStyle>; label?: string;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const clamped = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  const anim = useRef(new Animated.Value(reduced ? clamped : 0)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(clamped); return; }
    Animated.timing(anim, { toValue: clamped, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [anim, clamped, reduced]);
  const t = toneColors(colors, tone);
  return (
    <View
      style={[s.progressTrack, { height, borderRadius: height / 2, backgroundColor: track ?? colors.surfaceMuted }, style]}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityValue={label ? { min: 0, max: 100, now: Math.round(clamped * 100) } : undefined}
    >
      <Animated.View style={[s.fillWrap, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { borderRadius: height / 2 }]} />
      </Animated.View>
    </View>
  );
};

// ─── Icon bubble, stat tile, list row ────────────────────────────

export const IconBubble = ({ icon, tone = 'primary', size = 40, filled = false, emoji }: {
  icon?: string; tone?: Tone; size?: number; filled?: boolean; emoji?: string;
}) => {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  const inner = emoji ? (
    <Text style={{ fontSize: size * 0.48 }} accessible={false} importantForAccessibility="no">{emoji}</Text>
  ) : (
    <Icon name={icon ?? 'flash'} size={size * 0.5} color={filled ? colors.onPrimary : t.solid} accessible={false} importantForAccessibility="no" />
  );
  const shape: ViewStyle = { width: size, height: size, borderRadius: size * 0.34, alignItems: 'center', justifyContent: 'center' };
  if (filled) {
    return <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shape}>{inner}</LinearGradient>;
  }
  return <View style={[shape, { backgroundColor: t.soft }]}>{inner}</View>;
};

export const StatTile = ({ icon, label, value, sub, tone = 'primary', style, onPress }: {
  icon: string; label: string; value: string; sub?: string; tone?: Tone; style?: StyleProp<ViewStyle>; onPress?: () => void;
}) => {
  const s = useThemedStyles(createStyles);
  const content = (
    <>
      <IconBubble icon={icon} tone={tone} size={32} />
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={s.statSub} numberOfLines={2}>{sub}</Text> : null}
    </>
  );
  if (onPress) {
    return <AccessibleTouchable label={`${label}: ${value}${sub ? `, ${sub}` : ''}`} onPress={onPress} style={[s.statTile, style]}>{content}</AccessibleTouchable>;
  }
  return <View style={[s.statTile, style]} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}>{content}</View>;
};

export const ListRow = ({ icon, emoji, tone = 'primary', title, subtitle, right, onPress, hint, style, last = false }: {
  icon?: string; emoji?: string; tone?: Tone; title: string; subtitle?: string; right?: ReactNode;
  onPress?: () => void; hint?: string; style?: StyleProp<ViewStyle>; last?: boolean;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const body = (
    <>
      {icon || emoji ? <IconBubble icon={icon} emoji={emoji} tone={tone} size={38} /> : null}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={s.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={22} color={colors.textMuted} accessible={false} importantForAccessibility="no" /> : null}
    </>
  );
  const rowStyle = [s.row, !last && s.rowDivider, style];
  if (onPress) {
    return <AccessibleTouchable label={subtitle ? `${title}. ${subtitle}` : title} hint={hint} onPress={onPress} style={rowStyle}>{body}</AccessibleTouchable>;
  }
  return <View style={rowStyle}>{body}</View>;
};

// ─── Inputs ──────────────────────────────────────────────────────

export const TextField = ({ label, error, hint, suffix, style, ...props }: TextInputProps & {
  label: string; error?: string | null; hint?: string; suffix?: string; style?: StyleProp<ViewStyle>;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  return (
    <View style={[s.field, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.fieldBox, error ? { borderColor: colors.danger } : null, props.multiline && s.fieldBoxMulti]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={[s.fieldInput, props.multiline && s.fieldInputMulti]}
          {...props}
        />
        {suffix ? <Text style={s.fieldSuffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={s.fieldError} accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
};

export const Toggle = ({ value, onValueChange, label, disabled }: {
  value: boolean; onValueChange: (value: boolean) => void; label: string; disabled?: boolean;
}) => {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: colors.border, true: alpha(colors.primary, 0.55) }}
      thumbColor={value ? colors.primary : colors.switchThumbOff}
      ios_backgroundColor={colors.border}
    />
  );
};

export const Pill = ({ label, tone = 'primary', icon, onDark = false }: { label: string; tone?: Tone; icon?: string; onDark?: boolean }) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[s.pill, { backgroundColor: onDark ? colors.glassStrong : t.soft }]}>
      {icon ? <Icon name={icon} size={12} color={onDark ? colors.textOnDark : t.text} accessible={false} importantForAccessibility="no" /> : null}
      <Text style={[s.pillText, { color: onDark ? colors.textOnDark : t.text }]}>{label}</Text>
    </View>
  );
};

export const Divider = () => {
  const s = useThemedStyles(createStyles);
  return <View style={s.divider} />;
};

// ─── Styles ──────────────────────────────────────────────────────

const createStyles = (c: ThemeColors, isDark: boolean) => StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: c.background },
  screenContent: { paddingBottom: 40 },
  screenBand: { position: 'absolute', top: 0, left: 0, right: 0 },

  hero: { paddingHorizontal: Spacing.page, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start' },
  heroTitles: { flex: 1 },
  heroRight: { flexDirection: 'row', gap: 8, marginLeft: 12 },
  eyebrow: { ...Typography.overline, color: c.primary, marginBottom: 6 },
  heroTitle: { ...Typography.displaySmall, color: c.textOnDark },
  heroSubtitle: { ...Typography.bodyMedium, color: c.textOnDarkSub, marginTop: 6, lineHeight: 21 },
  heroIconButton: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.glassStrong, borderWidth: 1, borderColor: c.glassBorder,
  },
  heroIconBadge: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
  glass: {
    backgroundColor: c.glass, borderRadius: Radius.lg, borderWidth: 1, borderColor: c.glassBorder, padding: Spacing.lg,
  },

  card: {
    backgroundColor: c.card, borderRadius: Radius.card, borderWidth: 1, borderColor: c.cardBorder,
    ...(isDark ? {} : Shadows.md),
  },
  cardPadded: { padding: Spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cardHeaderText: { flex: 1 },
  cardTitle: { ...Typography.h3, color: c.text },
  cardSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  cardAction: { paddingHorizontal: 4 },
  cardActionText: { ...Typography.label, color: c.primaryText },

  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.page, marginTop: 26, marginBottom: 12 },
  sectionTitle: { ...Typography.h2, color: c.text },
  sectionSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 3 },
  sectionAction: { minHeight: 32, paddingLeft: 8 },

  button: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonFull: { alignSelf: 'stretch' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...Typography.h3, fontSize: 16 },
  buttonTextSm: { ...Typography.label },
  disabled: { opacity: 0.45 },

  chip: {
    minHeight: 36, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.card, justifyContent: 'center',
  },
  chipText: { ...Typography.label, fontSize: 13 },

  segmented: {
    flexDirection: 'row', backgroundColor: c.surfaceMuted, borderRadius: Radius.md, padding: 4, borderWidth: 1, borderColor: c.cardBorder,
  },
  segment: { flex: 1, minHeight: 36, borderRadius: Radius.sm + 2, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: c.card, ...(isDark ? {} : Shadows.sm) },
  segmentText: { ...Typography.label, color: c.textSecondary },
  segmentTextSelected: { color: c.text },

  stepper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceMuted, borderRadius: Radius.md, padding: 3,
  },
  stepperCompact: { alignSelf: 'flex-start' },
  stepperButton: {
    width: 40, height: 40, borderRadius: Radius.sm + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card,
  },
  stepperValue: { ...Typography.statSmall, color: c.text, minWidth: 62, textAlign: 'center', fontVariant: ['tabular-nums'] },

  progressTrack: { overflow: 'hidden', width: '100%' },
  fill: { flex: 1 },
  fillWrap: { height: '100%' },

  statTile: {
    flex: 1, backgroundColor: c.card, borderRadius: Radius.card, padding: 14, borderWidth: 1, borderColor: c.cardBorder,
    ...(isDark ? {} : Shadows.sm),
  },
  statValue: { ...Typography.stat, color: c.text, marginTop: 10, fontVariant: ['tabular-nums'] },
  statLabel: { ...Typography.labelSmall, color: c.textSecondary, marginTop: 2, textTransform: 'uppercase' },
  statSub: { ...Typography.bodySmall, color: c.textMuted, marginTop: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  rowText: { flex: 1 },
  rowTitle: { ...Typography.label, fontSize: 15, color: c.text },
  rowSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },

  field: { gap: 6 },
  fieldLabel: { ...Typography.label, color: c.text },
  fieldBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.inputBg, borderRadius: Radius.md,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, minHeight: 50,
  },
  fieldBoxMulti: { alignItems: 'flex-start', paddingVertical: 10 },
  fieldInput: { flex: 1, ...Typography.bodyLarge, color: c.text, paddingVertical: 10 },
  fieldInputMulti: { minHeight: 70, textAlignVertical: 'top', paddingVertical: 0 },
  fieldSuffix: { ...Typography.label, color: c.textSecondary, marginLeft: 8 },
  fieldError: { ...Typography.bodySmall, color: c.dangerText },
  fieldHint: { ...Typography.bodySmall, color: c.textSecondary },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  pillText: { ...Typography.overline, fontSize: 10, letterSpacing: 0.6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider, marginVertical: 8 },
});
