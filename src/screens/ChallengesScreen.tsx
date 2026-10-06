import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { format, addDays } from 'date-fns';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { Challenge } from '../types';

type ChallengeType = Challenge['type'];

const CHALLENGE_TYPES: readonly ChallengeType[] = ['energy', 'cost', 'streak', 'custom'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getChallengeIcon = (challengeType: string) => {
  switch (challengeType) {
    case 'energy': return '⚡';
    case 'cost': return '💰';
    case 'streak': return '🔥';
    default: return '🎯';
  }
};

const getChallengeUnit = (challengeType: string) => {
  switch (challengeType) {
    case 'energy': return 'kWh';
    case 'cost': return '$';
    case 'streak': return 'days';
    default: return 'points';
  }
};

// Unit as a screen reader should speak it ("$" is read awkwardly after a number)
const getSpokenUnit = (challengeType: string) =>
  challengeType === 'cost' ? 'dollars' : getChallengeUnit(challengeType);

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

interface ChallengeTemplate {
  key: string;
  icon: string;
  name: string;
  summary: string;
  type: ChallengeType;
  title: string;
  target: string;
  duration: string;
}

const TEMPLATES: ChallengeTemplate[] = [
  {
    key: 'energy',
    icon: '⚡',
    name: 'Energy Saver',
    summary: 'Save 10 kWh in 7 days',
    type: 'energy',
    title: 'Save 10 kWh in a Week',
    target: '10',
    duration: '7',
  },
  {
    key: 'cost',
    icon: '💰',
    name: 'Bill Reducer',
    summary: 'Save $10 in 30 days',
    type: 'cost',
    title: 'Reduce Bill by $10',
    target: '10',
    duration: '30',
  },
  {
    key: 'streak',
    icon: '🔥',
    name: 'Streak Master',
    summary: '14-day streak',
    type: 'streak',
    title: '14-Day Eco Streak',
    target: '14',
    duration: '14',
  },
];

interface ChallengeCardProps {
  challenge: Challenge;
  onRemove: (challenge: Challenge) => void;
}

interface ActiveChallengeCardProps extends ChallengeCardProps {
  onUpdate: (challenge: Challenge) => void;
}

const ActiveChallengeCard = memo(function ActiveChallengeCard({
  challenge,
  onUpdate,
  onRemove,
}: ActiveChallengeCardProps) {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const unit = getChallengeUnit(challenge.type);
  const spokenUnit = getSpokenUnit(challenge.type);
  const progress = challenge.target > 0 ? (challenge.currentProgress / challenge.target) * 100 : 0;
  const progressClamped = Math.min(Math.max(progress, 0), 100);
  const daysLeft = Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / MS_PER_DAY);
  const isExpired = daysLeft < 0;
  const timeLabel = isExpired ? 'Expired' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;

  return (
    <View style={s.challengeCard}>
      <View
        style={s.challengeHeader}
        accessible
        accessibilityLabel={`${challenge.title}, ${challenge.type} challenge`}
      >
        <Text style={s.challengeIcon}>{getChallengeIcon(challenge.type)}</Text>
        <View style={s.challengeInfo}>
          <Text style={s.challengeTitle}>{challenge.title}</Text>
          <Text style={s.challengeType}>{challenge.type.toUpperCase()}</Text>
        </View>
      </View>

      {challenge.description ? (
        <Text style={s.challengeDescription}>{challenge.description}</Text>
      ) : null}

      <View
        style={s.targetBox}
        accessible
        accessibilityLabel={`Target: ${challenge.target} ${spokenUnit}`}
      >
        <Text style={s.targetLabel}>Target:</Text>
        <Text style={s.targetValue}>
          {challenge.target} {unit}
        </Text>
      </View>

      <View
        style={s.progressContainer}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Progress: ${challenge.currentProgress.toFixed(1)} of ${challenge.target} ${spokenUnit}`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progressClamped) }}
      >
        <View style={s.progressHeader}>
          <Text style={s.progressLabel}>Progress</Text>
          <Text style={s.progressValue}>
            {challenge.currentProgress.toFixed(1)} / {challenge.target} {unit}
          </Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progressClamped}%` }]} />
        </View>
        <Text style={s.progressPercentage}>{progress.toFixed(0)}%</Text>
      </View>

      <View style={s.challengeFooter}>
        <View
          style={[s.timeLeft, isExpired && s.timeExpired]}
          accessible
          accessibilityLabel={timeLabel}
        >
          <Text style={[s.timeText, isExpired && s.timeExpiredText]}>⏰ {timeLabel}</Text>
        </View>
        {isExpired ? (
          <AccessibleTouchable
            label={`Remove ${challenge.title}`}
            hint="Asks you to confirm before deleting this challenge"
            onPress={() => onRemove(challenge)}
          >
            <View style={s.deleteButton}>
              <Text style={s.deleteButtonText}>Remove</Text>
            </View>
          </AccessibleTouchable>
        ) : (
          <AccessibleTouchable
            label={`Update progress for ${challenge.title}`}
            hint={`Choose how many ${spokenUnit} to add`}
            onPress={() => onUpdate(challenge)}
          >
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.updateButton}>
              <Text style={s.updateButtonText}>+ Update</Text>
            </LinearGradient>
          </AccessibleTouchable>
        )}
      </View>

      {challenge.reward ? (
        <View style={s.rewardBox} accessible accessibilityLabel={`Reward: ${challenge.reward}`}>
          <Text style={s.rewardText}>🏆 Reward: {challenge.reward}</Text>
        </View>
      ) : null}
    </View>
  );
});

const CompletedChallengeCard = memo(function CompletedChallengeCard({
  challenge,
  onRemove,
}: ChallengeCardProps) {
  const s = useThemedStyles(createStyles);
  const completedOn = format(new Date(challenge.endDate), 'MMM dd, yyyy');

  return (
    <View style={[s.challengeCard, s.completedCard]}>
      {/* Status is announced by the header label below */}
      <View style={s.completedBadge}>
        <Text style={s.completedBadgeText} accessible={false} importantForAccessibility="no">
          COMPLETED
        </Text>
      </View>
      <View
        style={s.challengeHeader}
        accessible
        accessibilityLabel={`${challenge.title}, completed ${completedOn}`}
      >
        <Text style={s.challengeIcon}>{getChallengeIcon(challenge.type)}</Text>
        <View style={s.challengeInfo}>
          <Text style={s.challengeTitle}>{challenge.title}</Text>
          <Text style={s.completedDate}>Completed {completedOn}</Text>
        </View>
      </View>
      {challenge.reward ? (
        <View
          style={s.rewardEarned}
          accessible
          accessibilityLabel={`Reward earned: ${challenge.reward}`}
        >
          <Text style={s.rewardEarnedText}>🏆 {challenge.reward}</Text>
        </View>
      ) : null}
      <AccessibleTouchable
        label={`Remove ${challenge.title}`}
        hint="Asks you to confirm before deleting this challenge"
        style={s.deleteCompletedBtn}
        onPress={() => onRemove(challenge)}
      >
        <Text style={s.deleteCompletedBtnText}>Remove</Text>
      </AccessibleTouchable>
    </View>
  );
});

const ChallengesScreen = () => {
  const { challenges, addChallenge, updateChallenge, completeChallenge, deleteChallenge } = useEnergy(
    'challenges',
    'addChallenge',
    'updateChallenge',
    'completeChallenge',
    'deleteChallenge',
  );
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChallengeType>('energy');
  const [target, setTarget] = useState('');
  const [duration, setDuration] = useState('7');

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setType('energy');
    setTarget('');
    setDuration('7');
  }, []);

  const openModal = useCallback(() => setShowModal(true), []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    resetForm();
  }, [resetForm]);

  const handleCreateChallenge = async () => {
    const targetValue = parseFloat(target);
    const durationDays = parseInt(duration, 10);
    // An empty or non-numeric duration would make addDays() return an Invalid Date and toISOString() throw
    if (!title.trim() || Number.isNaN(targetValue) || Number.isNaN(durationDays)) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const now = new Date();

    await addChallenge({
      title: title.trim(),
      description: description.trim(),
      type,
      target: targetValue,
      duration: durationDays,
      startDate: now.toISOString(),
      endDate: addDays(now, durationDays).toISOString(),
      createdBy: 'self',
      reward: `${durationDays}-day ${type} challenge badge`,
    });

    setShowModal(false);
    resetForm();
    Alert.alert('Success', 'Challenge created! Track your progress below.');
  };

  const handleProgressUpdate = useCallback(
    (challenge: Challenge, amount: number) => {
      const newProgress = Math.min(challenge.currentProgress + amount, challenge.target);

      updateChallenge(challenge.id, {
        currentProgress: newProgress,
      });

      if (newProgress >= challenge.target && !challenge.isCompleted) {
        completeChallenge(challenge.id);
        Alert.alert(
          '🎉 Challenge Completed!',
          `Congratulations! You've completed "${challenge.title}"!\n\nReward: ${challenge.reward || 'Achievement unlocked!'}`,
        );
      }
    },
    [updateChallenge, completeChallenge],
  );

  const promptProgressUpdate = useCallback(
    (challenge: Challenge) => {
      const unit = getChallengeUnit(challenge.type);
      Alert.alert('Update Progress', `How much progress? (${unit})`, [
        { text: 'Cancel', style: 'cancel' },
        { text: `+1 ${unit}`, onPress: () => handleProgressUpdate(challenge, 1) },
        { text: `+5 ${unit}`, onPress: () => handleProgressUpdate(challenge, 5) },
        { text: `+10 ${unit}`, onPress: () => handleProgressUpdate(challenge, 10) },
      ]);
    },
    [handleProgressUpdate],
  );

  const confirmRemove = useCallback(
    (challenge: Challenge) => {
      Alert.alert('Remove Challenge', `Delete "${challenge.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteChallenge(challenge.id) },
      ]);
    },
    [deleteChallenge],
  );

  const applyTemplate = useCallback((template: ChallengeTemplate) => {
    setType(template.type);
    setTitle(template.title);
    setTarget(template.target);
    setDuration(template.duration);
    setShowModal(true);
  }, []);

  const { activeChallenges, completedChallenges } = useMemo(() => {
    const active: Challenge[] = [];
    const completed: Challenge[] = [];
    for (const challenge of challenges) {
      (challenge.isCompleted ? completed : active).push(challenge);
    }
    return { activeChallenges: active, completedChallenges: completed };
  }, [challenges]);

  const ctaGradient = useMemo(() => [colors.primary, colors.primaryDark], [colors]);
  const keyboardAppearance = isDark ? 'dark' : 'light';
  const targetUnit = getChallengeUnit(type);

  return (
    <View style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        {/* Eyebrow repeats the title, so screen readers skip it */}
        <Text style={s.headerLabel} accessible={false} importantForAccessibility="no">
          CHALLENGES
        </Text>
        <Text style={s.headerTitle} accessibilityRole="header">Energy Challenges</Text>
      </LinearGradient>

      <ScrollView style={s.content} contentContainerStyle={s.scrollContent}>
        {/* Active Challenges */}
        {activeChallenges.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Active Challenges</Text>
            {activeChallenges.map((challenge) => (
              <ActiveChallengeCard
                key={challenge.id}
                challenge={challenge}
                onUpdate={promptProgressUpdate}
                onRemove={confirmRemove}
              />
            ))}
          </View>
        )}

        {/* Completed Challenges */}
        {completedChallenges.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Completed</Text>
            {completedChallenges.map((challenge) => (
              <CompletedChallengeCard
                key={challenge.id}
                challenge={challenge}
                onRemove={confirmRemove}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {challenges.length === 0 && (
          <EmptyState
            variant="inline"
            icon="🎯"
            title="No Challenges Yet"
            body="Set an energy, cost or streak target and track your progress here. Start from scratch or pick a quick template below."
            primaryAction={{
              label: 'Create a challenge',
              hint: 'Opens the new challenge form',
              onPress: openModal,
            }}
            style={s.emptyState}
          />
        )}

        {/* Challenge Templates */}
        <View style={s.templatesSection}>
          <Text style={s.templatesTitle} accessibilityRole="header">Quick Challenge Templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TEMPLATES.map((template) => (
              <AccessibleTouchable
                key={template.key}
                label={`${template.name} template: ${template.summary}`}
                hint="Opens the new challenge form pre-filled with this template"
                style={s.templateCard}
                onPress={() => applyTemplate(template)}
              >
                <Text style={s.templateIcon} accessible={false} importantForAccessibility="no">
                  {template.icon}
                </Text>
                <Text style={s.templateTitle}>{template.name}</Text>
                <Text style={s.templateDesc}>{template.summary}</Text>
              </AccessibleTouchable>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <AccessibleTouchable
        label="New challenge"
        hint="Opens the form to create a challenge"
        style={s.fab}
        onPress={openModal}
      >
        <LinearGradient colors={ctaGradient} style={s.fabGradient}>
          <Text style={s.fabText}>+ New Challenge</Text>
        </LinearGradient>
      </AccessibleTouchable>

      {/* Create Challenge Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <View style={s.modalOverlay}>
          <View
            style={s.modalContent}
            accessibilityViewIsModal
            onAccessibilityEscape={closeModal}
          >
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} accessibilityRole="header">Create Challenge</Text>
              <AccessibleTouchable
                label="Close"
                hint="Discards this challenge and closes the form"
                style={s.modalCloseButton}
                onPress={closeModal}
              >
                <Text style={s.modalClose}>✕</Text>
              </AccessibleTouchable>
            </View>

            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              {/* Visible field labels are folded into each input's accessibilityLabel */}
              <Text style={s.label} accessible={false} importantForAccessibility="no">
                Challenge Title*
              </Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g., Save 20 kWh this week"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Challenge title, required"
              />

              <Text style={s.label} accessible={false} importantForAccessibility="no">
                Description
              </Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add details about this challenge..."
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Description"
                multiline
                numberOfLines={2}
              />

              <Text style={s.label} accessibilityLabel="Challenge type, required">
                Challenge Type*
              </Text>
              <View style={s.typeSelector} accessibilityRole="radiogroup">
                {CHALLENGE_TYPES.map((t) => {
                  const selected = type === t;
                  return (
                    <AccessibleTouchable
                      key={t}
                      role="radio"
                      label={`${capitalize(t)} challenge`}
                      hint={`Measures the target in ${getSpokenUnit(t)}`}
                      accessibilityState={{ checked: selected }}
                      style={[s.typeButton, selected && s.typeButtonActive]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[s.typeButtonText, selected && s.typeButtonTextActive]}>
                        {capitalize(t)}
                      </Text>
                    </AccessibleTouchable>
                  );
                })}
              </View>

              <Text style={s.label} accessible={false} importantForAccessibility="no">
                Target ({targetUnit})*
              </Text>
              <TextInput
                style={s.input}
                value={target}
                onChangeText={setTarget}
                placeholder="e.g., 20"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel={`Target in ${getSpokenUnit(type)}, required`}
              />

              <Text style={s.label} accessible={false} importantForAccessibility="no">
                Duration (days)*
              </Text>
              <TextInput
                style={s.input}
                value={duration}
                onChangeText={setDuration}
                placeholder="7"
                keyboardType="number-pad"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={keyboardAppearance}
                accessibilityLabel="Duration in days, required"
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <AccessibleTouchable
                label="Cancel"
                hint="Discards this challenge and closes the form"
                style={[s.modalButton, s.cancelButton]}
                onPress={closeModal}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </AccessibleTouchable>
              <AccessibleTouchable
                label="Create challenge"
                hint="Saves the challenge and starts tracking it"
                style={s.modalButton}
                onPress={handleCreateChallenge}
              >
                <LinearGradient colors={ctaGradient} style={s.createButton}>
                  <Text style={s.createButtonText}>Create</Text>
                </LinearGradient>
              </AccessibleTouchable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (c: ThemeColors) => {
  // Bright green reads well on dark surfaces; light surfaces need the deeper shade for legible text

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
    // Keeps the last row clear of the floating "New Challenge" button
    scrollContent: {
      paddingBottom: 96,
    },
    section: {
      padding: Spacing.page,
    },
    sectionTitle: {
      ...Typography.h2,
      color: c.text,
      marginBottom: Spacing.lg,
    },
    challengeCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.page,
      marginBottom: Spacing.lg,
      ...Shadows.md,
    },
    completedCard: {
      backgroundColor: c.primarySoft,
      borderLeftWidth: 4,
      borderLeftColor: c.success,
    },
    completedBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: c.success,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.md,
    },
    completedBadgeText: {
      ...Typography.overline,
      color: c.onPrimary,
    },
    challengeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    challengeIcon: {
      fontSize: 40,
      marginRight: Spacing.lg,
    },
    challengeInfo: {
      flex: 1,
    },
    challengeTitle: {
      ...Typography.h3,
      color: c.text,
      marginBottom: Spacing.xs,
    },
    challengeType: {
      ...Typography.overline,
      color: c.primaryText,
    },
    completedDate: {
      ...Typography.bodySmall,
      color: c.primaryText,
      fontWeight: '500',
    },
    challengeDescription: {
      ...Typography.bodyMedium,
      color: c.textSecondary,
      marginBottom: Spacing.md,
    },
    targetBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primarySoft,
      padding: Spacing.md,
      borderRadius: Radius.sm,
      marginBottom: Spacing.lg,
    },
    targetLabel: {
      ...Typography.label,
      color: c.primaryText,
      marginRight: Spacing.sm,
    },
    targetValue: {
      ...Typography.statSmall,
      color: c.primaryText,
    },
    progressContainer: {
      marginBottom: Spacing.lg,
    },
    progressHeader: {
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
      backgroundColor: c.primary,
      borderRadius: 5,
    },
    progressPercentage: {
      ...Typography.label,
      color: c.primaryText,
      textAlign: 'right',
    },
    challengeFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    timeLeft: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      backgroundColor: c.accentLight,
      borderRadius: Radius.md,
    },
    timeExpired: {
      backgroundColor: c.dangerSoft,
    },
    timeText: {
      ...Typography.bodySmall,
      color: c.info,
      fontWeight: '500',
    },
    timeExpiredText: {
      color: c.dangerText,
    },
    updateButton: {
      paddingHorizontal: Spacing.page,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.pill,
    },
    updateButtonText: {
      ...Typography.label,
      color: c.onPrimary,
    },
    deleteButton: {
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.pill,
    },
    deleteButtonText: {
      ...Typography.label,
      color: c.dangerText,
    },
    deleteCompletedBtn: {
      marginTop: Spacing.md,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.dangerBorder,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
      alignItems: 'center',
    },
    deleteCompletedBtnText: {
      ...Typography.label,
      color: c.dangerText,
    },
    rewardBox: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      backgroundColor: c.primarySoft,
      borderRadius: Radius.sm,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
    },
    rewardText: {
      ...Typography.bodySmall,
      color: c.primaryText,
      fontWeight: '500',
    },
    rewardEarned: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      backgroundColor: c.card,
      borderRadius: Radius.sm,
    },
    rewardEarnedText: {
      ...Typography.label,
      color: c.primaryText,
      textAlign: 'center',
    },
    emptyState: {
      marginTop: Spacing.xl,
    },
    templatesSection: {
      padding: Spacing.page,
      paddingTop: 0,
    },
    templatesTitle: {
      ...Typography.h3,
      color: c.text,
      marginBottom: Spacing.lg,
    },
    templateCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.lg,
      marginRight: Spacing.md,
      width: 140,
      ...Shadows.sm,
    },
    templateIcon: {
      fontSize: 32,
      marginBottom: Spacing.sm,
    },
    templateTitle: {
      ...Typography.label,
      color: c.text,
      marginBottom: Spacing.xs,
    },
    templateDesc: {
      ...Typography.labelSmall,
      color: c.textSecondary,
      fontWeight: '400',
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
      maxHeight: '80%',
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
      marginTop: Spacing.md,
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
      height: 60,
      textAlignVertical: 'top',
    },
    typeSelector: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: Radius.sm,
      backgroundColor: c.inputBg,
      alignItems: 'center',
    },
    typeButtonActive: {
      backgroundColor: c.primary,
    },
    typeButtonText: {
      ...Typography.label,
      color: c.textSecondary,
    },
    typeButtonTextActive: {
      color: c.onPrimary,
      fontWeight: '600',
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
      color: c.textSecondary,
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

export default ChallengesScreen;
