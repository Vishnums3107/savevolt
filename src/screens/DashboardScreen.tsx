import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { formatEnergy, formatCost, formatCO2 } from '../utils/energy';
import { speakDashboardSummary } from '../utils/voice';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import WeatherWidget from '../components/WeatherWidget';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { SkeletonCard } from '../components/Skeleton';

const W = Dimensions.get('window').width;
const CHART_WIDTH = W - Spacing.page * 2 - Spacing.lg * 2;
const REDUCTION_OPTIONS = [10, 20, 30];

/** '#RRGGBB' → rgba(); chart-kit takes its colors as opacity functions. */
const withOpacity = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const DashboardScreen = ({ navigation }: any) => {
  const {
    dashboardData, settings, loadDemoData, weatherData, isWeatherLoading, refreshWeatherData, appliances, households, activeHouseholdId,
  } = useEnergy(
    'dashboardData', 'settings', 'loadDemoData', 'weatherData', 'isWeatherLoading', 'refreshWeatherData', 'appliances', 'households', 'activeHouseholdId',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [reductionPercent, setReductionPercent] = useState(20);
  const [refreshing, setRefreshing] = useState(false);

  // Hooks must run on every render, so everything is derived before the empty-state return
  const chartPalette = colors.chart;
  const categories = useMemo(() => dashboardData?.consumptionByCategory ?? [], [dashboardData]);
  const consumers = useMemo(() => dashboardData?.topConsumers ?? [], [dashboardData]);
  const activeDeviceCount = useMemo(() => appliances.filter((item) => item.isActive).length, [appliances]);

  const pieData = useMemo(() => categories.map((item, i) => ({
    name: item.category,
    // The absolute legend prints this value as-is, so keep it to one decimal
    consumption: Math.round(item.consumption * 10) / 10,
    color: chartPalette[i % chartPalette.length],
    legendFontColor: colors.textSecondary,
    legendFontSize: 11,
  })), [categories, chartPalette, colors.textSecondary]);

  const barData = useMemo(() => ({
    labels: consumers.map((item) => (item.applianceName.length > 8 ? item.applianceName.substring(0, 8) + '..' : item.applianceName)),
    datasets: [{ data: consumers.length > 0 ? consumers.map((item) => item.monthlyConsumption) : [0] }],
  }), [consumers]);

  const chartConfig = useMemo(() => ({
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 1,
    // Also colors the values above the bars, so it follows the text color for contrast
    color: (opacity = 1) => withOpacity(colors.text, opacity),
    labelColor: () => colors.textSecondary,
    fillShadowGradientFrom: colors.primary,
    fillShadowGradientFromOpacity: 0.9,
    fillShadowGradientTo: colors.primary,
    fillShadowGradientToOpacity: 0.35,
    barPercentage: 0.6,
    propsForLabels: { fontSize: 10 },
    propsForBackgroundLines: { strokeDasharray: '', stroke: colors.borderLight },
  }), [colors]);

  // chart-kit renders SVG that screen readers can't read, so each chart gets a spoken summary
  const pieSummary = useMemo(() => {
    const parts = categories
      .filter((cat) => cat.consumption > 0)
      .sort((a, b) => b.consumption - a.consumption)
      .map((cat) => `${cat.category} ${formatEnergy(cat.consumption)}, ${Math.round(cat.percentage)} percent`);
    return `Pie chart of monthly energy use by category. ${parts.join('; ')}.`;
  }, [categories]);

  const barSummary = useMemo(() => {
    const parts = consumers.map((item) => `${item.applianceName} ${formatEnergy(item.monthlyConsumption)}`);
    return `Bar chart of monthly consumption for your top appliances. ${parts.join('; ')}.`;
  }, [consumers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Also recalculates the dashboard once the new weather is in
      await refreshWeatherData();
    } catch (error) {
      console.warn('Dashboard refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshWeatherData]);

  const openEditor = useCallback((applianceId: string) => {
    navigation.navigate('Track', { screen: 'EditAppliance', params: { applianceId }, initial: false });
  }, [navigation]);

  if (!dashboardData) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          icon="⚡"
          title={households.length > 1 ? `Welcome to ${households.find(home => home.id === activeHouseholdId)?.name ?? 'your home'}` : 'Welcome to SaveVolt'}
          body="Add your first appliance to see your monthly energy use, cost and CO₂ footprint — or load demo data to explore the dashboard."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the screen to register a new appliance',
            onPress: () => navigation.navigate('Track', { screen: 'AddAppliance', initial: false }),
          }}
          secondaryAction={{
            label: 'Load demo data',
            hint: 'Fills the app with sample appliances and energy statistics',
            onPress: () => loadDemoData(),
          }}
        />
      </>
    );
  }

  const {
    totalEnergyConsumed, totalCost, totalCO2Saved,
    treesEquivalent, topConsumers, consumptionByCategory,
  } = dashboardData;
  const energyText = formatEnergy(totalEnergyConsumed);
  const costText = formatCost(totalCost, settings.currency);
  const co2Text = formatCO2(totalCO2Saved);
  const treesText = treesEquivalent.toFixed(1);
  // Appliances exist but none draws power (all switched off or zero hours)
  const hasUsage = totalEnergyConsumed > 0;

  const stats = [
    { label: 'Energy', spoken: 'Energy', value: energyText, color: colors.primary },
    { label: 'Cost', spoken: 'Cost', value: costText, color: colors.warning },
    { label: 'CO₂', spoken: 'Carbon emissions', value: co2Text, color: colors.info },
    { label: 'Trees', spoken: 'Trees to offset', value: treesText, color: colors.success },
  ];

  return (
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      <FocusAwareStatusBar variant="hero" />

      {/* ── Hero Header ── */}
      <LinearGradient colors={colors.heroGradient} style={s.hero}>
        <AccessibleTouchable label="Switch home" onPress={() => navigation.navigate('Account', { screen: 'Households', initial: false })}>
          <Text style={s.heroSub}>{households.find(home => home.id === activeHouseholdId)?.name ?? 'My home'} · Manage homes</Text>
        </AccessibleTouchable>
        <Text style={s.heroLabel} accessibilityRole="header">Monthly overview</Text>
        <View
          style={s.heroSummary}
          accessible
          accessibilityLabel={`Energy used this month: ${energyText}. Estimated cost: ${costText}.`}
        >
          <Text style={s.heroValue}>{energyText}</Text>
          <Text style={s.heroSub}>{costText} estimated cost</Text>
        </View>

        {/* Glowing metric strip */}
        <View style={s.metricStrip}>
          <View style={s.metricPill} accessible accessibilityLabel={`Carbon emissions: ${co2Text}`}>
            <Text style={s.pillValue}>{co2Text}</Text>
            <Text style={s.pillLabel}>CO₂</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metricPill} accessible accessibilityLabel={`Trees to offset: ${treesText}`}>
            <Text style={s.pillValue}>{treesText}</Text>
            <Text style={s.pillLabel}>Trees Offset</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metricPill} accessible accessibilityLabel={`Active devices: ${activeDeviceCount}`}>
            <Text style={s.pillValue}>{activeDeviceCount}</Text>
            <Text style={s.pillLabel}>Active devices</Text>
          </View>
        </View>

        {settings.voiceEnabled && (
          <AccessibleTouchable
            label="Read summary aloud"
            hint="Speaks your monthly energy use, cost and carbon totals"
            style={s.voiceButton}
            onPress={() => {
              speakDashboardSummary(totalEnergyConsumed, totalCost, totalCO2Saved, treesEquivalent);
            }}
          >
            <Text style={s.voiceButtonText}>🔊  Read summary aloud</Text>
          </AccessibleTouchable>
        )}
      </LinearGradient>

      {/* ── Quick Stats Row ── */}
      <View style={s.statsRow}>
        {stats.map((m) => (
          <View key={m.label} style={s.statCard} accessible accessibilityLabel={`${m.spoken}: ${m.value}`}>
            <View style={[s.statDot, { backgroundColor: m.color }]} />
            <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
            <Text style={s.statLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Weather Widget ── */}
      {weatherData ? (
        <View style={s.section}>
          <WeatherWidget
            weather={weatherData}
            onPress={() => navigation.navigate('Insights', { screen: 'Tips', initial: false })}
          />
        </View>
      ) : isWeatherLoading ? (
        <View style={s.section}>
          <SkeletonCard lines={2} label="Loading weather" />
        </View>
      ) : null}

      {hasUsage ? (
        <>
          {/* ── Top Consumers ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Top Consumers</Text>
            {topConsumers.slice(0, 5).map((consumer, index) => {
              const monthly = formatEnergy(consumer.monthlyConsumption);
              return (
                <AccessibleTouchable
                  key={consumer.applianceId}
                  label={`Edit ${consumer.applianceName}, ${monthly} per month, ${Math.round(consumer.percentage)}% of total`}
                  hint="Opens the appliance editor"
                  style={s.consumerRow}
                  onPress={() => openEditor(consumer.applianceId)}
                >
                  <View style={s.consumerLeft}>
                    <View style={[s.rankBadge, index === 0 && s.rankBadgeTop]}>
                      <Text style={[s.rankText, index === 0 && s.rankTextTop]}>{index + 1}</Text>
                    </View>
                    <View style={s.consumerInfo}>
                      <Text style={s.consumerName}>{consumer.applianceName}</Text>
                      <Text style={s.consumerPct}>{consumer.percentage.toFixed(1)}% of total</Text>
                    </View>
                  </View>
                  <Text style={s.consumerKwh}>{monthly}</Text>
                  <Text style={s.chevron} accessible={false} importantForAccessibility="no">›</Text>
                </AccessibleTouchable>
              );
            })}
          </View>

          {/* ── Category Pie ── */}
          {consumptionByCategory.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">By Category</Text>
              <View style={s.chartCard} accessible accessibilityRole="image" accessibilityLabel={pieSummary}>
                <PieChart
                  data={pieData}
                  width={CHART_WIDTH}
                  height={200}
                  chartConfig={chartConfig}
                  accessor="consumption"
                  backgroundColor="transparent"
                  paddingLeft="10"
                  absolute
                />
              </View>
            </View>
          )}

          {/* ── Bar Chart ── */}
          {topConsumers.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">Consumption Breakdown</Text>
              <View style={s.chartCard} accessible accessibilityRole="image" accessibilityLabel={barSummary}>
                <BarChart
                  data={barData}
                  width={CHART_WIDTH}
                  height={210}
                  yAxisLabel=""
                  yAxisSuffix=" kWh"
                  chartConfig={chartConfig}
                  style={s.barChart}
                  showValuesOnTopOfBars
                  showBarTops={false}
                />
              </View>
            </View>
          )}

          {/* ── Cost Breakdown ── */}
          <View style={[s.section, s.costSection]}>
            <Text style={s.sectionTitle} accessibilityRole="header">Cost Analysis</Text>
            <View style={s.costCard}>
              {consumptionByCategory.map((cat, i) => {
                const cost = formatCost(cat.cost, settings.currency);
                return (
                  <View key={cat.category} style={s.costRow} accessible accessibilityLabel={`${cat.category}: ${cost}`}>
                    <View style={[s.costDot, { backgroundColor: chartPalette[i % chartPalette.length] }]} />
                    <Text style={s.costCategory}>{cat.category}</Text>
                    <Text style={s.costValue}>{cost}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Eco Insight ── */}
          <View style={[s.section, s.insightSection]}>
            <LinearGradient colors={colors.heroGradient} style={s.insightCard}>
              <Text style={s.insightEmoji} accessible={false} importantForAccessibility="no">🌱</Text>
              <Text style={s.insightTitle} accessibilityRole="header">Savings calculator</Text>
              <View style={s.reductionChoices} accessibilityRole="radiogroup" accessibilityLabel="Usage reduction">
                {REDUCTION_OPTIONS.map((percent) => {
                  const checked = reductionPercent === percent;
                  return (
                    <AccessibleTouchable
                      key={percent}
                      label={`${percent} percent reduction`}
                      hint="Updates the projected monthly savings"
                      role="radio"
                      accessibilityState={{ checked }}
                      style={[s.reductionChoice, checked && s.reductionChoiceActive]}
                      onPress={() => setReductionPercent(percent)}
                    >
                      <Text style={[s.reductionChoiceText, checked && s.reductionChoiceTextActive]}>{percent}%</Text>
                    </AccessibleTouchable>
                  );
                })}
              </View>
              <Text style={s.insightBody} accessibilityLiveRegion="polite">
                Reducing usage by {reductionPercent}% would save{' '}
                <Text style={s.insightHighlight}>{formatEnergy(totalEnergyConsumed * reductionPercent / 100)}</Text>,{' '}
                <Text style={s.insightHighlight}>{formatCost(totalCost * reductionPercent / 100, settings.currency)}</Text>, and{' '}
                <Text style={s.insightHighlight}>{formatCO2(totalCO2Saved * reductionPercent / 100)}</Text> each month.
              </Text>
            </LinearGradient>
          </View>
        </>
      ) : (
        <View style={[s.section, s.insightSection]}>
          <View style={s.emptyCard}>
            <EmptyState
              variant="inline"
              icon="🔌"
              title="No energy use yet"
              body="Your appliances are all switched off or set to zero hours, so there's nothing to break down. Switch one on in the energy audit to see your top consumers and costs."
              primaryAction={{
                label: 'Open energy audit',
                hint: 'Opens the audit, where you can switch appliances on',
                onPress: () => navigation.navigate('Track', { screen: 'Audit', initial: false }),
              }}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────
const createStyles = (c: ThemeColors) => {
  // Neon green text washes out on white cards, so light mode uses the deeper brand green

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },

    /* Hero */
    hero: {
      paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center',
    },
    heroLabel: { ...Typography.overline, color: c.primary, marginBottom: 6 },
    heroSummary: { alignItems: 'center' },
    heroValue: { ...Typography.displayLarge, color: c.textOnDark, marginBottom: 4 },
    heroSub: { ...Typography.bodyMedium, color: c.textOnDarkSub, marginBottom: 20 },

    metricStrip: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.pill,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    metricPill: { flex: 1, alignItems: 'center' },
    metricDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },
    pillValue: { ...Typography.statSmall, color: c.primary },
    pillLabel: { ...Typography.labelSmall, color: c.textOnDarkSub, marginTop: 2, textAlign: 'center' },

    voiceButton: {
      marginTop: Spacing.md, alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
      borderRadius: Radius.pill, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    },
    voiceButtonText: { ...Typography.label, color: c.textOnDark },

    /* Quick Stats */
    statsRow: {
      flexDirection: 'row', paddingHorizontal: Spacing.page,
      marginTop: -16, gap: 10,
    },
    statCard: {
      flex: 1, backgroundColor: c.card, borderRadius: Radius.card,
      paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', ...Shadows.md,
    },
    statDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 6 },
    statValue: { ...Typography.statSmall, color: c.text },
    statLabel: { ...Typography.labelSmall, color: c.textSecondary, marginTop: 2 },

    /* Sections */
    section: { paddingHorizontal: Spacing.page, marginTop: Spacing.section },
    costSection: { marginBottom: 30 },
    insightSection: { marginBottom: 40 },
    sectionTitle: { ...Typography.h2, color: c.text, marginBottom: 14 },
    emptyCard: { backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.md },

    /* Top Consumers */
    consumerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: Radius.md,
      paddingVertical: 14, paddingLeft: 16, paddingRight: 12, marginBottom: 8, ...Shadows.sm,
    },
    consumerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    rankBadge: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.borderLight, justifyContent: 'center', alignItems: 'center',
      marginRight: 12,
    },
    rankBadgeTop: { backgroundColor: c.primary },
    rankText: { ...Typography.labelSmall, color: c.textSecondary },
    rankTextTop: { color: c.onPrimary },
    consumerInfo: { flex: 1 },
    consumerName: { ...Typography.label, color: c.text },
    consumerPct: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 1 },
    consumerKwh: { ...Typography.statSmall, color: c.primaryText },
    chevron: { ...Typography.h2, color: c.textMuted, marginLeft: Spacing.sm },

    /* Charts */
    chartCard: {
      backgroundColor: c.card, borderRadius: Radius.card,
      padding: Spacing.lg, alignItems: 'center', ...Shadows.md,
    },
    barChart: { borderRadius: Radius.md },

    /* Cost */
    costCard: {
      backgroundColor: c.card, borderRadius: Radius.card,
      paddingHorizontal: 16, paddingVertical: 8, ...Shadows.md,
    },
    costRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.divider,
    },
    costDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
    costCategory: { flex: 1, ...Typography.bodyMedium, color: c.text },
    costValue: { ...Typography.statSmall, color: c.primaryText },

    /* Insight (dark card in both themes) */
    insightCard: {
      borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center',
    },
    insightEmoji: { fontSize: 36, marginBottom: 10 },
    insightTitle: { ...Typography.h3, color: c.textOnDark, marginBottom: 8 },
    reductionChoices: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    reductionChoice: {
      alignItems: 'center',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: Radius.pill,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    reductionChoiceActive: { backgroundColor: c.primary, borderColor: c.primary },
    reductionChoiceText: { ...Typography.labelSmall, color: c.textOnDarkSub },
    reductionChoiceTextActive: { color: c.onPrimary },
    insightBody: { ...Typography.bodyMedium, color: c.textOnDarkSub, textAlign: 'center', lineHeight: 22 },
    insightHighlight: { color: c.primary, fontWeight: '700' },
  });
};

export default DashboardScreen;
