import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { LineChart } from 'react-native-chart-kit';
import { generateTrendData, formatEnergy, formatCost } from '../utils/energy';
import { format } from 'date-fns';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';

const W = Dimensions.get('window').width;
type Period = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: Period; short: string; label: string; days: number }[] = [
  { key: 'daily', short: '7D', label: 'Last 7 days', days: 7 },
  { key: 'weekly', short: '4W', label: 'Last 4 weeks', days: 28 },
  { key: 'monthly', short: '3M', label: 'Last 3 months', days: 90 },
];

const MEDALS = ['🥇', '🥈', '🥉'];
const RANKS = ['Highest', 'Second highest', 'Third highest'];

/** chart-kit asks for rgba() strings so it can vary the opacity of a series. */
const toRgba = (hex: string, opacity: number) => {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${opacity})`;
};

const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const TrendsScreen = () => {
  const { usageRecords, dashboardData, settings } = useEnergy(
    'usageRecords',
    'dashboardData',
    'settings',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [period, setPeriod] = useState<Period>('weekly');
  const { electricityRate, currency } = settings;

  const activePeriod = PERIODS.find((item) => item.key === period) ?? PERIODS[1];
  const days = activePeriod.days;

  const trend = useMemo(
    () => generateTrendData(usageRecords, days, electricityRate),
    [usageRecords, days, electricityRate],
  );

  const chartData = useMemo(() => ({
    labels: trend.map((d, i) => {
      if (period === 'daily') return format(new Date(d.date), 'dd');
      if (period === 'weekly') return i % 7 === 0 ? format(new Date(d.date), 'MMM dd') : '';
      return i % 30 === 0 ? format(new Date(d.date), 'MMM') : '';
    }),
    datasets: [{ data: trend.map((d) => d.consumption || 0.01) }],
  }), [trend, period]);

  const stats = useMemo(() => {
    const consumption = trend.map((d) => d.consumption);
    const curAvg = average(consumption.slice(-Math.floor(days / 2)));
    const prevAvg = average(consumption.slice(0, Math.floor(days / 2)));
    return {
      avg: average(consumption),
      avgCost: average(trend.map((d) => d.cost)),
      avgCO2: average(trend.map((d) => d.co2)),
      prevAvg,
      pctChange: prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0,
      improved: curAvg < prevAvg,
      min: consumption.length > 0 ? Math.min(...consumption) : 0,
      max: consumption.length > 0 ? Math.max(...consumption) : 0,
      daysWithUsage: consumption.filter((value) => value > 0).length,
    };
  }, [trend, days]);

  const chartConfig = useMemo(() => ({
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 1,
    color: (opacity = 1) => toRgba(colors.primary, opacity),
    labelColor: () => colors.textSecondary,
    propsForDots: { r: '3', strokeWidth: '1', stroke: colors.primary },
    propsForBackgroundLines: { strokeDasharray: '', stroke: colors.borderLight },
  }), [colors]);

  // Logging happens in the daily log, where the user confirms how long each device ran
  const handleLogUsage = useCallback(() => {
    navigation.navigate('Track', { screen: 'DailyLog', initial: false });
  }, [navigation]);

  const openAddAppliance = useCallback(() => {
    navigation.navigate('Track', { screen: 'AddAppliance', initial: false });
  }, [navigation]);

  if (!dashboardData) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          icon="📈"
          title="No Trend Data"
          body="Add appliances and track usage to see how your consumption changes over time."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the Track tab to register a new appliance',
            onPress: openAddAppliance,
          }}
        />
      </>
    );
  }

  const hasRecords = usageRecords.length > 0;
  const { avg, avgCost, avgCO2, prevAvg, pctChange, improved } = stats;
  const pctText = `${Math.abs(pctChange).toFixed(1)}%`;
  const chartSummary =
    `Line chart of daily consumption over the ${activePeriod.label.toLowerCase()}, ` +
    `from ${formatEnergy(stats.min)} to ${formatEnergy(stats.max)} per day, ` +
    `with usage on ${stats.daysWithUsage} of ${trend.length} days.`;

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ENERGY TRENDS</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Usage Patterns</Text>
      </LinearGradient>

      {/* Period selector */}
      <View style={s.pillRow} accessibilityRole="tablist" accessibilityLabel="Trend period">
        {PERIODS.map((item) => {
          const selected = period === item.key;
          return (
            <AccessibleTouchable
              key={item.key}
              role="tab"
              label={item.label}
              accessibilityState={{ selected }}
              style={[s.pill, selected && s.pillActive]}
              onPress={() => setPeriod(item.key)}
            >
              <Text style={[s.pillTxt, selected && s.pillTxtActive]}>{item.short}</Text>
            </AccessibleTouchable>
          );
        })}
      </View>

      {!hasRecords ? (
        <EmptyState
          variant="inline"
          icon="📊"
          title="No Usage Data Yet"
          body="Start logging daily energy usage to see trends here."
          primaryAction={{
            label: 'Log today’s usage',
            hint: 'Saves today’s estimated usage from your appliances',
            onPress: handleLogUsage,
          }}
          style={s.noDataCard}
        />
      ) : (
        <>
          {/* Comparison */}
          <View style={s.pad}>
            <View
              style={[s.compareCard, improved ? s.compareGood : s.compareBad]}
              accessible
              accessibilityLabel={`${pctText} ${improved ? 'decrease' : 'increase'} in average daily use versus the previous period`}
            >
              <Text style={[s.compareNum, !improved && s.compareNumBad]}>{pctText}</Text>
              <Text style={s.compareLbl}>{improved ? 'decrease' : 'increase'} vs previous period</Text>
            </View>
          </View>

          {/* Chart */}
          <View style={s.pad}>
            <View style={s.chartCard} accessible accessibilityRole="image" accessibilityLabel={chartSummary}>
              <LineChart
                data={chartData}
                width={W - 60}
                height={200}
                chartConfig={chartConfig}
                bezier
                style={s.chart}
              />
            </View>
          </View>

          {/* Averages */}
          <View style={s.avgRow}>
            {[
              { l: 'Energy/day', a11y: 'Average energy per day', v: formatEnergy(avg) },
              { l: 'Cost/day', a11y: 'Average cost per day', v: formatCost(avgCost, currency) },
              { l: 'CO₂/day', a11y: 'Average CO₂ per day', v: `${avgCO2.toFixed(1)} kg` },
            ].map((a) => (
              <View key={a.l} style={s.avgCard} accessible accessibilityLabel={`${a.a11y}: ${a.v}`}>
                <Text style={s.avgVal}>{a.v}</Text>
                <Text style={s.avgLbl}>{a.l}</Text>
              </View>
            ))}
          </View>

          <View style={s.pad}>
            <View style={s.insightCard}>
              <Text style={s.insightTitle} accessibilityRole="header">What to do next</Text>
              <Text style={s.insightText}>
                {prevAvg === 0
                  ? 'Keep logging daily usage to unlock a period-over-period comparison.'
                  : improved
                    ? `Your recent average is ${pctText} lower. Keep the habits that created this reduction.`
                    : `Your recent average is ${pctText} higher. Review your top consumer and try a focused usage reduction.`}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* Top consumers */}
      <View style={[s.pad, s.topConsumersSection]}>
        <Text style={s.sectionTitle} accessibilityRole="header">Top Consumers</Text>
        {dashboardData.topConsumers.slice(0, 3).map((c, i) => (
          <View
            key={c.applianceId}
            style={s.consumerRow}
            accessible
            accessibilityLabel={`${RANKS[i]}: ${c.applianceName}, ${formatEnergy(c.monthlyConsumption)} per month, ${c.percentage.toFixed(0)}% of total`}
          >
            <Text style={s.medal}>{MEDALS[i]}</Text>
            <View style={s.consumerInfo}>
              <Text style={s.consumerName}>{c.applianceName}</Text>
              <Text style={s.consumerVal}>{formatEnergy(c.monthlyConsumption)}/mo</Text>
            </View>
            <View style={s.pctBadge}>
              <Text style={s.pctTxt}>{c.percentage.toFixed(0)}%</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => {
  // Neon primary is too faint as text on light surfaces; use the deeper green there

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center' },
    headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
    headerTitle: { ...Typography.displaySmall, color: c.textOnDark },
    pillRow: { flexDirection: 'row', paddingHorizontal: Spacing.page, marginTop: 16, gap: 8 },
    pill: { flex: 1, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: c.card, alignItems: 'center', ...Shadows.sm },
    pillActive: { backgroundColor: c.primary },
    pillTxt: { ...Typography.label, color: c.textSecondary },
    pillTxtActive: { color: c.onPrimary },
    pad: { paddingHorizontal: Spacing.page, marginTop: 16 },
    topConsumersSection: { marginBottom: 30 },
    noDataCard: { margin: Spacing.page, backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.md },
    compareCard: { borderRadius: Radius.card, padding: 20, alignItems: 'center', ...Shadows.sm },
    compareGood: { backgroundColor: c.successSoft },
    compareBad: { backgroundColor: c.dangerSoft },
    compareNum: { ...Typography.displayMedium, color: c.primaryText },
    compareNumBad: { color: c.dangerText },
    compareLbl: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 4 },
    chartCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.md, alignItems: 'center', ...Shadows.md },
    chart: { borderRadius: Radius.md },
    avgRow: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.page, marginTop: 16 },
    avgCard: { flex: 1, backgroundColor: c.card, borderRadius: Radius.card, padding: 16, alignItems: 'center', ...Shadows.sm },
    avgVal: { ...Typography.statSmall, color: c.primaryText, textAlign: 'center' },
    avgLbl: { ...Typography.labelSmall, color: c.textMuted, marginTop: 4 },
    insightCard: { backgroundColor: c.primarySoft, borderRadius: Radius.card, padding: 16 },
    insightTitle: { ...Typography.h3, color: c.primaryText, marginBottom: 5 },
    insightText: { ...Typography.bodySmall, color: c.textSecondary, lineHeight: 18 },
    sectionTitle: { ...Typography.h2, color: c.text, marginBottom: 14 },
    consumerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: Radius.md, padding: 14, marginBottom: 8, ...Shadows.sm },
    medal: { fontSize: 24, marginRight: 12 },
    consumerInfo: { flex: 1 },
    consumerName: { ...Typography.label, color: c.text },
    consumerVal: { ...Typography.bodySmall, color: c.textMuted, marginTop: 1 },
    pctBadge: { backgroundColor: c.primarySoft, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
    pctTxt: { ...Typography.label, color: c.primaryText },
  });
};

export default TrendsScreen;
