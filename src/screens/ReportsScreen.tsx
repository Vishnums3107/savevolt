import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, View, Text, StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { formatEnergy, formatCost, formatCO2 } from '../utils/energy';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { format } from 'date-fns';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { Appliance, DashboardData, EnergyTip, Streak, UserGoal } from '../types';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';

type ExportKind = 'text' | 'csv';

interface ReportInput {
  dashboardData: DashboardData | null;
  appliances: Appliance[];
  streak: Streak;
  goals: UserGoal[];
  tips: EnergyTip[];
  currency: string;
}

/** Report sections between the dated title and the "Generated" footer. */
const buildReportBody = ({ dashboardData, appliances, streak, goals, tips, currency }: ReportInput) => {
  let r = '';
  if (dashboardData) {
    r += `MONTHLY SUMMARY\nEnergy: ${formatEnergy(dashboardData.totalEnergyConsumed)}\nCost: ${formatCost(dashboardData.totalCost, currency)}\nCO2: ${formatCO2(dashboardData.totalCO2Saved)}\nTrees: ${dashboardData.treesEquivalent.toFixed(1)}\n\n`;
    r += 'TOP CONSUMERS\n';
    dashboardData.topConsumers.slice(0, 3).forEach((c, i) => {
      r += `${i + 1}. ${c.applianceName} - ${formatEnergy(c.monthlyConsumption)}/mo (${c.percentage.toFixed(1)}%)\n`;
    });
    r += '\nCATEGORY BREAKDOWN\n';
    dashboardData.consumptionByCategory.forEach((category) => {
      r += `- ${category.category}: ${formatEnergy(category.consumption)}/mo | ${formatCost(category.cost, currency)} | ${category.percentage.toFixed(1)}%\n`;
    });
    r += '\n';
  }
  r += `APPLIANCES (${appliances.length})\n`;
  appliances.forEach(a => { r += `- ${a.name} (${a.powerRating}W, ${a.hoursPerDay}h/day)\n`; });
  r += `\nSTREAK: ${streak.currentStreak} days | Best: ${streak.longestStreak}\n`;
  if (goals.length > 0) {
    r += '\nGOAL STATUS\n';
    goals.forEach((goal) => {
      const progress = goal.target > 0 ? (goal.currentValue / goal.target) * 100 : 0;
      r += `- ${goal.type}: ${Math.min(progress, 100).toFixed(0)}% of monthly limit (${goal.isAchieved ? 'within target' : 'above target'})\n`;
    });
  }
  if (tips.length > 0) {
    r += '\nTOP SAVING OPPORTUNITIES\n';
    tips.slice(0, 5).forEach((tip, index) => {
      r += `${index + 1}. ${tip.title} — potential ${formatEnergy(tip.potentialSavings)}/mo\n`;
    });
  }
  return r;
};

const buildCSV = (appliances: Appliance[], dashboardData: DashboardData | null, electricityRate: number) => {
  let csv = 'Appliance,Category,Power (W),Hours/Day,Daily kWh,Monthly kWh,Monthly Cost\n';
  appliances.forEach(a => {
    const d = (a.powerRating * a.hoursPerDay * a.quantity) / 1000;
    csv += `"${a.name}","${a.category}",${a.powerRating},${a.hoursPerDay},${d.toFixed(2)},${(d * 30).toFixed(2)},${(d * 30 * electricityRate).toFixed(2)}\n`;
  });
  if (dashboardData) {
    csv += '\nCategory,Monthly kWh,Monthly Cost,Share of Energy\n';
    dashboardData.consumptionByCategory.forEach((category) => {
      csv += `"${category.category}",${category.consumption.toFixed(2)},${category.cost.toFixed(2)},${category.percentage.toFixed(2)}%\n`;
    });
  }
  return csv;
};

const ReportsScreen = () => {
  const {
    dashboardData, appliances, usageRecords, settings, streak, tips, goals, saveUsageRecord,
  } = useEnergy(
    'dashboardData', 'appliances', 'usageRecords', 'settings', 'streak', 'tips', 'goals', 'saveUsageRecord',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [busyExport, setBusyExport] = useState<ExportKind | null>(null);
  const mountedRef = useRef(true);
  const { currency, electricityRate } = settings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reportBody = useMemo(
    () => buildReportBody({ dashboardData, appliances, streak, goals, tips, currency }),
    [dashboardData, appliances, streak, goals, tips, currency],
  );

  const csv = useMemo(
    () => buildCSV(appliances, dashboardData, electricityRate),
    [appliances, dashboardData, electricityRate],
  );

  const summaryMetrics = useMemo(
    () => (dashboardData
      ? [
        { l: 'Energy', v: formatEnergy(dashboardData.totalEnergyConsumed) },
        { l: 'Cost', v: formatCost(dashboardData.totalCost, currency) },
        { l: 'CO₂', v: formatCO2(dashboardData.totalCO2Saved) },
      ]
      : []),
    [dashboardData, currency],
  );

  const recentRecords = useMemo(() => usageRecords.slice(-5).reverse(), [usageRecords]);

  // Dates are stamped at export time so a long-open screen never shares a stale timestamp
  const generateTextReport = useCallback(() => {
    const now = new Date();
    return `ENERGY USAGE REPORT - ${format(now, 'MMMM yyyy')}\n${'='.repeat(40)}\n\n${reportBody}\nGenerated by SaveVolt - ${format(now, 'PPpp')}\n`;
  }, [reportBody]);

  const runExport = useCallback(async (kind: ExportKind, share: () => Promise<unknown>) => {
    setBusyExport(kind);
    try {
      await share();
    } catch (e: unknown) {
      console.warn('Report export failed:', e);
      if (mountedRef.current) {
        Alert.alert('Export failed', 'The report could not be shared. Please try again.');
      }
    } finally {
      if (mountedRef.current) setBusyExport(null);
    }
  }, []);

  const handleShareText = useCallback(() => runExport('text', () => Share.open({
    title: 'Energy Report',
    message: generateTextReport(),
    failOnCancel: false,
  })), [generateTextReport, runExport]);

  const handleShareCSV = useCallback(() => runExport('csv', async () => {
    const fn = `energy_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const fp = `${RNFS.CachesDirectoryPath}/${fn}`;
    await RNFS.writeFile(fp, csv, 'utf8');
    await Share.open({ title: 'Energy CSV', url: Platform.OS === 'android' ? `file://${fp}` : fp, type: 'text/csv', filename: fn, failOnCancel: false });
  }), [csv, runExport]);

  const handleView = useCallback(
    () => Alert.alert('Monthly Report', generateTextReport(), [{ text: 'Close' }], { cancelable: true }),
    [generateTextReport],
  );

  const handleLogUsage = useCallback(() => {
    saveUsageRecord()
      .then(() => AccessibilityInfo.announceForAccessibility('Today’s usage logged'))
      .catch((error: unknown) => console.error('Failed to log usage:', error));
  }, [saveUsageRecord]);

  const openAddAppliance = useCallback(() => {
    navigation.navigate('Track', { screen: 'AddAppliance', initial: false });
  }, [navigation]);

  if (!dashboardData) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          icon="📄"
          title="No Report Data"
          body="Add appliances to generate a monthly report you can view, share, or export as CSV."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the Track tab to register a new appliance',
            onPress: openAddAppliance,
          }}
        />
      </>
    );
  }

  const exportOptions: {
    key: string;
    icon: string;
    title: string;
    desc: string;
    hint: string;
    fn: () => void;
    kind?: ExportKind;
  }[] = [
    { key: 'view', icon: '📄', title: 'View Full Report', desc: 'Detailed monthly summary', hint: 'Shows the full report in a dialog', fn: handleView },
    { key: 'text', icon: '📱', title: 'Share Text Report', desc: 'Via message, email, social', hint: 'Opens the share sheet with the report as text', fn: handleShareText, kind: 'text' },
    { key: 'csv', icon: '📊', title: 'Export CSV', desc: 'Spreadsheet-ready data', hint: 'Creates a CSV file and opens the share sheet', fn: handleShareCSV, kind: 'csv' },
  ];

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>REPORTS</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Export & Share</Text>
      </LinearGradient>

      <View style={s.body}>
        {/* Summary */}
        <View style={s.summaryCard}>
          <Text style={s.summaryDate} accessibilityRole="header">{format(new Date(), 'MMMM yyyy')}</Text>
          <View style={s.summaryRow}>
            {summaryMetrics.map(m => (
              <View key={m.l} style={s.summaryItem} accessible accessibilityLabel={`${m.l}: ${m.v}`}>
                <Text style={s.summaryVal}>{m.v}</Text>
                <Text style={s.summaryLbl}>{m.l}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.coverageCard} accessible>
          <Text style={s.coverageTitle}>Included in this report</Text>
          <Text style={s.coverageText}>Monthly totals, top consumers, category breakdown, tracked appliances, goal status, streaks, and up to five saving opportunities.</Text>
        </View>

        {/* Export buttons */}
        <Text style={s.secTitle} accessibilityRole="header">Export Options</Text>
        {exportOptions.map(b => {
          const busy = b.kind !== undefined && busyExport === b.kind;
          // One share sheet at a time: lock both export actions while either is running
          const disabled = b.kind !== undefined && busyExport !== null;
          return (
            <AccessibleTouchable
              key={b.key}
              label={b.title}
              hint={b.hint}
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              style={[s.exportBtn, disabled && !busy && s.exportBtnDisabled]}
              onPress={b.fn}
            >
              <Text style={s.exportIcon} accessible={false} importantForAccessibility="no">{b.icon}</Text>
              <View style={s.exportInfo}>
                <Text style={s.exportTitle}>{b.title}</Text>
                <Text style={s.exportDesc}>{busy ? 'Preparing…' : b.desc}</Text>
              </View>
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={s.arrow} accessible={false} importantForAccessibility="no">›</Text>
              )}
            </AccessibleTouchable>
          );
        })}

        {/* Recent activity */}
        <View style={s.recentActivity}>
          <Text style={s.secTitle} accessibilityRole="header">Recent Activity</Text>
          {recentRecords.length === 0 ? (
            <EmptyState
              variant="inline"
              icon="📅"
              title="No Daily Logs Yet"
              body="Log today’s usage to start a history of daily energy and cost."
              primaryAction={{
                label: 'Log today’s usage',
                hint: 'Saves today’s estimated usage from your appliances',
                onPress: handleLogUsage,
              }}
              style={s.emptyCard}
            />
          ) : (
            recentRecords.map(r => {
              const date = format(new Date(r.date), 'MMM dd, yyyy');
              const energy = formatEnergy(r.totalConsumption);
              const cost = formatCost(r.totalCost, currency);
              return (
                <View key={r.id} style={s.recordRow} accessible accessibilityLabel={`${date}: ${energy}, ${cost}`}>
                  <Text style={s.recordDate}>{date}</Text>
                  <View style={s.recordStats}>
                    <Text style={s.recordStat}>{energy}</Text>
                    <Text style={s.recordStat}>{cost}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
    body: { padding: Spacing.page },
    summaryCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.xl, ...Shadows.md, marginBottom: 20 },
    summaryDate: { ...Typography.label, color: c.textSecondary, textAlign: 'center', marginBottom: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryVal: { ...Typography.stat, color: c.primaryText },
    summaryLbl: { ...Typography.labelSmall, color: c.textMuted, marginTop: 4 },
    coverageCard: { backgroundColor: c.primarySoft, borderRadius: Radius.md, padding: 14, marginBottom: 20 },
    coverageTitle: { ...Typography.label, color: c.primaryText, marginBottom: 4 },
    coverageText: { ...Typography.bodySmall, color: c.textSecondary, lineHeight: 18 },
    secTitle: { ...Typography.label, color: c.textSecondary, marginBottom: 10, letterSpacing: 0.5 },
    exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: Radius.card, padding: 16, marginBottom: 10, ...Shadows.sm },
    exportBtnDisabled: { opacity: 0.55 },
    exportIcon: { fontSize: 32, marginRight: 14 },
    exportInfo: { flex: 1 },
    exportTitle: { ...Typography.h3, color: c.text },
    exportDesc: { ...Typography.bodySmall, color: c.textMuted, marginTop: 1 },
    arrow: { fontSize: 22, color: c.textMuted },
    recentActivity: { marginTop: 24, marginBottom: 30 },
    emptyCard: { backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.sm },
    recordRow: { backgroundColor: c.card, borderRadius: Radius.sm, padding: 12, marginBottom: 6, ...Shadows.sm },
    recordDate: { ...Typography.label, color: c.text, marginBottom: 6 },
    recordStats: { flexDirection: 'row', justifyContent: 'space-around' },
    recordStat: { ...Typography.bodyMedium, color: c.textSecondary },
  });
};

export default ReportsScreen;
