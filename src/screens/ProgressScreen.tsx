import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { format, addDays } from 'date-fns';
import { formatCO2, formatCost, formatEnergy } from '../utils/energy';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { levelFor, LEVELS } from '../utils/gamification';

type GoalType = 'consumption' | 'cost' | 'co2';
type GoalLevelTier = 1 | 2 | 3;

const GOAL_TYPES: GoalType[] = ['consumption', 'cost', 'co2'];

// `spoken` replaces the subscript in CO₂ so screen readers say "C O 2".
const GOAL_TYPE_META: Record<GoalType, { icon: string; label: string; spoken: string }> = {
  consumption: { icon: '⚡', label: 'Energy', spoken: 'Energy' },
  cost: { icon: '💰', label: 'Cost', spoken: 'Cost' },
  co2: { icon: '🌍', label: 'CO₂', spoken: 'CO2' },
};

const GOAL_TIERS: { tier: GoalLevelTier; label: string; reductionPct: number; xp: number }[] = [
  { tier: 1, label: 'L1: Novice (-10%)', reductionPct: 10, xp: 30 },
  { tier: 2, label: 'L2: Saver (-20%)', reductionPct: 20, xp: 60 },
  { tier: 3, label: 'L3: Hero (-30%)', reductionPct: 30, xp: 100 },
];

const ProgressScreen = () => {
  const { streak, badges, goals, dashboardData, addGoal, deleteGoal, settings, points, awardPoints } = useEnergy(
    'streak',
    'badges',
    'goals',
    'dashboardData',
    'addGoal',
    'deleteGoal',
    'settings',
    'points',
    'awardPoints',
  );
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('consumption');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDays, setGoalDays] = useState('30');
  const [selectedTier, setSelectedTier] = useState<GoalLevelTier>(1);
  const currency = settings.currency;

  const totalPoints = typeof points === 'number' ? points : (points?.total || 0);
  const userLevel = useMemo(() => levelFor(totalPoints), [totalPoints]);
  const ctaGradient = useMemo(() => [colors.primary, colors.primaryDark], [colors]);

  const goalItems = useMemo(() => goals.map((goal) => {
    const pct = goal.target > 0 ? (goal.currentValue / goal.target) * 100 : 0;
    const formatValue = (v: number) => goal.type === 'consumption'
      ? formatEnergy(v)
      : goal.type === 'cost'
        ? formatCost(v, currency)
        : formatCO2(v);
    const meta = GOAL_TYPE_META[goal.type];
    const value = formatValue(goal.currentValue);
    const targetValue = formatValue(goal.target);
    const due = format(new Date(goal.deadline), 'MMM dd');
    return {
      goal,
      meta,
      pct,
      value,
      targetValue,
      due,
      summaryLabel: `${meta.spoken} goal${goal.isAchieved ? ', achieved' : ''}. Monthly limit: ${targetValue}`,
      footerLabel: `${value} used, due ${due}`,
    };
  }), [goals, currency]);

  const statRows = useMemo(() => (dashboardData ? [
    { icon: '⚡', l: 'Total Energy', v: `${dashboardData.totalEnergyConsumed.toFixed(2)} kWh` },
    { icon: '💰', l: 'Total Cost', v: formatCost(dashboardData.totalCost, currency) },
    { icon: '🌍', l: 'CO₂ Generated', spoken: 'CO2 Generated', v: `${dashboardData.totalCO2Saved.toFixed(2)} kg` },
    { icon: '🌳', l: 'Trees Equivalent', v: `${dashboardData.treesEquivalent.toFixed(1)}` },
  ] : []), [dashboardData, currency]);

  const getTierTarget = useCallback((tier: GoalLevelTier) => {
    if (!dashboardData) return goalType === 'cost' ? 25 : 50;
    const current = goalType === 'consumption'
      ? dashboardData.totalEnergyConsumed
      : goalType === 'cost'
        ? dashboardData.totalCost
        : dashboardData.totalCO2Saved;
    const factor = tier === 1 ? 0.9 : tier === 2 ? 0.8 : 0.7;
    return Math.max(0.1, current * factor);
  }, [dashboardData, goalType]);

  const openGoalModal = useCallback(() => {
    setShowGoalModal(true);
    const targetVal = getTierTarget(selectedTier);
    setGoalTarget(targetVal.toFixed(1));
  }, [getTierTarget, selectedTier]);

  const closeGoalModal = useCallback(() => setShowGoalModal(false), []);

  const handleCreateGoal = async () => {
    const target = Number.parseFloat(goalTarget);
    const duration = Number.parseInt(goalDays, 10);
    if (!Number.isFinite(target) || target <= 0) {
      Alert.alert('Check your target', 'Enter a monthly limit greater than zero.');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      Alert.alert('Check the duration', 'Enter a whole number of at least one day.');
      return;
    }
    await addGoal({
      type: goalType, target,
      deadline: addDays(new Date(), duration).toISOString(),
    });
    if (awardPoints) {
      const tierXp = GOAL_TIERS.find(t => t.tier === selectedTier)?.xp || 30;
      await awardPoints(`goal-create-${Date.now()}`, 15, `Set ${GOAL_TIERS.find(t => t.tier === selectedTier)?.label} goal`);
    }
    setShowGoalModal(false); setGoalTarget(''); setGoalDays('30');
    Alert.alert('Goal Created!', 'Track your progress and earn XP milestones below.');
  };

  const confirmDeleteGoal = useCallback((id: string, type: GoalType) => {
    Alert.alert('Delete Goal', `Remove this ${type} goal?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(id) },
    ]);
  }, [deleteGoal]);

  const unit = goalType === 'consumption' ? 'kWh' : goalType === 'cost' ? currency : 'kg';
  const keyboardAppearance = isDark ? 'dark' : 'light';
  const lastActivity = streak.lastActivityDate
    ? format(new Date(streak.lastActivityDate), 'MMM dd, yyyy')
    : null;

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>YOUR JOURNEY</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Progress & Levels</Text>
      </LinearGradient>

      {/* Level Progression Hero */}
      <View style={s.levelCard}>
        <View style={s.levelHeaderRow}>
          <View style={s.levelBadge}>
            <Text style={s.levelBadgeIcon}>{userLevel.level >= 5 ? '👑' : userLevel.level >= 3 ? '⚡' : '🌱'}</Text>
            <Text style={s.levelBadgeNumber}>L{userLevel.level}</Text>
          </View>
          <View style={s.levelInfoCol}>
            <Text style={s.levelNameText}>{userLevel.name}</Text>
            <Text style={s.levelPointsSub}>{totalPoints} total XP · {userLevel.next ? `${userLevel.next - totalPoints} XP to next level` : 'Max tier'}</Text>
          </View>
          <View style={s.levelRankPill}>
            <Text style={s.levelRankText}>Tier {userLevel.level}</Text>
          </View>
        </View>

        <View style={s.levelProgressWrapper}>
          <View style={s.levelProgressBg}>
            <View style={[s.levelProgressFill, { width: `${Math.round(userLevel.progress * 100)}%` }]} />
          </View>
          <View style={s.levelMilestoneRow}>
            <Text style={s.levelMilestoneTxt}>
              {userLevel.next
                ? `Level ${userLevel.level + 1}: ${LEVELS[userLevel.level]?.name || 'Next'}`
                : 'Volt Legend 🏆'}
            </Text>
            <Text style={s.levelPctTxt}>{Math.round(userLevel.progress * 100)}%</Text>
          </View>
        </View>
      </View>

      {/* Streak Hero */}
      <View style={s.streakCard}>
        <View
          style={s.streakMain}
          accessible
          accessibilityLabel={`Current streak: ${streak.currentStreak} ${streak.currentStreak === 1 ? 'day' : 'days'}`}
        >
          <Text style={s.streakNum}>{streak.currentStreak}</Text>
          <Text style={s.streakUnit}>day streak</Text>
        </View>
        <View style={s.streakRow}>
          <View style={s.streakStat} accessible accessibilityLabel={`Best streak: ${streak.longestStreak} days`}>
            <Text style={s.streakStatVal}>{streak.longestStreak}</Text>
            <Text style={s.streakStatLbl}>Best</Text>
          </View>
          <View style={s.streakDivider} />
          <View style={s.streakStat} accessible accessibilityLabel={`Total days active: ${streak.totalDaysActive}`}>
            <Text style={s.streakStatVal}>{streak.totalDaysActive}</Text>
            <Text style={s.streakStatLbl}>Total Days</Text>
          </View>
        </View>
        {lastActivity && (
          <Text style={s.lastAct}>Last activity: {lastActivity}</Text>
        )}
      </View>

      {/* Goals */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, s.sectionTitleInline]} accessibilityRole="header">Goals</Text>
          <AccessibleTouchable
            label="New goal"
            hint="Opens the form to create a monthly goal"
            style={s.addBtnTarget}
            onPress={openGoalModal}
          >
            <View style={s.addBtn}>
              <Text style={s.addBtnTxt}>+ New</Text>
            </View>
          </AccessibleTouchable>
        </View>
        <Text style={s.sectionCaption}>Goals are monthly limits. Progress updates as your energy profile changes.</Text>
        {goalItems.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="🎯"
            title="No goals set"
            body="Set a monthly energy, cost, or CO₂ limit and your progress will update as your energy profile changes."
            primaryAction={{
              label: 'Create a goal',
              hint: 'Opens the form to create a monthly goal',
              onPress: openGoalModal,
            }}
            style={s.emptyCard}
          />
        ) : goalItems.map(({ goal, meta, pct, value, targetValue, due, summaryLabel, footerLabel }) => (
          <View key={goal.id} style={s.goalCard}>
            <View accessible accessibilityLabel={summaryLabel}>
              <View style={s.goalTop}>
                <Text style={s.goalType}>{meta.icon} {meta.label}</Text>
                {goal.isAchieved && <View style={s.achievedBadge}><Text style={s.achievedTxt}>ACHIEVED</Text></View>}
              </View>
              <Text style={s.goalTargetTxt}>Monthly limit: {targetValue}</Text>
            </View>
            <View
              style={s.progressBg}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${meta.spoken} goal: share of monthly limit used`}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(pct, 100)) }}
            >
              <View style={[s.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
            </View>
            <View style={s.goalFooter} accessible accessibilityLabel={footerLabel}>
              <Text style={s.goalPct}>{value} used</Text>
              <Text style={s.goalDeadline}>Due {due}</Text>
            </View>
            <AccessibleTouchable
              label={`Remove ${meta.spoken} goal`}
              hint="Asks for confirmation before deleting"
              style={s.goalDel}
              onPress={() => confirmDeleteGoal(goal.id, goal.type)}
            >
              <Text style={s.goalDelTxt}>Remove</Text>
            </AccessibleTouchable>
          </View>
        ))}
      </View>

      {/* Badges */}
      <View style={s.section}>
        <Text style={s.sectionTitle} accessibilityRole="header">Badges</Text>
        {badges.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="🏅"
            title="No badges to show"
            body="Badges appear here as you add appliances and keep your daily streak going."
            style={s.emptyCard}
          />
        ) : (
          <View style={s.badgeGrid}>
            {badges.map((badge) => {
              const earnedOn = badge.isEarned && badge.earnedAt ? format(new Date(badge.earnedAt), 'MMM dd') : null;
              return (
                <View
                  key={badge.id}
                  style={[s.badgeCard, !badge.isEarned && s.badgeLocked]}
                  accessible
                  accessibilityLabel={`Badge: ${badge.name}, ${badge.isEarned ? `earned${earnedOn ? ` ${earnedOn}` : ''}` : 'not yet earned'}`}
                  accessibilityHint={badge.description}
                >
                  <Text style={[s.badgeIcon, !badge.isEarned && s.badgeIconLocked]}>{badge.icon}</Text>
                  <Text style={[s.badgeName, !badge.isEarned && s.badgeNameLocked]}>{badge.name}</Text>
                  <Text style={[s.badgeDesc, !badge.isEarned && s.badgeDescLocked]}>{badge.description}</Text>
                  {earnedOn && (
                    <Text style={s.badgeDate}>Earned {earnedOn}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={[s.section, s.statsSection]}>
        <Text style={s.sectionTitle} accessibilityRole="header">Overall Stats</Text>
        {statRows.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="📊"
            title="No stats yet"
            body="Add appliances in the Track tab to see your total energy, cost, CO₂ and tree equivalent here."
            style={s.emptyCard}
          />
        ) : (
          <View style={s.statsCard}>
            {statRows.map((st, i) => (
              <View
                key={st.l}
                style={[s.statRow, i < statRows.length - 1 && s.statRowBorder]}
                accessible
                accessibilityLabel={`${st.spoken ?? st.l}: ${st.v}`}
              >
                <Text style={s.statIcon}>{st.icon}</Text>
                <Text style={s.statLabel}>{st.l}</Text>
                <Text style={s.statVal}>{st.v}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Goal Modal */}
      <Modal visible={showGoalModal} animationType="slide" transparent onRequestClose={closeGoalModal}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent} accessibilityViewIsModal>
            <Text style={s.modalTitle} accessibilityRole="header">Create Goal</Text>
            <Text style={s.modalLabel}>Type</Text>
            <View style={s.typeRow} accessibilityRole="radiogroup" accessibilityLabel="Goal type">
              {GOAL_TYPES.map((t) => {
                const selected = goalType === t;
                return (
                  <AccessibleTouchable
                    key={t}
                    role="radio"
                    label={GOAL_TYPE_META[t].spoken}
                    accessibilityState={{ checked: selected }}
                    style={[s.typeBtn, selected && s.typeBtnActive]}
                    onPress={() => setGoalType(t)}
                  >
                    <Text style={[s.typeBtnTxt, selected && s.typeBtnTxtActive]}>
                      {GOAL_TYPE_META[t].label}
                    </Text>
                  </AccessibleTouchable>
                );
              })}
            </View>
            <Text style={s.modalLabel}>Difficulty & XP Tier</Text>
            <View style={s.tierRow}>
              {GOAL_TIERS.map((t) => {
                const active = selectedTier === t.tier;
                return (
                  <AccessibleTouchable
                    key={t.tier}
                    label={`${t.label}, earns ${t.xp} XP`}
                    style={[s.tierBtn, active && s.tierBtnActive]}
                    onPress={() => {
                      setSelectedTier(t.tier);
                      const targetVal = getTierTarget(t.tier);
                      setGoalTarget(targetVal.toFixed(1));
                    }}
                  >
                    <Text style={[s.tierBtnText, active && s.tierBtnTextActive]}>{t.label}</Text>
                    <Text style={[s.tierXpText, active && s.tierXpTextActive]}>+{t.xp} XP</Text>
                  </AccessibleTouchable>
                );
              })}
            </View>

            <Text style={s.modalLabel}>Target ({unit})</Text>
            <TextInput style={s.modalInput} value={goalTarget} onChangeText={setGoalTarget}
              keyboardType="decimal-pad" placeholder="e.g., 50" placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance} accessibilityLabel={`Target (${unit})`} />
            <Text style={s.modalLabel}>Duration (days)</Text>
            <TextInput style={s.modalInput} value={goalDays} onChangeText={setGoalDays}
              keyboardType="number-pad" placeholder="30" placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance} accessibilityLabel="Duration (days)" />
            <View style={s.modalBtns}>
              <AccessibleTouchable label="Cancel" hint="Closes the form without creating a goal" style={s.cancelBtn} onPress={closeGoalModal}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </AccessibleTouchable>
              <AccessibleTouchable label="Create goal" onPress={handleCreateGoal}>
                <LinearGradient colors={ctaGradient} style={s.createBtn}>
                  <Text style={s.createTxt}>Create</Text>
                </LinearGradient>
              </AccessibleTouchable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => {

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center' },
    headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
    headerTitle: { ...Typography.displaySmall, color: c.textOnDark },

    /* Level Progression Card */
    levelCard: {
      marginHorizontal: Spacing.page,
      marginTop: -16,
      marginBottom: 12,
      backgroundColor: c.card,
      borderRadius: Radius.xl,
      padding: Spacing.lg,
      borderWidth: 1.5,
      borderColor: c.primary,
      ...Shadows.md,
    },
    levelHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    levelBadge: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    levelBadgeIcon: {
      fontSize: 18,
    },
    levelBadgeNumber: {
      ...Typography.labelSmall,
      color: c.primaryText,
      fontWeight: '800',
      fontSize: 10,
      marginTop: -2,
    },
    levelInfoCol: {
      flex: 1,
    },
    levelNameText: {
      ...Typography.h3,
      color: c.text,
    },
    levelPointsSub: {
      ...Typography.bodySmall,
      color: c.textSecondary,
      marginTop: 2,
    },
    levelRankPill: {
      backgroundColor: c.primary,
      borderRadius: Radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    levelRankText: {
      ...Typography.labelSmall,
      color: c.onPrimary,
      fontWeight: '700',
    },
    levelProgressWrapper: {
      marginTop: 14,
    },
    levelProgressBg: {
      height: 7,
      backgroundColor: c.borderLight,
      borderRadius: 4,
      overflow: 'hidden',
    },
    levelProgressFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 4,
    },
    levelMilestoneRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    levelMilestoneTxt: {
      ...Typography.labelSmall,
      color: c.textSecondary,
    },
    levelPctTxt: {
      ...Typography.labelSmall,
      color: c.primaryText,
      fontWeight: '700',
    },

    streakCard: { marginHorizontal: Spacing.page, marginTop: 4, backgroundColor: c.card, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', ...Shadows.lg },
    streakMain: { alignItems: 'center', marginBottom: 16 },
    streakNum: { ...Typography.displayLarge, color: c.primaryText, fontSize: 56 },
    streakUnit: { ...Typography.label, color: c.textSecondary },
    streakRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', paddingTop: 16, borderTopWidth: 1, borderTopColor: c.divider },
    streakStat: { alignItems: 'center' },
    streakStatVal: { ...Typography.stat, color: c.text },
    streakStatLbl: { ...Typography.labelSmall, color: c.textSecondary, marginTop: 2 },
    streakDivider: { width: 1, height: 32, backgroundColor: c.divider },
    lastAct: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 12 },

    section: { paddingHorizontal: Spacing.page, marginTop: Spacing.section },
    statsSection: { marginBottom: 30 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { ...Typography.h2, color: c.text, marginBottom: 14 },
    sectionTitleInline: { marginBottom: 0 },
    sectionCaption: { ...Typography.bodySmall, color: c.textSecondary, lineHeight: 18, marginTop: -8, marginBottom: 12 },
    addBtnTarget: { alignItems: 'flex-end' },
    addBtn: { backgroundColor: c.primary, borderRadius: Radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
    addBtnTxt: { ...Typography.labelSmall, color: c.onPrimary },

    emptyCard: { backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.sm },

    goalCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.lg, marginBottom: 12, ...Shadows.sm },
    goalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    goalType: { ...Typography.h3, color: c.text },
    achievedBadge: { backgroundColor: c.primary, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    achievedTxt: { ...Typography.overline, color: c.onPrimary, fontSize: 9 },
    goalTargetTxt: { ...Typography.bodySmall, color: c.textSecondary, marginBottom: 10 },
    progressBg: { height: 8, backgroundColor: c.border, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 4 },
    goalFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    goalPct: { ...Typography.label, color: c.primaryText },
    goalDeadline: { ...Typography.bodySmall, color: c.textSecondary },
    goalDel: { marginTop: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: c.dangerSoft, borderRadius: Radius.sm },
    goalDelTxt: { ...Typography.labelSmall, color: c.dangerText },

    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    badgeCard: { width: '47%', backgroundColor: c.card, borderRadius: Radius.card, padding: 16, alignItems: 'center', ...Shadows.sm },
    badgeLocked: { opacity: 0.6 },
    badgeIcon: { fontSize: 40, marginBottom: 8 },
    badgeIconLocked: { opacity: 0.3 },
    badgeName: { ...Typography.label, color: c.text, textAlign: 'center', marginBottom: 4 },
    badgeNameLocked: { color: c.textSecondary },
    badgeDesc: { ...Typography.bodySmall, color: c.textSecondary, textAlign: 'center' },
    badgeDescLocked: { color: c.textMuted },
    badgeDate: { ...Typography.labelSmall, color: c.primaryText, marginTop: 6 },

    statsCard: { backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.md, overflow: 'hidden' },
    statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
    statRowBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
    statIcon: { fontSize: 20, marginRight: 12 },
    statLabel: { flex: 1, ...Typography.bodyMedium, color: c.textSecondary },
    statVal: { ...Typography.statSmall, color: c.primaryText },

    modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: c.card, borderRadius: Radius.xl, padding: 24, width: '88%', maxWidth: 400 },
    modalTitle: { ...Typography.h1, color: c.text, textAlign: 'center', marginBottom: 20 },
    modalLabel: { ...Typography.label, color: c.textSecondary, marginTop: 14, marginBottom: 6 },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' },
    typeBtnActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    typeBtnTxt: { ...Typography.label, color: c.textSecondary },
    typeBtnTxtActive: { color: c.text, fontWeight: '700' },
    tierRow: { flexDirection: 'column', gap: 6 },
    tierBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: c.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tierBtnActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    tierBtnText: { ...Typography.bodySmall, color: c.text },
    tierBtnTextActive: { color: c.primaryText, fontWeight: '700' },
    tierXpText: { ...Typography.labelSmall, color: c.textSecondary },
    tierXpTextActive: { color: c.primaryText, fontWeight: '800' },
    modalInput: { backgroundColor: c.inputBg, borderRadius: Radius.sm, padding: 14, ...Typography.bodyLarge, color: c.text, borderWidth: 1, borderColor: c.border },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.sm, backgroundColor: c.inputBg, alignItems: 'center' },
    cancelTxt: { ...Typography.label, color: c.text },
    createBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center', minWidth: 130 },
    createTxt: { ...Typography.label, color: c.onPrimary },
  });
};

export default ProgressScreen;
