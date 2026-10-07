import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share as RNShare,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { formatEnergy, formatCost, formatCO2 } from '../utils/energy';
import { format, parseISO } from 'date-fns';
import ViewShot from 'react-native-view-shot';
import { dayKey } from '../utils/analytics';
import { draftCertificate, verifyCertificateChain } from '../utils/certificates';
import { toast } from '../components/ui';

interface ImpactVisualizerScreenProps {
  navigation: { navigate: (screen: string, params?: object) => void };
}

const MAX_ICONS = 10;

/** Screen readers announce "CO₂" inconsistently; spell the subscript out. */
const spoken = (text: string) => text.replace(/₂/g, '2');

const ImpactVisualizerScreen = ({ navigation }: ImpactVisualizerScreenProps) => {
  const {
    dashboardData,
    settings,
    streak,
    generateDailySnapshot,
    saveDailySnapshot,
    snapshots,
    goals,
    activeTimers,
    addCountdownTimer,
    updateTimer,
    usageRecords,
    certificates,
    issueSavingsCertificate,
  } = useEnergy(
    'dashboardData',
    'settings',
    'streak',
    'generateDailySnapshot',
    'saveDailySnapshot',
    'snapshots',
    'goals',
    'activeTimers',
    'addCountdownTimer',
    'updateTimer',
    'usageRecords',
    'certificates',
    'issueSavingsCertificate',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  const [isIssuing, setIsIssuing] = useState(false);

  // Measured savings that are not on a certificate yet (up to yesterday)
  const pendingCertificate = useMemo(
    () => draftCertificate(usageRecords, certificates, settings, dayKey(new Date())),
    [usageRecords, certificates, settings],
  );
  const chain = useMemo(() => verifyCertificateChain(certificates), [certificates]);
  const certifiedKwh = useMemo(() => certificates.reduce((sum, c) => sum + c.kWhSaved, 0), [certificates]);
  const certifiedCo2 = useMemo(() => certificates.reduce((sum, c) => sum + c.co2AvoidedKg, 0), [certificates]);

  const handleIssueCertificate = async () => {
    setIsIssuing(true);
    try {
      const certificate = await issueSavingsCertificate();
      toast.success(`Certificate issued for ${formatEnergy(certificate.kWhSaved)} over ${certificate.daysCounted} measured days.`);
    } catch (error) {
      Alert.alert('Nothing to certify yet', error instanceof Error ? error.message : 'Could not issue a certificate.');
    } finally {
      setIsIssuing(false);
    }
  };

  const viewShotRef = useRef<ViewShot>(null);

  // Read the latest timers from a ref so the minute tick isn't torn down by every update it makes.
  const timersRef = useRef(activeTimers);
  useEffect(() => {
    timersRef.current = activeTimers;
  }, [activeTimers]);

  const hasRunningTimers = useMemo(() => activeTimers.some((timer) => timer.isActive), [activeTimers]);

  useEffect(() => {
    if (!hasRunningTimers) return;
    // Update active timers every minute
    const interval = setInterval(() => {
      timersRef.current.forEach((timer) => {
        if (timer.isActive) {
          updateTimer(timer.id);
        }
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [hasRunningTimers, updateTimer]);

  const impact = useMemo(() => {
    if (!dashboardData) return null;
    const { totalEnergyConsumed, totalCO2Saved, treesEquivalent } = dashboardData;
    return {
      energy: totalEnergyConsumed.toFixed(1),
      co2: totalCO2Saved.toFixed(1),
      trees: treesEquivalent.toFixed(1),
      treeIcons: Math.min(Math.ceil(treesEquivalent), MAX_ICONS),
      bulbIcons: Math.min(Math.ceil(totalEnergyConsumed / 10), MAX_ICONS),
      ledBulbHours: Math.floor(totalEnergyConsumed / 0.06),
    };
  }, [dashboardData]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todaySnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.date === todayKey),
    [snapshots, todayKey],
  );

  const recentSnapshots = useMemo(
    () =>
      snapshots
        .slice(-7)
        .reverse()
        .map((snapshot) => {
          const energy = formatEnergy(snapshot.energyConsumed);
          const co2 = formatCO2(snapshot.co2Avoided);
          const date = format(parseISO(snapshot.date), 'MMM dd');
          return {
            snapshot,
            date,
            energy,
            co2,
            label: spoken(`${date}: ${energy}, ${co2}, ${snapshot.streakDays} day streak`),
          };
        }),
    [snapshots],
  );

  const timerItems = useMemo(
    () =>
      activeTimers.map((timer) => {
        const ratio = timer.targetValue > 0 ? (timer.currentValue / timer.targetValue) * 100 : 0;
        return {
          timer,
          progress: Math.round(Math.min(100, Math.max(0, ratio))),
          remainingValue: (timer.targetValue - timer.currentValue).toFixed(1),
        };
      }),
    [activeTimers],
  );

  const handleGenerateSnapshot = async () => {
    try {
      const snapshot = await generateDailySnapshot();
      await saveDailySnapshot(snapshot);
      Alert.alert('Success', 'Daily snapshot saved!');
    } catch {
      Alert.alert('Error', 'Failed to generate snapshot');
    }
  };

  const handleShareSnapshot = async () => {
    try {
      if (!viewShotRef.current || !viewShotRef.current.capture) return;

      const uri = await viewShotRef.current.capture();
      await RNShare.share({
        title: 'My Energy Impact',
        message: `I saved ${impact?.energy} kWh today! 🌍`,
        url: uri,
      });
    } catch (error) {
      console.error('Error sharing snapshot:', error);
    }
  };

  const handleStartGoalTimer = () => {
    if (goals.length === 0) {
      Alert.alert('No Goals', 'Create a goal first to start a countdown timer!');
      return;
    }

    const goal = goals[0]; // Use first goal for demo
    const hoursToGoal = 24; // Example: 24 hours to achieve goal

    const targetTime = new Date(Date.now() + hoursToGoal * 60 * 60 * 1000).toISOString();

    addCountdownTimer({
      goalId: goal.id,
      goalTitle: goal.type === 'consumption' ? 'Energy Reduction' : 'Cost Savings',
      targetTime,
      currentTime: new Date().toISOString(),
      remainingHours: hoursToGoal,
      remainingMinutes: 0,
      targetValue: goal.target,
      currentValue: goal.currentValue,
      unit: goal.type === 'consumption' ? 'kWh' : '$',
      isActive: true,
    });

    Alert.alert('Timer Started!', `Countdown started for "${goal.type}" goal`);
  };

  if (!impact) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          icon="🌍"
          title="No impact to show yet"
          body="Add your appliances to see your energy use, CO₂ footprint and tree equivalents here."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the add appliance form',
            onPress: () => navigation.navigate('Track', { screen: 'AddAppliance', initial: false }),
          }}
        />
      </>
    );
  }

  return (
    <ScrollView style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ENERGY IMPACT</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Impact Visualizer</Text>
      </LinearGradient>

      {/* Animated Impact Visualization */}
      <ViewShot ref={viewShotRef} style={s.snapshotContainer}>
        <View style={s.impactSection}>
          <Text style={s.sectionTitle} accessibilityRole="header">Today's Impact</Text>

          <View style={s.impactCard}>
            <View style={s.impactRow}>
              <View style={s.impactItem} accessible accessibilityLabel={`Energy used: ${impact.energy} kWh`}>
                <Text style={s.impactIcon}>⚡</Text>
                <Text style={s.impactValue}>{impact.energy}</Text>
                <Text style={s.impactLabel}>kWh Used</Text>
              </View>

              <View style={s.impactItem} accessible accessibilityLabel={`CO2: ${impact.co2} kg`}>
                <Text style={s.impactIcon}>🌍</Text>
                <Text style={s.impactValue}>{impact.co2}</Text>
                <Text style={s.impactLabel}>kg CO₂</Text>
              </View>

              <View style={s.impactItem} accessible accessibilityLabel={`Trees needed: ${impact.trees}`}>
                <Text style={s.impactIcon}>🌳</Text>
                <Text style={s.impactValue}>{impact.trees}</Text>
                <Text style={s.impactLabel}>Trees Needed</Text>
              </View>
            </View>

            <View style={s.streakBox} accessible accessibilityLabel={`${streak.currentStreak} day streak`}>
              <Text style={s.streakIcon}>🔥</Text>
              <Text style={s.streakText}>{streak.currentStreak} Day Streak</Text>
            </View>
          </View>
        </View>

        {/* Mini Visualization Videos (Animated) */}
        <View style={s.videoSection}>
          <Text style={s.sectionTitle} accessibilityRole="header">Impact Visualization</Text>

          <View
            style={s.videoCard}
            accessible
            accessibilityLabel={`CO2 to trees: ${impact.trees} trees needed to offset your monthly CO2`}
          >
            <Text style={s.videoTitle}>CO₂ to Trees</Text>
            <View style={s.treeAnimation}>
              {Array.from({ length: impact.treeIcons }, (_, i) => (
                <Text key={i} style={s.treeEmoji}>🌳</Text>
              ))}
            </View>
            <Text style={s.videoDesc}>
              {impact.trees} trees needed to offset your monthly CO₂
            </Text>
          </View>

          <View
            style={s.videoCard}
            accessible
            accessibilityLabel={`Energy in light bulbs: equivalent to ${impact.ledBulbHours} LED bulbs running for 1 hour`}
          >
            <Text style={s.videoTitle}>Energy Saved = 💡</Text>
            <View style={s.bulbAnimation}>
              {Array.from({ length: impact.bulbIcons }, (_, i) => (
                <Text key={i} style={s.bulbEmoji}>💡</Text>
              ))}
            </View>
            <Text style={s.videoDesc}>
              Equivalent to {impact.ledBulbHours} LED bulbs running for 1 hour
            </Text>
          </View>
        </View>
      </ViewShot>

      {/* Daily Snapshot */}
      <View style={s.snapshotSection}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle} accessibilityRole="header">Daily Snapshot</Text>
          <AccessibleTouchable
            label="Share impact snapshot"
            hint="Opens the share sheet with an image of your impact"
            style={s.shareButton}
            onPress={handleShareSnapshot}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={s.shareButtonGradient}
            >
              <Text style={s.shareButtonText}>Share</Text>
            </LinearGradient>
          </AccessibleTouchable>
        </View>

        {todaySnapshot ? (
          <View style={s.snapshotCard}>
            <Text style={s.snapshotDate}>{format(new Date(), 'EEEE, MMMM dd, yyyy')}</Text>
            <View style={s.snapshotStats}>
              <View
                style={s.snapshotStat}
                accessible
                accessibilityLabel={`Energy: ${formatEnergy(todaySnapshot.energyConsumed)}`}
              >
                <Text style={s.snapshotLabel}>Energy</Text>
                <Text style={s.snapshotValue}>{formatEnergy(todaySnapshot.energyConsumed)}</Text>
              </View>
              <View
                style={s.snapshotStat}
                accessible
                accessibilityLabel={`Cost: ${formatCost(todaySnapshot.moneySaved, settings.currency)}`}
              >
                <Text style={s.snapshotLabel}>Cost</Text>
                <Text style={s.snapshotValue}>{formatCost(todaySnapshot.moneySaved, settings.currency)}</Text>
              </View>
              <View
                style={s.snapshotStat}
                accessible
                accessibilityLabel={spoken(`CO2: ${formatCO2(todaySnapshot.co2Avoided)}`)}
              >
                <Text style={s.snapshotLabel}>CO₂</Text>
                <Text style={s.snapshotValue}>{formatCO2(todaySnapshot.co2Avoided)}</Text>
              </View>
            </View>
            <Text style={s.topAction} accessibilityLabel={`Top saving action: ${todaySnapshot.topSavingAction}`}>
              🏆 {todaySnapshot.topSavingAction}
            </Text>
          </View>
        ) : (
          <AccessibleTouchable
            label="Generate today's snapshot"
            hint="Saves a summary of today's energy, cost and CO2"
            style={s.generateButton}
            onPress={handleGenerateSnapshot}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={s.generateButtonGradient}
            >
              <Text style={s.generateButtonText}>Generate Today's Snapshot</Text>
            </LinearGradient>
          </AccessibleTouchable>
        )}
      </View>

      {/* Savings certificates: a local, tamper-evident (SHA-256 hash-chained) ledger */}
      <View style={s.blockchainSection}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle} accessibilityRole="header">Savings Certificates</Text>
          <View style={s.networkBadge}>
            <Text style={s.networkBadgeText}>{chain.valid ? 'Chain verified' : 'Chain broken'}</Text>
          </View>
        </View>

        <View style={s.blockchainCard}>
          <Text style={s.blockchainTitle}>Certify your measured savings</Text>
          <Text style={s.blockchainSubtitle}>
            Each certificate covers measured days (logs and meter readings) since the last one. Certificates are
            linked by SHA-256 hashes on this device, so editing or removing one is detectable.
          </Text>

          <View style={s.blockchainStatsRow}>
            <View style={s.blockchainStat}>
              <Text style={s.blockchainStatLabel}>Ready</Text>
              <Text style={s.blockchainStatVal}>{formatEnergy(pendingCertificate?.kWhSaved ?? 0)}</Text>
            </View>
            <View style={s.blockchainStat}>
              <Text style={s.blockchainStatLabel}>Certified</Text>
              <Text style={s.blockchainStatVal}>{formatEnergy(certifiedKwh)}</Text>
            </View>
            <View style={s.blockchainStat}>
              <Text style={s.blockchainStatLabel}>CO₂ avoided</Text>
              <Text style={s.blockchainStatVal}>{formatCO2(certifiedCo2)}</Text>
            </View>
          </View>

          <AccessibleTouchable
            label="Issue savings certificate"
            hint="Certifies measured savings since your last certificate"
            style={s.mintBtn}
            disabled={isIssuing || !pendingCertificate}
            onPress={handleIssueCertificate}
          >
            <LinearGradient
              colors={pendingCertificate ? [colors.success, colors.primaryDark] : [colors.textMuted, colors.textMuted]}
              style={s.mintBtnGradient}
            >
              <Text style={s.mintBtnText}>
                {isIssuing
                  ? 'Issuing…'
                  : pendingCertificate
                    ? `🌱 Certify ${pendingCertificate.daysCounted} measured ${pendingCertificate.daysCounted === 1 ? 'day' : 'days'}`
                    : 'Log days below your usual use to certify'}
              </Text>
            </LinearGradient>
          </AccessibleTouchable>

          {certificates.length > 0 && (
            <View style={s.certificatesList}>
              <Text style={s.certificatesHeading}>Issued Certificates ({certificates.length})</Text>
              {certificates.slice(-3).reverse().map((c) => (
                <View key={c.id} style={s.certificateRow}>
                  <View style={s.certInfo}>
                    <Text style={s.certTitle}>
                      {formatEnergy(c.kWhSaved)} • {formatCO2(c.co2AvoidedKg)} • {format(parseISO(c.periodStart), 'd MMM')}–{format(parseISO(c.periodEnd), 'd MMM')}
                    </Text>
                    <Text style={s.certTx}>Hash: {c.hash.slice(0, 16)}…</Text>
                  </View>
                  <View style={s.certBadge}>
                    <Text style={s.certBadgeText}>{chain.valid ? 'VERIFIED' : 'CHECK'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Eco Goal Countdown Timers */}
      <View style={s.timerSection}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle} accessibilityRole="header">Goal Countdown</Text>
          <AccessibleTouchable
            label="Start goal countdown"
            hint="Starts a 24-hour countdown for your first goal"
            style={s.addTimerButton}
            onPress={handleStartGoalTimer}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={s.addTimerGradient}
            >
              <Text style={s.addTimerText}>+ Start</Text>
            </LinearGradient>
          </AccessibleTouchable>
        </View>

        {timerItems.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="⏱️"
            title="No active countdowns"
            body={
              goals.length === 0
                ? 'Create a goal first, then tap Start to count down to it.'
                : 'Tap Start to begin a 24-hour countdown toward your goal.'
            }
            style={s.noTimers}
          />
        ) : (
          timerItems.map(({ timer, progress, remainingValue }) => (
            <View key={timer.id} style={s.timerCard}>
              <Text style={s.timerTitle}>{timer.goalTitle}</Text>
              <View
                style={s.timerDisplay}
                accessible
                accessibilityLabel={`${timer.remainingHours} hours ${timer.remainingMinutes} minutes remaining`}
              >
                <View style={s.timeBox}>
                  <Text style={s.timeValue}>{timer.remainingHours}</Text>
                  <Text style={s.timeLabel}>Hours</Text>
                </View>
                <Text style={s.timeSeparator}>:</Text>
                <View style={s.timeBox}>
                  <Text style={s.timeValue}>{timer.remainingMinutes}</Text>
                  <Text style={s.timeLabel}>Minutes</Text>
                </View>
              </View>
              <Text style={s.timerGoal}>
                Goal: {timer.targetValue} {timer.unit}
              </Text>
              <View
                style={s.timerProgress}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`${timer.goalTitle} progress`}
                accessibilityValue={{ min: 0, max: 100, now: progress }}
              >
                <View style={[s.timerProgressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={s.timerHint}>
                Keep lights off for {timer.remainingHours}h {timer.remainingMinutes}m more to save {remainingValue} {timer.unit}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Recent Snapshots */}
      {recentSnapshots.length > 0 && (
        <View style={s.historySection}>
          <Text style={s.sectionTitle} accessibilityRole="header">Snapshot History</Text>
          {recentSnapshots.map(({ snapshot, date, energy, co2, label }) => (
            <View key={snapshot.id} style={s.historyItem} accessible accessibilityLabel={label}>
              <Text style={s.historyDate}>{date}</Text>
              <View style={s.historyStats}>
                <Text style={s.historyValue}>{energy}</Text>
                <Text style={s.historyValue}>{co2}</Text>
              </View>
              <Text style={s.historyStreak}>🔥 {snapshot.streakDays}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingTop: 54,
    paddingBottom: 28,
    paddingHorizontal: Spacing.page,
    alignItems: 'center',
  },
  headerLabel: {
    ...Typography.overline,
    color: c.primary,
    marginBottom: 4,
  },
  headerTitle: {
    ...Typography.displaySmall,
    color: c.textOnDark,
  },
  snapshotContainer: {
    backgroundColor: c.card,
  },
  impactSection: {
    padding: Spacing.page,
  },
  sectionTitle: {
    ...Typography.h3,
    color: c.text,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  impactCard: {
    backgroundColor: c.primarySoft,
    borderRadius: Radius.card,
    padding: Spacing.page,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.page,
  },
  impactItem: {
    alignItems: 'center',
  },
  impactIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  impactValue: {
    ...Typography.stat,
    color: c.primaryText,
    marginBottom: Spacing.xs,
  },
  impactLabel: {
    ...Typography.bodySmall,
    color: c.textSecondary,
  },
  streakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.warningSoft,
    padding: Spacing.md,
    borderRadius: Radius.sm,
  },
  streakIcon: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  streakText: {
    ...Typography.label,
    color: c.text,
  },
  videoSection: {
    padding: Spacing.page,
    paddingTop: 0,
  },
  videoCard: {
    // Elevated surface so the card stays distinct from the card-coloured capture area in dark mode
    backgroundColor: c.cardElevated,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  videoTitle: {
    ...Typography.h3,
    color: c.text,
    marginBottom: Spacing.sm,
  },
  treeAnimation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: Spacing.sm,
  },
  treeEmoji: {
    fontSize: 28,
    margin: Spacing.xs,
  },
  bulbAnimation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: Spacing.sm,
  },
  bulbEmoji: {
    fontSize: 28,
    margin: Spacing.xs,
  },
  videoDesc: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  snapshotSection: {
    padding: Spacing.page,
  },
  shareButton: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  shareButtonGradient: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  shareButtonText: {
    ...Typography.label,
    color: c.onPrimary,
  },
  snapshotCard: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: Spacing.page,
    ...Shadows.md,
  },
  snapshotDate: {
    ...Typography.bodyMedium,
    color: c.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  snapshotStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.lg,
  },
  snapshotStat: {
    alignItems: 'center',
  },
  snapshotLabel: {
    ...Typography.labelSmall,
    color: c.textSecondary,
    marginBottom: Spacing.xs,
  },
  snapshotValue: {
    ...Typography.statSmall,
    color: c.primaryText,
  },
  topAction: {
    ...Typography.label,
    color: c.text,
    textAlign: 'center',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  generateButton: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  generateButtonGradient: {
    padding: Spacing.lg,
    borderRadius: Radius.card,
    alignItems: 'center',
  },
  generateButtonText: {
    ...Typography.h3,
    color: c.onPrimary,
  },
  timerSection: {
    padding: Spacing.page,
  },
  addTimerButton: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  addTimerGradient: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  addTimerText: {
    ...Typography.label,
    color: c.onPrimary,
  },
  noTimers: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    ...Shadows.sm,
  },
  timerCard: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: Spacing.page,
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  timerTitle: {
    ...Typography.h3,
    color: c.text,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  timerDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  timeBox: {
    backgroundColor: c.primarySoft,
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    minWidth: 80,
    alignItems: 'center',
  },
  timeValue: {
    ...Typography.displayMedium,
    color: c.primaryText,
  },
  timeLabel: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    marginTop: Spacing.xs,
  },
  timeSeparator: {
    ...Typography.displayMedium,
    color: c.primaryText,
    marginHorizontal: Spacing.sm,
  },
  timerGoal: {
    ...Typography.bodyMedium,
    color: c.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  timerProgress: {
    height: 8,
    backgroundColor: c.border,
    borderRadius: Spacing.xs,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  timerProgressFill: {
    height: '100%',
    backgroundColor: c.primary,
    borderRadius: Spacing.xs,
  },
  timerHint: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  historySection: {
    padding: Spacing.page,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    padding: Spacing.lg,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  historyDate: {
    ...Typography.label,
    color: c.text,
    width: 60,
  },
  historyStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  historyValue: {
    ...Typography.bodySmall,
    color: c.textSecondary,
  },
  historyStreak: {
    fontSize: 14,
    color: c.text,
  },
  blockchainSection: {
    padding: Spacing.page,
  },
  networkBadge: {
    backgroundColor: '#8B5CF620',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: '#8B5CF650',
  },
  networkBadgeText: {
    ...Typography.overline,
    color: '#8B5CF6',
    fontWeight: '700',
  },
  blockchainCard: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  blockchainTitle: {
    ...Typography.h3,
    color: c.text,
    marginBottom: 4,
  },
  blockchainSubtitle: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    marginBottom: Spacing.md,
  },
  blockchainStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: c.background,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  blockchainStat: {
    alignItems: 'center',
  },
  blockchainStatLabel: {
    ...Typography.overline,
    color: c.textMuted,
    marginBottom: 2,
  },
  blockchainStatVal: {
    ...Typography.h3,
    color: '#10B981',
  },
  mintBtn: {
    borderRadius: Radius.card,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  mintBtnGradient: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.card,
  },
  mintBtnText: {
    ...Typography.label,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  certificatesList: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.borderLight,
    paddingTop: Spacing.md,
  },
  certificatesHeading: {
    ...Typography.label,
    color: c.text,
    marginBottom: Spacing.sm,
  },
  certificateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.borderLight,
  },
  certInfo: {
    flex: 1,
  },
  certTitle: {
    ...Typography.bodyMedium,
    color: c.text,
    fontWeight: '600',
  },
  certTx: {
    ...Typography.bodySmall,
    color: c.textMuted,
  },
  certBadge: {
    backgroundColor: '#10B98120',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  certBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
});

export default ImpactVisualizerScreen;
