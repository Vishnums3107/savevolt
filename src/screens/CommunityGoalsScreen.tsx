import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Share,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { formatEnergy } from '../utils/energy';
import { Button, Sheet, TextField, toast } from '../components/ui';
import { CommunityGoal } from '../types';

const DAY_MS = 1000 * 60 * 60 * 24;
const VISIBLE_PARTICIPANTS = 5;

const CommunityGoalsScreen = () => {
  const {
    communityGoals, addCommunityGoal, addContribution, deleteCommunityGoal, importShareCode,
    getGoalInviteCode, getContributionCode, settings,
  } = useEnergy(
    'communityGoals', 'addCommunityGoal', 'addContribution', 'deleteCommunityGoal', 'importShareCode',
    'getGoalInviteCode', 'getContributionCode', 'settings',
  );
  const me = settings.displayName?.trim() || 'You';
  const [actionGoal, setActionGoal] = useState<CommunityGoal | null>(null);
  const [manualKwh, setManualKwh] = useState('');
  const [manualWho, setManualWho] = useState('');
  const [code, setCode] = useState('');
  const [importing, setImporting] = useState(false);
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetEnergy, setTargetEnergy] = useState('');
  const [participants, setParticipants] = useState('');

  const ctaGradient = useMemo(() => [colors.primary, colors.primaryDark], [colors]);

  const goalItems = useMemo(() => {
    const now = Date.now();
    return communityGoals.map((goal) => {
      const progress = goal.targetEnergy > 0 ? (goal.currentEnergy / goal.targetEnergy) * 100 : 0;
      const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - now) / DAY_MS);
      const shown = goal.participants.slice(0, VISIBLE_PARTICIPANTS);
      const hidden = goal.participants.length - shown.length;
      const participantSummary = goal.participants.length === 0
        ? 'No participants'
        : `${goal.participants.length} participants: ${shown.join(', ')}${hidden > 0 ? `, and ${hidden} more` : ''}`;
      return {
        goal,
        progress,
        daysLeft,
        deadlineText: daysLeft > 0 ? `${daysLeft} days left` : 'Expired',
        participantSummary,
        progressLabel: `Progress: ${formatEnergy(goal.currentEnergy)} of ${formatEnergy(goal.targetEnergy)} saved`,
      };
    });
  }, [communityGoals]);

  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => setShowModal(false), []);

  const handleCreateGoal = async () => {
    const target = Number.parseFloat(targetEnergy.replace(',', '.'));
    if (!title.trim() || !Number.isFinite(target) || target <= 0) {
      Alert.alert('Check your goal', 'Enter a name and a kWh target greater than zero.');
      return;
    }

    const participantsList = participants
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    try {
      await addCommunityGoal({
        title: title.trim(),
        description: description.trim(),
        targetEnergy: target,
        participants: [me, ...participantsList.filter((p) => p !== me)],
        deadline: new Date(Date.now() + 30 * DAY_MS).toISOString(), // 30 days from now
        createdBy: me,
        me,
      });
    } catch (error) {
      Alert.alert('Check your goal', error instanceof Error ? error.message : 'Could not create the goal.');
      return;
    }

    setShowModal(false);
    setTitle('');
    setDescription('');
    setTargetEnergy('');
    setParticipants('');

    toast.success('Shared goal created. Tap Contribute to invite people.');
  };

  const openActions = useCallback((goal: CommunityGoal) => {
    setManualKwh('');
    setManualWho(goal.me || me);
    setActionGoal(goal);
  }, [me]);

  const shareInvite = async (goal: CommunityGoal) => {
    try {
      const invite = getGoalInviteCode(goal.id);
      await Share.share({
        message: `Join my SaveVolt goal "${goal.title}" (save ${formatEnergy(goal.targetEnergy)} together). In SaveVolt open Goals, Shared goal planner, Import code and paste:\n\n${invite}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share the invite.');
    }
  };

  const shareUpdate = async (goal: CommunityGoal) => {
    try {
      const update = getContributionCode(goal.id);
      await Share.share({
        message: `My SaveVolt savings for "${goal.title}". Paste this code in Goals, Shared goal planner, Import code:\n\n${update}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share your update.');
    }
  };

  const saveManual = async () => {
    if (!actionGoal) return;
    const kWh = Number.parseFloat(manualKwh.replace(',', '.'));
    try {
      await addContribution(actionGoal.id, { participant: manualWho, kWh });
      toast.success(`Added ${formatEnergy(kWh)} for ${manualWho.trim()}.`);
      setActionGoal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the saving.');
    }
  };

  const confirmDelete = (goal: CommunityGoal) => {
    Alert.alert('Delete goal?', `Remove "${goal.title}" and its contributions from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { setActionGoal(null); deleteCommunityGoal(goal.id); } },
    ]);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const result = await importShareCode(code);
      setCode('');
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import that code.');
    } finally {
      setImporting(false);
    }
  };

  const keyboardAppearance = isDark ? 'dark' : 'light';

  return (
    <View style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>SHARED PLANNING</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Shared Goal Planner</Text>
      </LinearGradient>

      <View style={s.localNotice}>
        <Text style={s.localNoticeText}>
          Your logged savings count automatically. To team up, share an invite code from a goal; teammates send back update codes that you paste here.
        </Text>
        <View style={s.importRow}>
          <TextField
            label="Import a SaveVolt code"
            placeholder="Paste an invite, update or score code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.importField}
          />
          <Button label="Import" size="sm" onPress={runImport} loading={importing} disabled={!code.trim()} />
        </View>
      </View>

      <ScrollView style={s.content} contentContainerStyle={s.contentContainer}>
        {goalItems.length === 0 ? (
          <EmptyState
            variant="inline"
            icon="🌍"
            title="No Community Goals Yet"
            body="Create a shared goal, list who is taking part, and record each contribution locally as you save energy together."
            primaryAction={{
              label: 'Create a shared goal',
              hint: 'Opens the new community goal form',
              onPress: openModal,
            }}
          />
        ) : (
          goalItems.map(({ goal, progress, daysLeft, deadlineText, participantSummary, progressLabel }) => (
            <View key={goal.id} style={s.goalCard}>
              <View style={s.goalHeader}>
                <View style={s.goalTitleContainer}>
                  <Text style={s.goalTitle} accessibilityRole="header">{goal.title}</Text>
                  {goal.isAchieved && (
                    <View style={s.achievedBadge}>
                      <Text style={s.achievedText}>Achieved!</Text>
                    </View>
                  )}
                </View>
                <Text style={s.creator}>by {goal.createdBy}</Text>
              </View>

              {goal.description ? (
                <Text style={s.goalDescription}>{goal.description}</Text>
              ) : null}

              <View
                style={s.targetInfo}
                accessible
                accessibilityLabel={`Target: ${formatEnergy(goal.targetEnergy)} to save`}
              >
                <Text style={s.targetLabel}>Target:</Text>
                <Text style={s.targetValue}>
                  {formatEnergy(goal.targetEnergy)} to save
                </Text>
              </View>

              <View
                style={s.progressSection}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={progressLabel}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(progress, 100)) }}
              >
                <View style={s.progressInfo}>
                  <Text style={s.progressLabel}>Progress</Text>
                  <Text style={s.progressValue}>
                    {formatEnergy(goal.currentEnergy)} / {formatEnergy(goal.targetEnergy)}
                  </Text>
                </View>
                <View style={s.progressBar}>
                  <View
                    style={[
                      s.progressFill,
                      goal.isAchieved && s.progressFillAchieved,
                      { width: `${Math.min(progress, 100)}%` },
                    ]}
                  />
                </View>
                <Text style={s.progressPercentage}>{progress.toFixed(0)}%</Text>
              </View>

              {(goal.contributions ?? []).length > 0 ? (
                <View style={s.participantsSection}>
                  {Object.entries((goal.contributions ?? []).reduce<Record<string, number>>((acc, c) => {
                    acc[c.participant] = (acc[c.participant] ?? 0) + c.kWh;
                    return acc;
                  }, {})).sort((a, b) => b[1] - a[1]).map(([name, kWh]) => (
                    <Text key={name} style={s.goalDescription}>
                      {name}: {formatEnergy(kWh)}{name === (goal.me || me) ? ' (from your logs and entries)' : ''}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={s.participantsSection} accessible accessibilityLabel={participantSummary}>
                <Text style={s.participantsLabel}>
                  👥 {goal.participants.length} Participants
                </Text>
                <View style={s.participantsList}>
                  {goal.participants.slice(0, VISIBLE_PARTICIPANTS).map((participant, index) => (
                    <View key={index} style={s.participantChip}>
                      <Text style={s.participantName}>{participant}</Text>
                    </View>
                  ))}
                  {goal.participants.length > VISIBLE_PARTICIPANTS && (
                    <View style={s.participantChip}>
                      <Text style={s.participantName}>
                        +{goal.participants.length - VISIBLE_PARTICIPANTS} more
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={s.goalFooter}>
                <Text
                  style={[s.deadline, daysLeft < 7 && s.deadlineUrgent]}
                  accessibilityLabel={deadlineText}
                >
                  ⏰ {deadlineText}
                </Text>
                {!goal.isAchieved && (
                  <AccessibleTouchable
                    label={`Contribute to ${goal.title}`}
                    hint="Invite people, send your update or add a saving"
                    onPress={() => openActions(goal)}
                  >
                    <LinearGradient colors={ctaGradient} style={s.contributeButton}>
                      <Text style={s.contributeButtonText}>+ Contribute</Text>
                    </LinearGradient>
                  </AccessibleTouchable>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <AccessibleTouchable
        label="Create goal"
        hint="Opens the new community goal form"
        style={s.fab}
        onPress={openModal}
      >
        <LinearGradient colors={ctaGradient} style={s.fabGradient}>
          <Text style={s.fabText}>+ Create Goal</Text>
        </LinearGradient>
      </AccessibleTouchable>

      <Modal visible={showModal} animationType="slide" transparent={true} onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent} accessibilityViewIsModal>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} accessibilityRole="header">Create Community Goal</Text>
              <AccessibleTouchable
                label="Close"
                hint="Closes the form without creating a goal"
                style={s.modalCloseButton}
                onPress={closeModal}
              >
                <Text style={s.modalClose}>✕</Text>
              </AccessibleTouchable>
            </View>

            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Goal Title*</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Save 100 kWh this month"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Goal title, required"
              />

              <Text style={s.label}>Description</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add more details about this goal..."
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Description"
                multiline
                numberOfLines={3}
              />

              <Text style={s.label}>Target Energy (kWh)*</Text>
              <TextInput
                style={s.input}
                value={targetEnergy}
                onChangeText={setTargetEnergy}
                placeholder="100"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Target energy in kWh, required"
              />

              <Text style={s.label}>Participants (comma-separated)</Text>
              <TextInput
                style={s.input}
                value={participants}
                onChangeText={setParticipants}
                placeholder="John, Sarah, Mike..."
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Participants, separated by commas"
              />

              <Text style={s.hint}>
                Default deadline is 30 days from now
              </Text>
            </ScrollView>

            <View style={s.modalFooter}>
              <AccessibleTouchable
                label="Cancel"
                hint="Closes the form without creating a goal"
                style={[s.modalButton, s.cancelButton]}
                onPress={closeModal}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </AccessibleTouchable>
              <AccessibleTouchable
                label="Create goal"
                hint="Saves this community goal on this device"
                style={s.modalButton}
                onPress={handleCreateGoal}
              >
                <LinearGradient colors={ctaGradient} style={s.createButton}>
                  <Text style={s.createButtonText}>Create Goal</Text>
                </LinearGradient>
              </AccessibleTouchable>
            </View>
          </View>
        </View>
      </Modal>
      <Sheet
        visible={actionGoal !== null}
        onClose={() => setActionGoal(null)}
        title={actionGoal?.title ?? 'Shared goal'}
        subtitle="Your logged savings are added automatically."
      >
        {actionGoal ? (
          <>
            <Button label="Invite people" icon="account-plus-outline" variant="secondary" full onPress={() => shareInvite(actionGoal)} />
            <Button label="Send my update" icon="send-outline" variant="secondary" full onPress={() => shareUpdate(actionGoal)} />
            <TextField label="Saved by" value={manualWho} onChangeText={setManualWho} maxLength={40} />
            <TextField
              label="kWh saved (manual entry)"
              value={manualKwh}
              onChangeText={setManualKwh}
              keyboardType="decimal-pad"
              suffix="kWh"
              hint="For savings not in your logs, e.g. a teammate without the app."
            />
            <Button label="Add saving" icon="plus" full onPress={saveManual} disabled={!manualKwh.trim() || !manualWho.trim()} />
            <Button label="Delete goal" icon="trash-can-outline" variant="danger" size="sm" full onPress={() => confirmDelete(actionGoal)} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
};

const createStyles = (c: ThemeColors) => {

  return StyleSheet.create({
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
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: Spacing.page,
      // Keeps the last card's Contribute button clear of the floating Create button
      paddingBottom: 100,
    },
    localNotice: {
      marginHorizontal: Spacing.page,
      marginTop: Spacing.page,
      backgroundColor: c.primarySoft,
      borderRadius: Radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.primaryDark,
      padding: Spacing.md,
    },
    importRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
    importField: { flex: 1 },
    localNoticeText: { ...Typography.bodySmall, color: c.text, lineHeight: 18 },
    goalCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.page,
      marginBottom: Spacing.lg,
      ...Shadows.md,
    },
    goalHeader: {
      marginBottom: Spacing.md,
    },
    goalTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xs,
    },
    goalTitle: {
      ...Typography.h2,
      color: c.text,
      flex: 1,
    },
    achievedBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.md,
    },
    achievedText: {
      ...Typography.labelSmall,
      color: c.onPrimary,
    },
    creator: {
      ...Typography.bodySmall,
      color: c.textSecondary,
    },
    goalDescription: {
      ...Typography.bodyMedium,
      color: c.textSecondary,
      marginBottom: Spacing.lg,
    },
    targetInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      backgroundColor: c.primarySoft,
      borderRadius: Radius.sm,
    },
    targetLabel: {
      ...Typography.label,
      color: c.text,
      marginRight: Spacing.sm,
    },
    targetValue: {
      ...Typography.statSmall,
      color: c.text,
    },
    progressSection: {
      marginBottom: Spacing.lg,
    },
    progressInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    progressLabel: {
      ...Typography.bodySmall,
      color: c.textSecondary,
    },
    progressValue: {
      ...Typography.bodySmall,
      fontWeight: '600',
      color: c.text,
    },
    progressBar: {
      height: 10,
      backgroundColor: c.border,
      borderRadius: 5,
      overflow: 'hidden',
      marginBottom: Spacing.xs,
    },
    progressFill: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: c.primary,
    },
    progressFillAchieved: {
      backgroundColor: c.success,
    },
    progressPercentage: {
      ...Typography.statSmall,
      color: c.primaryText,
      textAlign: 'right',
    },
    participantsSection: {
      marginBottom: Spacing.lg,
    },
    participantsLabel: {
      ...Typography.label,
      color: c.text,
      marginBottom: Spacing.sm,
    },
    participantsList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    participantChip: {
      backgroundColor: c.primaryLight,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: Radius.card,
    },
    participantName: {
      ...Typography.bodySmall,
      color: c.text,
      fontWeight: '500',
    },
    goalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    deadline: {
      ...Typography.label,
      color: c.textSecondary,
    },
    deadlineUrgent: {
      color: c.dangerText,
      fontWeight: '600',
    },
    contributeButton: {
      paddingHorizontal: Spacing.page,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.pill,
    },
    contributeButtonText: {
      ...Typography.label,
      color: c.onPrimary,
    },
    fab: {
      position: 'absolute',
      bottom: 20,
      right: 20,
    },
    fabGradient: {
      paddingHorizontal: 25,
      paddingVertical: 15,
      borderRadius: Radius.pill,
      ...Shadows.lg,
    },
    fabText: {
      ...Typography.h3,
      color: c.onPrimary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: c.card,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.page,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      ...Typography.h2,
      color: c.text,
      flex: 1,
    },
    modalCloseButton: {
      alignItems: 'center',
    },
    modalClose: {
      fontSize: 24,
      color: c.textSecondary,
    },
    modalBody: {
      padding: Spacing.page,
    },
    label: {
      ...Typography.label,
      color: c.text,
      marginBottom: Spacing.sm,
      marginTop: Spacing.lg,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.sm,
      padding: Spacing.md,
      ...Typography.bodyMedium,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    hint: {
      ...Typography.bodySmall,
      color: c.textSecondary,
      marginTop: Spacing.lg,
      fontStyle: 'italic',
    },
    modalFooter: {
      flexDirection: 'row',
      padding: Spacing.page,
      gap: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    modalButton: {
      flex: 1,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    cancelButton: {
      backgroundColor: c.inputBg,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelButtonText: {
      ...Typography.h3,
      color: c.text,
    },
    createButton: {
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    createButtonText: {
      ...Typography.h3,
      color: c.onPrimary,
    },
  });
};

export default CommunityGoalsScreen;
