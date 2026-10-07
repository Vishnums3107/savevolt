import React, { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { formatEnergy } from '../utils/energy';
import { Radius, Shadows, Spacing, Typography } from '../theme';

export type HubArea = 'track' | 'insights' | 'goals' | 'profile';

interface FeatureHubScreenProps {
  area: HubArea;
  navigation: { navigate: (screen: string) => void };
}

/** Palette token used for a tile's accent bar and arrow */
type TileAccent = 'primary' | 'info' | 'accent' | 'warning' | 'success';

/** Soft tint behind a tile's tag, so the tag text can use the high-contrast text colour */
const TAG_BACKGROUND: Record<TileAccent, 'primarySoft' | 'infoSoft' | 'accentLight' | 'warningSoft' | 'successSoft'> = {
  primary: 'primarySoft',
  info: 'infoSoft',
  accent: 'accentLight',
  warning: 'warningSoft',
  success: 'successSoft',
};

interface FeatureTile {
  title: string;
  description: string;
  screen: string;
  accent: TileAccent;
  tag?: string;
}

const HUB_COPY: Record<HubArea, { eyebrow: string; title: string; subtitle: string; action: string }> = {
  track: {
    eyebrow: 'ENERGY OPERATIONS',
    title: 'Track your home',
    subtitle: 'Keep every device, room, and daily reading up to date.',
    action: 'Log today',
  },
  insights: {
    eyebrow: 'ANALYSIS CENTRE',
    title: 'Turn data into savings',
    subtitle: 'Find patterns, act on recommendations, and share the results.',
    action: 'View recommendations',
  },
  goals: {
    eyebrow: 'IMPACT & PROGRESS',
    title: 'Make progress visible',
    subtitle: 'Set clear limits, build habits, and involve your community.',
    action: 'Open my goals',
  },
  profile: {
    eyebrow: 'ACCOUNT & SUPPORT',
    title: 'Your SaveVolt space',
    subtitle: 'Manage alerts, preferences, and get help whenever you need it.',
    action: 'Open settings',
  },
};

const FEATURE_TILES: Record<HubArea, FeatureTile[]> = {
  track: [
    { title: 'Daily log', description: 'Confirm how long devices ran, or enter a meter reading.', screen: 'DailyLog', accent: 'primary', tag: 'DAILY' },
    { title: 'Add appliance', description: 'Add a device with power and usage details.', screen: 'AddAppliance', accent: 'success' },
    { title: 'Live audit', description: 'Compare devices and switch tracking on or off.', screen: 'Audit', accent: 'info' },
    { title: 'Home energy map', description: 'Assign devices to rooms and spot hotspots.', screen: 'Map', accent: 'accent' },
    { title: 'Smart plugs', description: 'Connect Home Assistant for live readings and plug control.', screen: 'SmartHome', accent: 'success' },
  ],
  insights: [
    { title: 'Action plan', description: 'Personal recommendations ranked by savings.', screen: 'Recommendations', accent: 'accent', tag: 'SMART' },
    { title: 'Usage trends', description: 'See daily, monthly, and longer-term movement.', screen: 'Trends', accent: 'info' },
    { title: 'Smart tips', description: 'Practical advice tailored to your energy profile.', screen: 'Tips', accent: 'primary' },
    { title: 'Reports', description: 'Review, export, and share your energy data.', screen: 'Reports', accent: 'warning' },
  ],
  goals: [
    { title: 'My goals', description: 'Create monthly energy, cost, and CO2 limits.', screen: 'Progress', accent: 'primary', tag: 'CORE' },
    { title: 'Challenges', description: 'Take on focused saving habits and rewards.', screen: 'Challenges', accent: 'warning' },
    { title: 'Shared goal planner', description: 'Save together with invite codes; your logs count automatically.', screen: 'Community', accent: 'info' },
    { title: 'Impact', description: 'Translate energy choices into environmental impact.', screen: 'Impact', accent: 'success' },
    { title: 'Leaderboard', description: 'Compare points and savings with friends using score codes.', screen: 'Leaderboard', accent: 'accent' },
  ],
  profile: [
    { title: 'Homes', description: 'Switch between homes with separate devices and energy records.', screen: 'Households', accent: 'info' },
    { title: 'Account sync', description: 'Back up homes and restore them on your other devices.', screen: 'AccountSync', accent: 'success' },
    { title: 'Energy assistant', description: 'Ask questions about your usage and savings.', screen: 'Chat', accent: 'accent', tag: 'HELP' },
    { title: 'Reminders', description: 'Plan helpful prompts for devices and habits.', screen: 'Reminders', accent: 'warning' },
    { title: 'Settings', description: 'Set your local rate, emission factor, and preferences.', screen: 'Settings', accent: 'primary' },
  ],
};

/** Screen the primary action opens (track only navigates when there are no appliances yet) */
const PRIMARY_TARGET: Record<HubArea, { screen: string; title: string }> = {
  track: { screen: 'AddAppliance', title: 'Add appliance' },
  insights: { screen: 'Recommendations', title: 'Action plan' },
  goals: { screen: 'Progress', title: 'My goals' },
  profile: { screen: 'Settings', title: 'Settings' },
};

const FeatureHubScreen = ({ area, navigation }: FeatureHubScreenProps) => {
  const {
    appliances,
    dashboardData,
    tips,
    usageRecords,
    goals,
    badges,
    streak,
    reminders,
    settings,
  } = useEnergy(
    'appliances',
    'dashboardData',
    'tips',
    'usageRecords',
    'goals',
    'badges',
    'streak',
    'reminders',
    'settings',
  );
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = HUB_COPY[area];

  const metrics = useMemo(() => {
    switch (area) {
      case 'track':
        return [
          { value: String(appliances.length), label: 'devices' },
          { value: String(appliances.filter((item) => item.isActive).length), label: 'active' },
          { value: dashboardData ? formatEnergy(dashboardData.totalEnergyConsumed) : '—', label: 'this month' },
        ];
      case 'insights':
        return [
          { value: String(tips.length), label: 'tips ready' },
          { value: String(usageRecords.length), label: 'daily logs' },
          { value: dashboardData ? formatEnergy(dashboardData.totalEnergyConsumed) : '—', label: 'analysed' },
        ];
      case 'goals':
        return [
          { value: String(goals.length), label: 'active goals' },
          { value: String(streak.currentStreak), label: 'day streak' },
          { value: String(badges.filter((badge) => badge.isEarned).length), label: 'badges' },
        ];
      default:
        return [
          { value: settings.notificationsEnabled ? 'On' : 'Off', label: 'alerts' },
          { value: String(reminders.filter((reminder) => reminder.isActive).length), label: 'reminders' },
          { value: settings.voiceEnabled ? 'On' : 'Off', label: 'voice tips' },
        ];
    }
  }, [area, appliances, badges, dashboardData, goals, reminders, settings, streak, tips, usageRecords]);

  // Read the summary row as one sentence, e.g. "3 devices, 2 active, 245.3 kWh this month"
  const metricsLabel = useMemo(
    () =>
      metrics
        .map((metric) => (metric.value === '—' ? `No data ${metric.label}` : `${metric.value} ${metric.label}`))
        .join(', '),
    [metrics],
  );

  const logsUsage = area === 'track' && appliances.length > 0;
  const primaryHint = logsUsage
    ? 'Opens the daily log to confirm how long each device ran today'
    : `Opens ${PRIMARY_TARGET[area].title}`;

  const handlePrimaryAction = () => {
    if (area === 'track') {
      navigation.navigate(appliances.length === 0 ? 'AddAppliance' : 'DailyLog');
      return;
    }

    navigation.navigate(PRIMARY_TARGET[area].screen);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={styles.hero}>
        <Image
          source={require('../assets/branding/savevolt-logo.png')}
          style={styles.logo}
          accessibilityRole="image"
          accessibilityLabel="SaveVolt logo"
        />
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        <View style={styles.metricRow} accessible accessibilityLabel={metricsLabel}>
          {metrics.map((metric, index) => (
            <React.Fragment key={metric.label}>
              {index > 0 && <View style={styles.metricDivider} />}
              <View style={styles.metric}>
                <Text style={styles.metricValue} numberOfLines={1}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>

      <TouchableOpacity
        style={styles.primaryAction}
        activeOpacity={0.86}
        onPress={handlePrimaryAction}
        accessibilityRole="button"
        accessibilityLabel={copy.action}
        accessibilityHint={primaryHint}
      >
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.primaryActionGradient}>
          <Text style={styles.primaryActionText}>{copy.action}</Text>
          <Text style={styles.primaryActionArrow}>→</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Explore {area === 'profile' ? 'your workspace' : 'tools'}
        </Text>
        <Text style={styles.sectionSubtitle}>Everything in this area</Text>
      </View>

      <View style={styles.grid}>
        {FEATURE_TILES[area].map((tile) => (
          <TouchableOpacity
            key={tile.screen}
            activeOpacity={0.75}
            style={styles.tile}
            onPress={() => navigation.navigate(tile.screen)}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}. ${tile.description}`}
            accessibilityHint={`Opens ${tile.title}`}
          >
            <View style={styles.tileTop}>
              <View style={[styles.tileAccent, { backgroundColor: colors[tile.accent] }]} />
              {tile.tag && (
                <View style={[styles.tileTagPill, { backgroundColor: colors[TAG_BACKGROUND[tile.accent]] }]}>
                  <Text style={styles.tileTag}>{tile.tag}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileDescription}>{tile.description}</Text>
            <Text style={styles.tileArrow}>
              Open <Text style={{ color: colors[tile.accent] }}>→</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footer}>
        Your energy data stays on this device. The assistant only contacts Gemini if you add your own key, and cloud backup is optional.
      </Text>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingBottom: 36 },
    hero: { paddingTop: 56, paddingHorizontal: Spacing.page, paddingBottom: 40 },
    logo: { width: 44, height: 44, borderRadius: 12, marginBottom: 14 },
    eyebrow: { ...Typography.overline, color: c.primary, marginBottom: 6 },
    title: { ...Typography.displaySmall, color: c.textOnDark, marginBottom: 8 },
    subtitle: { ...Typography.bodyMedium, color: c.textOnDarkSub, lineHeight: 21, maxWidth: 330 },
    // rgba overlays sit on the hero, which is dark in both themes
    metricRow: {
      flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingVertical: 13,
      paddingHorizontal: 8, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.07)',
    },
    metric: { flex: 1, alignItems: 'center' },
    metricDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.16)' },
    metricValue: { ...Typography.statSmall, color: c.primary, maxWidth: 96 },
    metricLabel: { ...Typography.labelSmall, color: c.textOnDarkSub, marginTop: 3, textTransform: 'uppercase' },
    primaryAction: { marginHorizontal: Spacing.page, marginTop: -20, borderRadius: Radius.md, overflow: 'hidden', ...Shadows.lg },
    primaryActionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 18 },
    primaryActionText: { ...Typography.h3, color: c.onPrimary },
    primaryActionArrow: { fontSize: 22, fontWeight: '700', color: c.onPrimary },
    sectionHeader: { marginTop: 28, paddingHorizontal: Spacing.page, marginBottom: 12 },
    sectionTitle: { ...Typography.h2, color: c.text },
    sectionSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 3 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: Spacing.page },
    tile: { width: '48%', minHeight: 164, backgroundColor: c.card, borderRadius: Radius.card, padding: 16, ...Shadows.sm },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    tileAccent: { width: 34, height: 7, borderRadius: Radius.pill },
    tileTagPill: { borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
    tileTag: { ...Typography.overline, fontSize: 9, color: c.text },
    tileTitle: { ...Typography.h3, color: c.text, marginBottom: 5 },
    tileDescription: { ...Typography.bodySmall, color: c.textSecondary, lineHeight: 17, flex: 1 },
    tileArrow: { ...Typography.labelSmall, color: c.text, marginTop: 12 },
    footer: { ...Typography.bodySmall, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 36, marginTop: 28, lineHeight: 18 },
  });

export default FeatureHubScreen;
