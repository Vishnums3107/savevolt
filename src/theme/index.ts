/**
 * SaveVolt Design System
 * Premium, modern energy tracking app theme
 * Supports Light & Dark mode
 */

// ─── Light Palette ──────────────────────────────────────────────
const LightColors = {
  // Brand
  primary:      '#00E676',
  primaryDark:  '#00C853',
  primaryDeep:  '#00A844',
  primaryLight: '#B9F6CA',
  primarySoft:  '#E8F5E9',

  // Accent
  accent:       '#7C4DFF',
  accentLight:  '#EDE7F6',
  accentSoft:   '#D1C4E9',

  // Surfaces
  background:   '#F0F2F5',
  card:         '#FFFFFF',
  cardElevated: '#FFFFFF',

  // Dark / Header
  dark:         '#0B1120',
  darkSoft:     '#1A2332',
  darkCard:     '#162032',

  // Text
  text:         '#0F172A',
  textSecondary:'#64748B',
  textMuted:    '#94A3B8',
  textOnDark:   '#FFFFFF',
  textOnDarkSub:'rgba(255,255,255,0.7)',

  // Semantic
  success:      '#10B981',
  warning:      '#F59E0B',
  danger:       '#EF4444',
  info:         '#3B82F6',

  // Semantic tints — badge, notice, and destructive-button backgrounds
  successSoft:  '#D1FAE5',
  warningSoft:  '#FEF3C7',
  dangerSoft:   '#FEE2E2',
  dangerBorder: '#FECACA',
  infoSoft:     '#DBEAFE',

  // Readable text versions of the brand green and danger red (≥4.5:1 on cards, the page
  // background, and their soft tints). Use for small text; keep primary/danger for fills.
  primaryText:  '#007A3D',
  dangerText:   '#B91C1C',

  // Borders & Dividers
  border:       '#E2E8F0',
  borderLight:  '#F1F5F9',
  divider:      '#F1F5F9',

  // Chart colors (harmonized palette)
  chart: [
    '#00E676', '#7C4DFF', '#3B82F6', '#F59E0B',
    '#EF4444', '#EC4899', '#14B8A6', '#8B5CF6',
  ],

  // Tab bar
  tabActive:    '#00E676',
  tabInactive:  '#94A3B8',
  tabBar:       '#FFFFFF',

  // Input
  inputBg:      '#F0F2F5',

  // Hero headers stay dark in both modes; text on them uses textOnDark
  heroGradient: ['#0B1120', '#162032', '#1A2E40'] as [string, string, string],
  // Text/icons drawn on top of the primary green
  onPrimary:    '#0B1120',
  // Modal scrim
  overlay:      'rgba(15,23,42,0.55)',
  // Skeleton placeholder blocks
  skeleton:     '#E2E8F0',
  // Switch thumb when off
  switchThumbOff: '#F8FAFC',
  // Floating back button in stack headers
  backButtonBg: 'rgba(255,255,255,0.92)',
};

// ─── Dark Palette ───────────────────────────────────────────────
const DarkColors: typeof LightColors = {
  primary:      '#00E676',
  primaryDark:  '#00C853',
  primaryDeep:  '#00A844',
  primaryLight: '#1B3A27',
  primarySoft:  '#0D2818',

  accent:       '#B388FF',
  accentLight:  '#1E1533',
  accentSoft:   '#2C1F4A',

  background:   '#0B1120',
  card:         '#162032',
  cardElevated: '#1A2744',

  dark:         '#070D1A',
  darkSoft:     '#0E1829',
  darkCard:     '#111D30',

  text:         '#E2E8F0',
  textSecondary:'#94A3B8',
  textMuted:    '#64748B',
  textOnDark:   '#FFFFFF',
  textOnDarkSub:'rgba(255,255,255,0.7)',

  success:      '#34D399',
  warning:      '#FBBF24',
  danger:       '#F87171',
  info:         '#60A5FA',

  successSoft:  '#0F2E24',
  warningSoft:  '#33270A',
  dangerSoft:   '#3A1616',
  dangerBorder: '#7F1D1D',
  infoSoft:     '#13233F',

  primaryText:  '#00E676',
  dangerText:   '#F87171',

  border:       '#1E293B',
  borderLight:  '#1A2332',
  divider:      '#1E293B',

  chart: [
    '#00E676', '#B388FF', '#60A5FA', '#FBBF24',
    '#F87171', '#F472B6', '#2DD4BF', '#A78BFA',
  ],

  tabActive:    '#00E676',
  tabInactive:  '#64748B',
  tabBar:       '#0E1829',

  inputBg:      '#1A2744',

  heroGradient: ['#070D1A', '#111D30', '#16263D'],
  onPrimary:    '#0B1120',
  overlay:      'rgba(0,0,0,0.7)',
  skeleton:     '#1E293B',
  switchThumbOff: '#94A3B8',
  backButtonBg: 'rgba(22,32,50,0.92)',
};

export type ThemeColors = typeof LightColors;

/**
 * Returns the correct palette for the given mode.
 */
export const themed = (isDark: boolean): ThemeColors => isDark ? DarkColors : LightColors;

// Default export uses light (backwards-compatible with all existing screens)
export const Colors = LightColors;

// ─── Typography ─────────────────────────────────────────────────
export const Typography = {
  displayLarge:  { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5 },
  displayMedium: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -1 },
  displaySmall:  { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },

  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0 },

  bodyLarge:  { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmall:  { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

  label:      { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.3 },
  labelSmall: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5 },
  overline:   { fontSize: 10, fontWeight: '700' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },

  stat:       { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5 },
  statSmall:  { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.3 },
};

// ─── Spacing ────────────────────────────────────────────────────
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
  page: 20,
  section: 24,
};

// ─── Radius ─────────────────────────────────────────────────────
export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  pill:  999,
  card:  16,
};

// ─── Shadows ────────────────────────────────────────────────────
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: {
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

// ─── Common Styles ──────────────────────────────────────────────
export const CommonStyles = {
  screenContainer: {
    flex: 1 as const,
    backgroundColor: Colors.background,
  },
  darkHeader: {
    backgroundColor: Colors.dark,
    paddingHorizontal: Spacing.page,
    paddingTop: 50,
    paddingBottom: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    ...Shadows.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
};
