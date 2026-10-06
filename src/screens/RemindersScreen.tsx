import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import NotificationService from '../services/NotificationService';
import { useNotificationStatus } from '../services/notifications/useNotificationSync';
import { Radius, Shadows, Spacing, Typography } from '../theme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DAYS = DAY_NAMES.map((name, value) => ({ name, value, label: name[0] }));

/** "Every day", or the selected days as short names ("Mon, Wed") or full names when `long`. */
const formatSchedule = (days: number[], long = false) => {
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'No days selected';
  return days.map((day) => (long ? DAY_NAMES[day] : DAY_NAMES[day]?.slice(0, 3))).join(', ');
};

const RemindersScreen = () => {
  const { appliances, reminders, settings, addReminder, updateReminder, deleteReminder } = useEnergy(
    'appliances',
    'reminders',
    'settings',
    'addReminder',
    'updateReminder',
    'deleteReminder',
  );
  const reminderStatus = useNotificationStatus((state) => state.reminderStatus);
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [time, setTime] = useState('20:00');
  const [days, setDays] = useState<number[]>(() => [...ALL_DAYS]);
  const [applianceId, setApplianceId] = useState<string | undefined>();

  const activeCount = useMemo(() => reminders.filter((reminder) => reminder.isActive).length, [reminders]);
  const applianceNames = useMemo(
    () => new Map(appliances.map((appliance) => [appliance.id, appliance.name])),
    [appliances],
  );
  const exactAlarmDenied = settings.notificationsEnabled && reminderStatus === 'exact-alarm-denied';

  const resetForm = useCallback(() => {
    setTitle('');
    setMessage('');
    setTime('20:00');
    setDays([...ALL_DAYS]);
    setApplianceId(undefined);
  }, []);

  const openModal = useCallback(() => setShowModal(true), []);
  const hideModal = useCallback(() => setShowModal(false), []);
  const discardAndClose = useCallback(() => {
    resetForm();
    setShowModal(false);
  }, [resetForm]);

  const toggleDay = useCallback((day: number) => {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  }, []);

  const openAlarmSettings = useCallback(async () => {
    const opened = await NotificationService.openExactAlarmSettings();
    // Fall back to the app's settings page if the alarm settings screen is unavailable.
    if (!opened) {
      Linking.openSettings().catch(() => {});
    }
  }, []);

  const createReminder = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Give this reminder a short, clear name.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert('Check the time', 'Use 24-hour time in the format HH:MM, for example 20:00.');
      return;
    }
    if (days.length === 0) {
      Alert.alert('Choose a day', 'Select at least one day for this reminder.');
      return;
    }

    await addReminder({
      title: title.trim(),
      message: message.trim() || `Time to check ${title.trim().toLowerCase()}.`,
      time,
      days,
      isActive: true,
      applianceId,
    });
    resetForm();
    setShowModal(false);

    let savedMessage: string;
    if (!settings.notificationsEnabled) {
      savedMessage = 'Your reminder is saved. Turn on notifications in Settings to receive alerts.';
    } else if (reminderStatus === 'exact-alarm-denied') {
      savedMessage = 'Your reminder is saved. Notifications will start once you allow alarms & reminders for SaveVolt.';
    } else {
      const schedule = days.length === 7 ? 'every day' : `on ${formatSchedule(days, true)}`;
      savedMessage = `You'll get a notification at ${time} ${schedule}.`;
    }
    Alert.alert('Reminder saved', savedMessage);
  };

  const removeReminder = (id: string, reminderTitle: string) => {
    Alert.alert('Delete reminder', `Remove “${reminderTitle}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReminder(id) },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.eyebrow}>ROUTINES & ALERTS</Text>
        <Text style={s.heading} accessibilityRole="header">Reminders</Text>
        <Text style={s.headerCopy}>Small prompts that keep energy-saving habits on track.</Text>
      </LinearGradient>

      <View style={s.summaryCard}>
        <View accessible accessibilityLabel={`${activeCount} active ${activeCount === 1 ? 'reminder' : 'reminders'}`}>
          <Text style={s.summaryValue}>{activeCount}</Text>
          <Text style={s.summaryLabel}>active reminders</Text>
        </View>
        <AccessibleTouchable
          label="New reminder"
          hint="Opens a form to create a reminder"
          style={s.newButton}
          onPress={openModal}
        >
          <Text style={s.newButtonText}>+ New reminder</Text>
        </AccessibleTouchable>
      </View>

      {!settings.notificationsEnabled && (
        <View style={s.notice} accessible>
          <Text style={s.noticeTitle}>Notifications are turned off</Text>
          <Text style={s.noticeText}>Your reminders are saved, but alerts will stay muted until you enable notifications in Settings.</Text>
        </View>
      )}

      {exactAlarmDenied && (
        <View style={s.notice}>
          <View accessible>
            <Text style={s.noticeTitle}>Allow alarms & reminders</Text>
            <Text style={s.noticeText}>Android needs permission to deliver reminders at an exact time. Your reminders are saved and will start once you allow it.</Text>
          </View>
          <AccessibleTouchable
            label="Open settings"
            hint="Opens Android settings so SaveVolt can deliver reminders on time"
            style={s.noticeButton}
            onPress={openAlarmSettings}
          >
            <Text style={s.noticeButtonText}>Open settings</Text>
          </AccessibleTouchable>
        </View>
      )}

      <View style={s.list}>
        {reminders.length === 0 ? (
          <View style={s.emptyCard}>
            <EmptyState
              variant="inline"
              icon="⏰"
              title="No reminders yet"
              body="Create one for lights, cooling, appliance checks, or any energy-saving routine."
              primaryAction={{ label: 'New reminder', hint: 'Opens a form to create a reminder', onPress: openModal }}
            />
          </View>
        ) : reminders.map((reminder) => {
          const applianceName = reminder.applianceId ? applianceNames.get(reminder.applianceId) : undefined;
          return (
            <View key={reminder.id} style={[s.reminderCard, !reminder.isActive && s.reminderInactive]}>
              <View style={s.reminderHeader}>
                <View
                  style={s.reminderSummary}
                  accessible
                  accessibilityLabel={`${reminder.title}, ${reminder.time}, ${formatSchedule(reminder.days, true)}`}
                >
                  <View style={s.timeBadge}><Text style={s.timeText}>{reminder.time}</Text></View>
                  <View style={s.reminderInfo}>
                    <Text style={s.reminderTitle}>{reminder.title}</Text>
                    <Text style={s.reminderSchedule}>{formatSchedule(reminder.days)}</Text>
                  </View>
                </View>
                <Switch
                  value={reminder.isActive}
                  onValueChange={(value) => updateReminder(reminder.id, { isActive: value })}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={reminder.isActive ? colors.primary : colors.switchThumbOff}
                  accessibilityLabel={`${reminder.title} reminder`}
                  accessibilityHint="Turns this reminder on or off"
                />
              </View>
              <Text style={s.reminderMessage}>{reminder.message}</Text>
              <View style={s.reminderFooter}>
                <Text style={s.applianceText}>{applianceName ? `For ${applianceName}` : 'General energy routine'}</Text>
                <AccessibleTouchable
                  label={`Delete ${reminder.title}`}
                  hint="Asks for confirmation before removing this reminder"
                  style={s.deleteButton}
                  onPress={() => removeReminder(reminder.id, reminder.title)}
                >
                  <Text style={s.deleteText}>Delete</Text>
                </AccessibleTouchable>
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={hideModal}>
        <View style={s.modalOverlay}>
          <View style={s.modal} accessibilityViewIsModal>
            <View style={s.modalHeader}>
              <View style={s.modalHeading}>
                <Text style={s.modalTitle} accessibilityRole="header">New reminder</Text>
                <Text style={s.modalSubtitle}>Create a repeatable energy-saving prompt.</Text>
              </View>
              <AccessibleTouchable
                label="Close"
                hint="Discards this reminder and closes the form"
                style={s.closeButton}
                onPress={discardAndClose}
              >
                <Text style={s.closeText}>Close</Text>
              </AccessibleTouchable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={s.input}
                placeholder="e.g., Switch off the living room"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                accessibilityLabel="Reminder title"
              />
              <Text style={s.fieldLabel}>Message (optional)</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                style={[s.input, s.messageInput]}
                multiline
                placeholder="What should SaveVolt remind you to do?"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                accessibilityLabel="Reminder message, optional"
              />
              <Text style={s.fieldLabel}>Time (24-hour)</Text>
              <TextInput
                value={time}
                onChangeText={setTime}
                style={s.input}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                placeholder="20:00"
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                accessibilityLabel="Reminder time"
                accessibilityHint="24-hour format, for example 20:00"
              />

              <Text style={s.fieldLabel}>Repeat on</Text>
              <View style={s.daysRow}>
                {DAYS.map((day) => {
                  const active = days.includes(day.value);
                  return (
                    <AccessibleTouchable
                      key={day.name}
                      role="checkbox"
                      label={day.name}
                      accessibilityState={{ checked: active }}
                      style={s.dayTarget}
                      onPress={() => toggleDay(day.value)}
                    >
                      <View style={[s.dayButton, active && s.dayButtonActive]}>
                        <Text style={[s.dayText, active && s.dayTextActive]}>{day.label}</Text>
                      </View>
                    </AccessibleTouchable>
                  );
                })}
              </View>

              {appliances.length > 0 && (
                <>
                  <Text style={s.fieldLabel}>Appliance (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.applianceScroll}>
                    <AccessibleTouchable
                      role="radio"
                      label="General"
                      hint="Not linked to a specific appliance"
                      accessibilityState={{ checked: !applianceId }}
                      style={s.chipTarget}
                      onPress={() => setApplianceId(undefined)}
                    >
                      <View style={[s.applianceChip, !applianceId && s.applianceChipActive]}>
                        <Text style={[s.applianceChipText, !applianceId && s.applianceChipTextActive]}>General</Text>
                      </View>
                    </AccessibleTouchable>
                    {appliances.map((appliance) => {
                      const selected = applianceId === appliance.id;
                      return (
                        <AccessibleTouchable
                          key={appliance.id}
                          role="radio"
                          label={appliance.name}
                          hint="Links this reminder to the appliance"
                          accessibilityState={{ checked: selected }}
                          style={s.chipTarget}
                          onPress={() => setApplianceId(appliance.id)}
                        >
                          <View style={[s.applianceChip, selected && s.applianceChipActive]}>
                            <Text style={[s.applianceChipText, selected && s.applianceChipTextActive]}>{appliance.name}</Text>
                          </View>
                        </AccessibleTouchable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <AccessibleTouchable label="Save reminder" activeOpacity={0.85} onPress={createReminder}>
                <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.saveButton}>
                  <Text style={s.saveButtonText}>Save reminder</Text>
                </LinearGradient>
              </AccessibleTouchable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { paddingBottom: 36 },
  header: { paddingTop: 56, paddingBottom: 35, paddingHorizontal: Spacing.page },
  eyebrow: { ...Typography.overline, color: c.primary, marginBottom: 5 },
  heading: { ...Typography.displaySmall, color: c.textOnDark, marginBottom: 6 },
  headerCopy: { ...Typography.bodyMedium, color: c.textOnDarkSub, maxWidth: 310, lineHeight: 20 },
  summaryCard: { marginHorizontal: Spacing.page, marginTop: -18, padding: 18, backgroundColor: c.card, borderRadius: Radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Shadows.md },
  // Bright green fails contrast on white, so light mode uses the deeper brand green.
  summaryValue: { ...Typography.stat, color: c.primaryText },
  summaryLabel: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  newButton: { backgroundColor: c.primary, borderRadius: Radius.pill, paddingHorizontal: 16, alignItems: 'center' },
  newButtonText: { ...Typography.labelSmall, color: c.onPrimary },
  notice: { marginHorizontal: Spacing.page, marginTop: 16, borderRadius: Radius.md, padding: 14, backgroundColor: c.warningSoft, borderLeftWidth: 3, borderLeftColor: c.warning },
  noticeTitle: { ...Typography.label, color: c.text, marginBottom: 3 },
  noticeText: { ...Typography.bodySmall, color: c.text, lineHeight: 17 },
  noticeButton: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: c.primary, borderRadius: Radius.pill, paddingHorizontal: 16, alignItems: 'center' },
  noticeButtonText: { ...Typography.label, color: c.onPrimary },
  list: { paddingHorizontal: Spacing.page, marginTop: 20 },
  emptyCard: { backgroundColor: c.card, borderRadius: Radius.card, ...Shadows.sm },
  reminderCard: { backgroundColor: c.card, borderRadius: Radius.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, marginBottom: 12, ...Shadows.sm },
  reminderInactive: { opacity: 0.58 },
  reminderHeader: { flexDirection: 'row', alignItems: 'center' },
  reminderSummary: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  timeBadge: { minWidth: 58, paddingHorizontal: 6, paddingVertical: 9, borderRadius: Radius.sm, backgroundColor: c.primarySoft, alignItems: 'center', marginRight: 11 },
  timeText: { ...Typography.label, color: c.text },
  reminderInfo: { flex: 1 },
  reminderTitle: { ...Typography.h3, color: c.text },
  reminderSchedule: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  reminderMessage: { ...Typography.bodyMedium, color: c.textSecondary, marginTop: 14, lineHeight: 20 },
  reminderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13, borderTopWidth: 1, borderTopColor: c.divider },
  applianceText: { ...Typography.bodySmall, color: c.textSecondary, flex: 1, marginRight: 12 },
  deleteButton: { alignItems: 'flex-end' },
  deleteText: { ...Typography.labelSmall, color: c.dangerText },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: c.overlay },
  modal: { maxHeight: '88%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.page, backgroundColor: c.card },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 22 },
  modalHeading: { flex: 1 },
  modalTitle: { ...Typography.h2, color: c.text },
  modalSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 3 },
  closeButton: { alignItems: 'flex-end' },
  closeText: { ...Typography.label, color: c.textSecondary },
  fieldLabel: { ...Typography.label, color: c.textSecondary, marginBottom: 7, marginTop: 14 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: Radius.sm, backgroundColor: c.inputBg, color: c.text, paddingHorizontal: 13, paddingVertical: 11, ...Typography.bodyMedium },
  messageInput: { minHeight: 70, textAlignVertical: 'top' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayTarget: { flex: 1, alignItems: 'center' },
  dayButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
  dayButtonActive: { backgroundColor: c.primary, borderColor: c.primary },
  dayText: { ...Typography.labelSmall, color: c.textSecondary },
  dayTextActive: { color: c.onPrimary },
  applianceScroll: { marginHorizontal: -Spacing.page, paddingHorizontal: Spacing.page },
  chipTarget: { marginRight: 8 },
  applianceChip: { borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.inputBg },
  applianceChipActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
  applianceChipText: { ...Typography.labelSmall, color: c.textSecondary },
  applianceChipTextActive: { color: c.text },
  saveButton: { borderRadius: Radius.md, alignItems: 'center', marginTop: 26, marginBottom: 16, paddingVertical: 15 },
  saveButtonText: { ...Typography.h3, color: c.onPrimary },
});

export default RemindersScreen;
