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

type GoalType = 'consumption' | 'cost' | 'co2';

const GOAL_TYPES: GoalType[] = ['consumption', 'cost', 'co2'];

// `spoken` replaces the subscript in CO₂ so screen readers say "C O 2".
const GOAL_TYPE_META: Record<GoalType, { icon: string; label: string; spoken: string }> = {
  consumption: { icon: '⚡', label: 'Energy', spoken: 'Energy' },
  cost: { icon: '💰', label: 'Cost', spoken: 'Cost' },
  co2: { icon: '🌍', label: 'CO₂', spoken: 'CO2' },
};

const ProgressScreen = () => {
  const { streak, badges, goals, dashboardData, addGoal, deleteGoal, settings } = useEnergy(
    'streak',
    'badges',
    'goals',
    'dashboardData',
    'addGoal',
    'deleteGoal',
    'settings',
  );
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('consumption');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDays, setGoalDays] = useState('30');
  const currency = settings.currency;

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

  const suggestedTarget = useMemo(() => {
    if (!dashboardData) return goalType === 'cost' ? 25 : 50;
    const current = goalType === 'consumption'
      ? dashboardData.totalEnergyConsumed
      : goalType === 'cost'
        ? dashboardData.totalCost
        : dashboardData.totalCO2Saved;
    return Math.max(0.1, current * 0.9);
  }, [dashboardData, goalType]);

  const openGoalModal = useCallback(() => setShowGoalModal(true), []);
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
    setShowGoalModal(false); setGoalTarget(''); setGoalDays('30');
    Alert.alert('Goal Created!', 'Track your progress below.');
  };

  const confirmDeleteGoal = useCallback((id: string, type: GoalType) => {
    Alert.alert('Delete Goal', `Remove this ${type} goal?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(id) },
    ]);
  }, [deleteGoal]);

  const applySuggestedTarget = () => setGoalTarget(suggestedTarget.toFixed(1));

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
        <Text style={s.headerTitle} accessibilityRole="header">Progress</Text>
      </LinearGradient>

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
            <Text style={s.modalLabel}>Target ({unit})</Text>
            <TextInput style={s.modalInput} value={goalTarget} onChangeText={setGoalTarget}
              keyboardType="decimal-pad" placeholder="e.g., 50" placeholderTextColor={colors.textMuted}
              keyboardAppearance={keyboardAppearance} accessibilityLabel={`Target (${unit})`} />
            <AccessibleTouchable
              label={`Use a 10% reduction target: ${suggestedTarget.toFixed(1)}`}
              hint="Fills in the target field"
              style={s.suggestionButton}
              onPress={applySuggestedTarget}
            >
              <Text style={s.suggestionText}>Use a 10% reduction target: {suggestedTarget.toFixed(1)}</Text>
            </AccessibleTouchable>
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

    streakCard: { marginHorizontal: Spacing.page, marginTop: -10, backgroundColor: c.card, borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', ...Shadows.lg },
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
    // 44pt touch target around the compact pill
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
    modalInput: { backgroundColor: c.inputBg, borderRadius: Radius.sm, padding: 14, ...Typography.bodyLarge, color: c.text, borderWidth: 1, borderColor: c.border },
    suggestionButton: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
    suggestionText: { ...Typography.labelSmall, color: c.primaryText },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.sm, backgroundColor: c.inputBg, alignItems: 'center' },
    cancelTxt: { ...Typography.label, color: c.text },
    createBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center', minWidth: 130 },
    createTxt: { ...Typography.label, color: c.onPrimary },
  });
};

export default ProgressScreen;
