import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, View, Text, StyleSheet, ScrollView, Alert, Platform, Modal, TextInput, Image,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import ViewShot from 'react-native-view-shot';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { formatEnergy, formatCost, formatCO2 } from '../utils/energy';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { format, subDays } from 'date-fns';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { Appliance, DashboardData, EnergyTip, Streak, UserGoal, UtilityBill } from '../types';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';

type ExportKind = 'text' | 'csv' | 'image';

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
    dashboardData, appliances, usageRecords, settings, streak, tips, goals, bills, addBill, deleteBill,
  } = useEnergy(
    'dashboardData', 'appliances', 'usageRecords', 'settings', 'streak', 'tips', 'goals', 'bills', 'addBill', 'deleteBill',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [busyExport, setBusyExport] = useState<ExportKind | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billStart, setBillStart] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [billEnd, setBillEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [billKwh, setBillKwh] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const viewShotRef = useRef<any>(null);
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

  const latestBill = useMemo(() => {
    const list = bills || [];
    return list.length > 0 ? list[list.length - 1] : null;
  }, [bills]);

  const reconciliation = useMemo(() => {
    if (!latestBill || !dashboardData) return null;
    const diffKwh = latestBill.kWh - dashboardData.totalEnergyConsumed;
    const diffCost = latestBill.amount - dashboardData.totalCost;
    const effectiveRate = latestBill.kWh > 0 ? latestBill.amount / latestBill.kWh : 0;
    const pctDiff = dashboardData.totalEnergyConsumed > 0
      ? ((latestBill.kWh - dashboardData.totalEnergyConsumed) / dashboardData.totalEnergyConsumed) * 100
      : 0;
    return {
      diffKwh,
      diffCost,
      effectiveRate,
      pctDiff,
    };
  }, [latestBill, dashboardData]);

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

  const handleShareImage = useCallback(() => runExport('image', async () => {
    if (!viewShotRef.current?.capture) {
      throw new Error('Image renderer unavailable.');
    }
    const uri = await viewShotRef.current.capture();
    await Share.open({
      title: 'SaveVolt Monthly Report Card',
      url: uri,
      type: 'image/png',
      failOnCancel: false,
    });
  }), [runExport]);

  const handleSaveBill = async () => {
    const kwhNum = parseFloat(billKwh.replace(',', '.'));
    const amountNum = parseFloat(billAmount.replace(',', '.'));
    if (!billStart || !billEnd || billEnd < billStart) {
      Alert.alert('Check dates', 'Enter billing period start and end dates (YYYY-MM-DD).');
      return;
    }
    if (!Number.isFinite(kwhNum) || kwhNum <= 0) {
      Alert.alert('Check kWh', 'Enter the total kWh billed.');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      Alert.alert('Check amount', 'Enter the total billed cost.');
      return;
    }
    try {
      await addBill({ periodStart: billStart, periodEnd: billEnd, kWh: kwhNum, amount: amountNum });
      setShowBillModal(false);
      setBillKwh('');
      setBillAmount('');
      Alert.alert('Bill Saved', 'Utility bill saved and reconciled against your tracked data.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save bill.');
    }
  };

  const confirmDeleteBill = (billId: string) => {
    Alert.alert('Delete Bill', 'Remove this utility bill entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBill(billId) },
    ]);
  };

  const handleView = useCallback(
    () => Alert.alert('Monthly Report', generateTextReport(), [{ text: 'Close' }], { cancelable: true }),
    [generateTextReport],
  );

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
    { key: 'image', icon: '📸', title: 'Export Report Card Image', desc: 'Visual card for WhatsApp, social & print', hint: 'Exports visual image of the report card', fn: handleShareImage, kind: 'image' },
    { key: 'csv', icon: '📊', title: 'Export CSV', desc: 'Spreadsheet-ready appliances and data', hint: 'Creates a CSV file and opens the share sheet', fn: handleShareCSV, kind: 'csv' },
    { key: 'text', icon: '📱', title: 'Share Text Report', desc: 'Via message, email, social', hint: 'Opens the share sheet with the report as text', fn: handleShareText, kind: 'text' },
    { key: 'view', icon: '📄', title: 'View Full Text', desc: 'Detailed monthly summary log', hint: 'Shows the full report in a dialog', fn: handleView },
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

        {/* ── Utility Bills & Reconciliation ── */}
        <View style={s.billsSection}>
          <View style={s.billsHeaderRow}>
            <View>
              <Text style={s.secTitle} accessibilityRole="header">Utility Bills & Reconciliation</Text>
              <Text style={s.billsSubtitle}>Compare actual electricity bills against your tracked estimate</Text>
            </View>
            <AccessibleTouchable
              label="Log Utility Bill"
              style={s.addBillBtn}
              onPress={() => setShowBillModal(true)}
            >
              <Text style={s.addBillBtnText}>+ Log Bill</Text>
            </AccessibleTouchable>
          </View>

          {latestBill && reconciliation ? (
            <View style={s.reconcileCard}>
              <View style={s.reconcileTop}>
                <Text style={s.reconcileDates}>
                  Period: {latestBill.periodStart} to {latestBill.periodEnd}
                </Text>
                <View style={[
                  s.variancePill,
                  Math.abs(reconciliation.pctDiff) <= 5 ? s.varianceMatched : reconciliation.pctDiff > 0 ? s.varianceHigher : s.varianceLower,
                ]}>
                  <Text style={s.variancePillText}>
                    {Math.abs(reconciliation.pctDiff) <= 5
                      ? 'Matched (±5%)'
                      : reconciliation.pctDiff > 0
                        ? `+${reconciliation.pctDiff.toFixed(1)}% higher`
                        : `${reconciliation.pctDiff.toFixed(1)}% lower`}
                  </Text>
                </View>
              </View>

              <View style={s.reconcileGrid}>
                <View style={s.reconcileCol}>
                  <Text style={s.reconcileLbl}>Billed Energy</Text>
                  <Text style={s.reconcileVal}>{latestBill.kWh.toFixed(1)} kWh</Text>
                  <Text style={s.reconcileSub}>Tracked: {dashboardData.totalEnergyConsumed.toFixed(1)} kWh</Text>
                </View>
                <View style={s.reconcileDivider} />
                <View style={s.reconcileCol}>
                  <Text style={s.reconcileLbl}>Billed Cost</Text>
                  <Text style={s.reconcileVal}>{formatCost(latestBill.amount, currency)}</Text>
                  <Text style={s.reconcileSub}>Tracked: {formatCost(dashboardData.totalCost, currency)}</Text>
                </View>
                <View style={s.reconcileDivider} />
                <View style={s.reconcileCol}>
                  <Text style={s.reconcileLbl}>Effective Rate</Text>
                  <Text style={s.reconcileVal}>{currency}{reconciliation.effectiveRate.toFixed(3)}</Text>
                  <Text style={s.reconcileSub}>per kWh</Text>
                </View>
              </View>

              <Text style={s.reconcileAdvice}>
                {Math.abs(reconciliation.pctDiff) <= 5
                  ? '🎯 Excellent match: Your configured appliance hours accurately reflect utility billing.'
                  : reconciliation.pctDiff > 0
                    ? `⚠️ Your bill is ${formatEnergy(reconciliation.diffKwh)} higher than tracked. Check standby power or appliances with higher duty cycles.`
                    : `⚡ Your bill is ${formatEnergy(Math.abs(reconciliation.diffKwh))} lower than tracked. Your household ran fewer hours than configured.`}
              </Text>

              {bills && bills.length > 0 && (
                <View style={s.billHistoryList}>
                  <Text style={s.billHistoryTitle}>Logged Bills History ({bills.length})</Text>
                  {bills.slice(-3).reverse().map((b) => (
                    <View key={b.id} style={s.billRow}>
                      <View style={s.billRowInfo}>
                        <Text style={s.billRowDate}>{b.periodStart} ~ {b.periodEnd}</Text>
                        <Text style={s.billRowKwh}>{b.kWh.toFixed(1)} kWh · {formatCost(b.amount, currency)}</Text>
                      </View>
                      <AccessibleTouchable
                        label="Delete this bill"
                        style={s.billDeleteBtn}
                        onPress={() => confirmDeleteBill(b.id)}
                      >
                        <Text style={s.billDeleteTxt}>✕</Text>
                      </AccessibleTouchable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={s.noBillsCard}>
              <Text style={s.noBillsEmoji}>🧾</Text>
              <Text style={s.noBillsTitle}>No Utility Bills Logged</Text>
              <Text style={s.noBillsBody}>
                Enter your actual electricity bill to reconcile tracked appliance usage with utility charges.
              </Text>
              <AccessibleTouchable
                label="Log First Utility Bill"
                style={s.noBillsActionBtn}
                onPress={() => setShowBillModal(true)}
              >
                <Text style={s.noBillsActionBtnText}>Log First Bill</Text>
              </AccessibleTouchable>
            </View>
          )}
        </View>

        {/* ── ViewShot Branded Report Card Preview ── */}
        <Text style={s.secTitle} accessibilityRole="header">Monthly Visual Report Card</Text>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }} style={s.reportCardViewShot}>
          <LinearGradient colors={['#101c33', '#162846', '#1a335a']} style={s.reportCardInner}>
            <View style={s.reportCardHeader}>
              <View style={s.reportCardBrand}>
                <Image
                  source={require('../assets/branding/savevolt-logo.png')}
                  style={s.reportCardLogo}
                />
                <View>
                  <Text style={s.reportCardBrandName}>SAVEVOLT</Text>
                  <Text style={s.reportCardBrandSub}>Smart Energy Management</Text>
                </View>
              </View>
              <View style={s.reportCardStamp}>
                <Text style={s.reportCardMonth}>{format(new Date(), 'MMMM yyyy')}</Text>
              </View>
            </View>

            <View style={s.reportCardStatsRow}>
              <View style={s.reportCardStat}>
                <Text style={s.reportCardStatVal}>{formatEnergy(dashboardData.totalEnergyConsumed)}</Text>
                <Text style={s.reportCardStatLbl}>Energy Used</Text>
              </View>
              <View style={s.reportCardStatDivider} />
              <View style={s.reportCardStat}>
                <Text style={s.reportCardStatVal}>{formatCost(dashboardData.totalCost, currency)}</Text>
                <Text style={s.reportCardStatLbl}>Estimated Cost</Text>
              </View>
              <View style={s.reportCardStatDivider} />
              <View style={s.reportCardStat}>
                <Text style={s.reportCardStatVal}>{formatCO2(dashboardData.totalCO2Saved)}</Text>
                <Text style={s.reportCardStatLbl}>CO₂ Footprint</Text>
              </View>
            </View>

            <View style={s.reportCardTopConsumers}>
              <Text style={s.reportCardSectionTitle}>Top Consumers This Month</Text>
              {dashboardData.topConsumers.slice(0, 3).map((item, i) => (
                <View key={item.applianceId} style={s.reportCardConsumerRow}>
                  <Text style={s.reportCardConsumerRank}>#{i + 1}</Text>
                  <Text style={s.reportCardConsumerName}>{item.applianceName}</Text>
                  <Text style={s.reportCardConsumerVal}>{formatEnergy(item.monthlyConsumption)} ({item.percentage.toFixed(0)}%)</Text>
                </View>
              ))}
            </View>

            <View style={s.reportCardFooter}>
              <Text style={s.reportCardFooterTxt}>
                🔥 Streak: {streak.currentStreak} days · 🌳 {dashboardData.treesEquivalent.toFixed(1)} trees equivalent offset
              </Text>
              <Text style={s.reportCardCertified}>Verified Household Report</Text>
            </View>
          </LinearGradient>
        </ViewShot>

        <View style={s.coverageCard} accessible>
          <Text style={s.coverageTitle}>Included in this report</Text>
          <Text style={s.coverageText}>Monthly totals, top consumers, category breakdown, tracked appliances, utility bill variance, goal status, and savings opportunities.</Text>
        </View>

        {/* Export buttons */}
        <Text style={s.secTitle} accessibilityRole="header">Export & Share Options</Text>
        {exportOptions.map(b => {
          const busy = b.kind !== undefined && busyExport === b.kind;
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

        {/* ── Bill Entry Modal ── */}
        <Modal visible={showBillModal} animationType="slide" transparent onRequestClose={() => setShowBillModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent} accessibilityViewIsModal>
              <Text style={s.modalTitle} accessibilityRole="header">Log Utility Bill</Text>

              <Text style={s.modalLabel}>Billing Period Start (YYYY-MM-DD)</Text>
              <TextInput
                style={s.modalInput}
                value={billStart}
                onChangeText={setBillStart}
                placeholder="2026-09-01"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Billing Period Start"
              />

              <Text style={s.modalLabel}>Billing Period End (YYYY-MM-DD)</Text>
              <TextInput
                style={s.modalInput}
                value={billEnd}
                onChangeText={setBillEnd}
                placeholder="2026-09-30"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Billing Period End"
              />

              <Text style={s.modalLabel}>Total Billed Energy (kWh)</Text>
              <TextInput
                style={s.modalInput}
                value={billKwh}
                onChangeText={setBillKwh}
                keyboardType="decimal-pad"
                placeholder="e.g. 350.5"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Total Billed Energy"
              />

              <Text style={s.modalLabel}>Total Billed Amount ({currency})</Text>
              <TextInput
                style={s.modalInput}
                value={billAmount}
                onChangeText={setBillAmount}
                keyboardType="decimal-pad"
                placeholder="e.g. 52.50"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Total Billed Amount"
              />

              <View style={s.modalBtns}>
                <AccessibleTouchable
                  label="Cancel"
                  style={s.modalCancelBtn}
                  onPress={() => setShowBillModal(false)}
                >
                  <Text style={s.modalCancelTxt}>Cancel</Text>
                </AccessibleTouchable>
                <AccessibleTouchable
                  label="Save Utility Bill"
                  style={s.modalSaveBtn}
                  onPress={handleSaveBill}
                >
                  <Text style={s.modalSaveTxt}>Save Bill</Text>
                </AccessibleTouchable>
              </View>
            </View>
          </View>
        </Modal>
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

    /* Bills & Reconciliation */
    billsSection: { marginBottom: 24 },
    billsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    billsSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: -6 },
    addBillBtn: { backgroundColor: c.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill },
    addBillBtnText: { ...Typography.labelSmall, color: c.onPrimary, fontWeight: '700' },
    reconcileCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: 16, borderWidth: 1, borderColor: c.borderLight, ...Shadows.sm },
    reconcileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    reconcileDates: { ...Typography.labelSmall, color: c.textSecondary },
    variancePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
    varianceMatched: { backgroundColor: c.successSoft },
    varianceHigher: { backgroundColor: c.dangerSoft },
    varianceLower: { backgroundColor: c.infoSoft },
    variancePillText: { ...Typography.labelSmall, color: c.text, fontWeight: '700' },
    reconcileGrid: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider, borderBottomWidth: 1, borderBottomColor: c.divider },
    reconcileCol: { flex: 1, alignItems: 'center' },
    reconcileDivider: { width: 1, height: 32, backgroundColor: c.divider },
    reconcileLbl: { ...Typography.labelSmall, color: c.textMuted },
    reconcileVal: { ...Typography.statSmall, color: c.primaryText, marginVertical: 2 },
    reconcileSub: { ...Typography.bodySmall, color: c.textSecondary, fontSize: 10 },
    reconcileAdvice: { ...Typography.bodySmall, color: c.text, marginTop: 12, lineHeight: 18 },
    billHistoryList: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.divider },
    billHistoryTitle: { ...Typography.labelSmall, color: c.textSecondary, marginBottom: 8, textTransform: 'uppercase' },
    billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    billRowInfo: { flex: 1 },
    billRowDate: { ...Typography.labelSmall, color: c.text },
    billRowKwh: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 1 },
    billDeleteBtn: { padding: 6 },
    billDeleteTxt: { color: c.textMuted, fontSize: 14 },
    noBillsCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: 20, alignItems: 'center', ...Shadows.sm },
    noBillsEmoji: { fontSize: 32, marginBottom: 8 },
    noBillsTitle: { ...Typography.h3, color: c.text, marginBottom: 4 },
    noBillsBody: { ...Typography.bodySmall, color: c.textSecondary, textAlign: 'center', marginBottom: 14 },
    noBillsActionBtn: { backgroundColor: c.borderLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill },
    noBillsActionBtnText: { ...Typography.labelSmall, color: c.text, fontWeight: '700' },

    /* Report Card ViewShot */
    reportCardViewShot: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 20, ...Shadows.md },
    reportCardInner: { padding: 20 },
    reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    reportCardBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    reportCardLogo: { width: 34, height: 34, borderRadius: 8 },
    reportCardBrandName: { ...Typography.h3, color: c.textOnDark, letterSpacing: 1.2 },
    reportCardBrandSub: { ...Typography.labelSmall, color: c.textOnDarkSub, fontSize: 10 },
    reportCardStamp: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
    reportCardMonth: { ...Typography.labelSmall, color: c.textOnDark, fontWeight: '700' },
    reportCardStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 8, marginBottom: 16 },
    reportCardStat: { flex: 1, alignItems: 'center' },
    reportCardStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.14)' },
    reportCardStatVal: { ...Typography.statSmall, color: c.primary },
    reportCardStatLbl: { ...Typography.labelSmall, color: c.textOnDarkSub, fontSize: 10, marginTop: 2 },
    reportCardTopConsumers: { marginBottom: 16 },
    reportCardSectionTitle: { ...Typography.labelSmall, color: c.textOnDarkSub, textTransform: 'uppercase', marginBottom: 8 },
    reportCardConsumerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    reportCardConsumerRank: { width: 22, ...Typography.labelSmall, color: c.primary },
    reportCardConsumerName: { flex: 1, ...Typography.bodySmall, color: c.textOnDark },
    reportCardConsumerVal: { ...Typography.labelSmall, color: c.textOnDarkSub },
    reportCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
    reportCardFooterTxt: { ...Typography.labelSmall, color: c.textOnDarkSub, flex: 1 },
    reportCardCertified: { ...Typography.labelSmall, color: c.primary, fontWeight: '700' },

    /* Modal */
    modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: c.card, borderRadius: Radius.xl, padding: 24, width: '88%', maxWidth: 400 },
    modalTitle: { ...Typography.h1, color: c.text, textAlign: 'center', marginBottom: 16 },
    modalLabel: { ...Typography.labelSmall, color: c.textSecondary, marginTop: 10, marginBottom: 4 },
    modalInput: { backgroundColor: c.inputBg, borderRadius: Radius.sm, padding: 12, ...Typography.bodyMedium, color: c.text, borderWidth: 1, borderColor: c.border },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.sm, backgroundColor: c.inputBg, alignItems: 'center' },
    modalCancelTxt: { ...Typography.label, color: c.text },
    modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.sm, backgroundColor: c.primary, alignItems: 'center' },
    modalSaveTxt: { ...Typography.label, color: c.onPrimary, fontWeight: '700' },
  });
};

export default ReportsScreen;
