import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Spacing, Typography } from '../theme';
import {
  AnimatedNumber, Button, Card, Chip, GlassPanel, HeroHeader, IconBubble, ListRow, Pill, Screen, SectionHeader,
  Segmented, Stepper, TextField, toast,
} from '../components/ui';
import EmptyState from '../components/EmptyState';
import AccessibleTouchable from '../components/AccessibleTouchable';
import {
  addDayKey, applianceDailyKwh, dayKey, defaultHours, isMeasured, meterDailyUsage, parseDayKey, profileDailyKwh,
  recordSource, toDayKey,
} from '../utils/analytics';
import { formatCost, formatEnergy } from '../utils/energy';
import { categoryMeta, formatHours } from '../utils/categoryMeta';
import { POINTS } from '../utils/gamification';

type Mode = 'hours' | 'meter';

const SOURCE_LABEL: Record<string, string> = {
  logged: 'LOGGED', meter: 'METER', 'smart-plug': 'SMART PLUG', estimate: 'ESTIMATE',
};

interface DailyLogScreenProps {
  navigation: { navigate: (screen: string, params?: object) => void; goBack: () => void };
  route?: { params?: { mode?: Mode; date?: string } };
}

const DailyLogScreen = ({ navigation, route }: DailyLogScreenProps) => {
  const { appliances, usageRecords, meterReadings, settings, logDay, deleteUsageRecord, addMeterReading, deleteMeterReading } = useEnergy(
    'appliances', 'usageRecords', 'meterReadings', 'settings', 'logDay', 'deleteUsageRecord', 'addMeterReading', 'deleteMeterReading',
  );
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const todayKey = dayKey(new Date());
  const [mode, setMode] = useState<Mode>(route?.params?.mode ?? 'hours');
  const [date, setDate] = useState<string>(route?.params?.date ?? todayKey);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState('');
  const [readingWhen, setReadingWhen] = useState<'now' | 'yesterday'>('now');
  const [readingNote, setReadingNote] = useState('');
  const [readingError, setReadingError] = useState<string | null>(null);

  useEffect(() => {
    if (route?.params?.mode) setMode(route.params.mode);
    if (route?.params?.date) setDate(route.params.date);
  }, [route?.params?.mode, route?.params?.date]);

  const existing = useMemo(() => usageRecords.find((r) => toDayKey(r.date) === date), [usageRecords, date]);

  // Load the saved hours for this day, or the usual hours when it has not been logged yet
  useEffect(() => {
    const base = defaultHours(appliances);
    setHours(existing?.applianceHours ? { ...base, ...existing.applianceHours } : base);
    setNote(existing?.note ?? '');
  }, [date, existing, appliances]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDayKey(todayKey, -i)), [todayKey]);
  const loggedDays = useMemo(() => new Set(usageRecords.filter(isMeasured).map((r) => toDayKey(r.date))), [usageRecords]);

  const baseline = profileDailyKwh(appliances);
  const total = appliances.reduce((sum, a) => sum + applianceDailyKwh(a, hours[a.id] ?? 0), 0);
  const metered = existing?.source === 'meter';
  const dayTotal = metered ? existing!.totalConsumption : total;
  const diff = baseline - dayTotal;
  const changed = existing?.applianceHours
    ? appliances.some((a) => (existing.applianceHours![a.id] ?? 0) !== (hours[a.id] ?? 0)) || (existing.note ?? '') !== note
    : true;

  const meterUsage = useMemo(() => meterDailyUsage(meterReadings), [meterReadings]);
  const sortedReadings = useMemo(() => [...meterReadings].sort((a, b) => b.takenAt.localeCompare(a.takenAt)), [meterReadings]);
  const lastReading = sortedReadings[0];

  if (appliances.length === 0 && mode === 'hours') {
    return (
      <Screen statusBar="surface" withBack>
        <EmptyState
          icon="📝"
          title="Nothing to log yet"
          body="Add the appliances in your home first. Then each day you can confirm how long they actually ran, and SaveVolt measures your real savings."
          primaryAction={{ label: 'Add an appliance', onPress: () => navigation.navigate('AddAppliance') }}
          secondaryAction={{ label: 'Enter a meter reading instead', onPress: () => setMode('meter') }}
        />
      </Screen>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const wasLogged = Boolean(existing && isMeasured(existing));
      await logDay(date, hours, note);
      const saved = baseline - total;
      const message = saved > 0.05
        ? `Saved! ${formatEnergy(saved)} below your usual day (${formatCost(saved * settings.electricityRate, settings.currency)}).`
        : saved < -0.05 ? `Saved. ${formatEnergy(-saved)} above your usual day.` : 'Saved. Right on your usual day.';
      if (!wasLogged) toast.reward(`${message} +${POINTS.dailyLog} pts`);
      else toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this day.');
    } finally {
      setSaving(false);
    }
  };

  const removeLog = () => {
    if (!existing) return;
    Alert.alert('Delete this log?', `Remove what you logged for ${format(parseDayKey(date), 'EEEE d MMMM')}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteUsageRecord(existing.id).then(() => toast.info('Log deleted')) },
    ]);
  };

  const saveReading = async () => {
    const value = Number.parseFloat(reading.replace(',', '.'));
    const takenAt = new Date();
    if (readingWhen === 'yesterday') {
      takenAt.setDate(takenAt.getDate() - 1);
      takenAt.setHours(20, 0, 0, 0);
    }
    setSaving(true);
    setReadingError(null);
    try {
      const { daysUpdated } = await addMeterReading({ value, takenAt: takenAt.toISOString(), note: readingNote });
      setReading('');
      setReadingNote('');
      toast.reward(daysUpdated > 0
        ? `Reading saved. ${daysUpdated} day${daysUpdated === 1 ? '' : 's'} now use real meter data. +${POINTS.meterReading} pts`
        : `First reading saved. Add another tomorrow to measure a full day. +${POINTS.meterReading} pts`);
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : 'Could not save the reading.');
    } finally {
      setSaving(false);
    }
  };

  const removeReading = (id: string, value: number) => {
    Alert.alert('Delete reading?', `Remove the ${value} kWh reading? Days it measured go back to your logs.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMeterReading(id) },
    ]);
  };

  const dateLabel = date === todayKey ? 'Today' : date === addDayKey(todayKey, -1) ? 'Yesterday' : format(parseDayKey(date), 'EEE d MMM');

  return (
    <Screen withBack>
      <HeroHeader
        withBack
        eyebrow="DAILY LOG"
        title={mode === 'hours' ? `${dateLabel}'s energy` : 'Meter reading'}
        subtitle={mode === 'hours'
          ? 'Adjust how long each device actually ran. SaveVolt compares it with your usual day.'
          : 'Read the kWh counter on your electricity meter. Two readings give real usage for every day between them.'}
        variant={mode === 'hours' ? 'volt' : 'ocean'}
      >
        <Segmented
          onDark
          style={s.modeSwitch}
          value={mode}
          onChange={setMode}
          options={[{ key: 'hours', label: 'Device hours' }, { key: 'meter', label: 'Meter reading' }]}
        />
        {mode === 'hours' ? (
          <GlassPanel style={s.summary}>
            <View style={s.summaryMain}>
              <AnimatedNumber value={dayTotal} format={formatEnergy} style={s.summaryValue} />
              <Text style={s.summaryLabel}>
                {metered ? 'measured by your meter' : `vs ${formatEnergy(baseline)} on a usual day`}
              </Text>
            </View>
            <View style={[s.deltaPill, { backgroundColor: diff >= 0 ? colors.primary : colors.warning }]}>
              <Text style={s.deltaText}>
                {Math.abs(diff) < 0.05 ? 'Usual' : `${diff > 0 ? '−' : '+'}${formatEnergy(Math.abs(diff))}`}
              </Text>
            </View>
          </GlassPanel>
        ) : null}
      </HeroHeader>

      {mode === 'hours' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>
            {days.map((key) => {
              const selected = key === date;
              const logged = loggedDays.has(key);
              const d = parseDayKey(key);
              return (
                <AccessibleTouchable
                  key={key}
                  label={`${format(d, 'EEEE d MMMM')}${logged ? ', logged' : ''}`}
                  role="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setDate(key)}
                  style={[s.day, selected && s.daySelected]}
                >
                  <Text style={[s.dayName, selected && s.dayTextSelected]}>{key === todayKey ? 'Today' : format(d, 'EEE')}</Text>
                  <Text style={[s.dayNum, selected && s.dayTextSelected]}>{format(d, 'd')}</Text>
                  <View style={[s.dayDot, logged && { backgroundColor: selected ? colors.onPrimary : colors.primary }]} />
                </AccessibleTouchable>
              );
            })}
          </ScrollView>

          {existing ? (
            <View style={s.statusRow}>
              <Pill label={SOURCE_LABEL[recordSource(existing)]} tone={isMeasured(existing) ? 'primary' : 'neutral'} icon="check" />
              <Text style={s.statusText}>
                {metered ? 'The meter sets this day\'s total; hours show where it went.' : 'Already logged. Changes update it.'}
              </Text>
            </View>
          ) : null}

          <SectionHeader
            title="Devices"
            subtitle={`${appliances.filter((a) => (hours[a.id] ?? 0) > 0).length} of ${appliances.length} ran`}
            action={{ label: 'Reset to usual', onPress: () => setHours(defaultHours(appliances)) }}
          />
          <View style={s.list}>
            {appliances.map((appliance) => {
              const h = hours[appliance.id] ?? 0;
              const usual = appliance.isActive ? appliance.hoursPerDay : 0;
              const meta = categoryMeta(appliance.category);
              const kWh = applianceDailyKwh(appliance, h);
              const delta = applianceDailyKwh(appliance, usual) - kWh;
              return (
                <Card key={appliance.id} style={s.deviceCard}>
                  <View style={s.deviceTop}>
                    <IconBubble icon={meta.icon} tone={meta.tone} size={42} />
                    <View style={s.deviceInfo}>
                      <Text style={s.deviceName} numberOfLines={1}>{appliance.name}</Text>
                      <Text style={s.deviceMeta}>
                        {appliance.quantity > 1 ? `${appliance.quantity} × ` : ''}{appliance.powerRating} W · usually {formatHours(usual)}
                      </Text>
                    </View>
                    <View style={s.deviceKwh}>
                      <Text style={s.deviceKwhValue}>{formatEnergy(kWh)}</Text>
                      {Math.abs(delta) >= 0.01 ? (
                        <Text style={[s.deviceDelta, { color: delta > 0 ? colors.primaryText : colors.warning }]}>
                          {delta > 0 ? '−' : '+'}{formatEnergy(Math.abs(delta))}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={s.deviceControls}>
                    <Stepper
                      label={`Hours ${appliance.name} ran`}
                      value={h}
                      step={appliance.hoursPerDay >= 24 ? 1 : 0.25}
                      min={0}
                      max={24}
                      format={formatHours}
                      onChange={(value) => setHours((prev) => ({ ...prev, [appliance.id]: value }))}
                    />
                    <View style={s.quick}>
                      <Chip label="Off" selected={h === 0} onPress={() => setHours((prev) => ({ ...prev, [appliance.id]: 0 }))} />
                      <Chip label="Usual" selected={h === usual && usual > 0} onPress={() => setHours((prev) => ({ ...prev, [appliance.id]: appliance.hoursPerDay }))} />
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>

          <View style={s.footer}>
            <TextField
              label="Note (optional)"
              placeholder="e.g. Guests over, hot day, worked from home"
              value={note}
              onChangeText={setNote}
              maxLength={200}
            />
            <Button
              label={existing && isMeasured(existing) ? (changed ? 'Update log' : 'Saved') : `Save ${dateLabel.toLowerCase()}`}
              icon="check-circle-outline"
              onPress={save}
              loading={saving}
              disabled={Boolean(existing && isMeasured(existing) && !changed)}
              full
              size="lg"
            />
            {existing ? (
              <Button label="Delete this day's log" variant="danger" icon="trash-can-outline" onPress={removeLog} full size="sm" />
            ) : null}
          </View>
        </>
      ) : (
        <View style={s.meter}>
          <Card title="New reading" subtitle={lastReading ? `Last: ${lastReading.value} kWh on ${format(new Date(lastReading.takenAt), 'd MMM, HH:mm')}` : 'Your first reading starts the count.'} icon="counter" tone="info">
            <View style={s.meterForm}>
              <TextField
                label="Meter shows"
                placeholder={lastReading ? String(lastReading.value) : 'e.g. 15234.6'}
                keyboardType="decimal-pad"
                value={reading}
                onChangeText={(text) => { setReading(text); setReadingError(null); }}
                suffix="kWh"
                error={readingError}
                hint="Use the main kWh register. Ignore digits after a red mark or decimal point if unsure."
              />
              <Text style={s.fieldLabel}>Taken</Text>
              <View style={s.quick}>
                <Chip label="Just now" selected={readingWhen === 'now'} onPress={() => setReadingWhen('now')} />
                <Chip label="Yesterday evening" selected={readingWhen === 'yesterday'} onPress={() => setReadingWhen('yesterday')} />
              </View>
              <TextField label="Note (optional)" value={readingNote} onChangeText={setReadingNote} maxLength={120} placeholder="e.g. after holiday" />
              <Button label="Save reading" icon="content-save-outline" onPress={saveReading} loading={saving} disabled={!reading.trim()} full />
            </View>
          </Card>

          {meterUsage.size > 0 ? (
            <Card title="Measured days" subtitle="Usage between your readings, spread evenly over the days" icon="chart-timeline-variant" tone="primary">
              {[...meterUsage.entries()].reverse().slice(0, 10).map(([key, kWh], i, list) => (
                <ListRow
                  key={key}
                  title={format(parseDayKey(key), 'EEEE d MMM')}
                  subtitle={formatCost(kWh * settings.electricityRate, settings.currency)}
                  right={<Text style={s.rowValue}>{formatEnergy(kWh)}</Text>}
                  last={i === list.length - 1}
                />
              ))}
            </Card>
          ) : null}

          {sortedReadings.length > 0 ? (
            <Card title="Reading history" icon="history" tone="neutral">
              {sortedReadings.map((r, i) => (
                <ListRow
                  key={r.id}
                  title={`${r.value.toLocaleString()} kWh`}
                  subtitle={`${format(new Date(r.takenAt), 'EEE d MMM yyyy, HH:mm')}${r.note ? ` · ${r.note}` : ''}`}
                  right={(
                    <AccessibleTouchable label={`Delete reading ${r.value}`} onPress={() => removeReading(r.id, r.value)} style={s.iconButton}>
                      <Text style={s.deleteText}>Delete</Text>
                    </AccessibleTouchable>
                  )}
                  last={i === sortedReadings.length - 1}
                />
              ))}
            </Card>
          ) : (
            <Card title="How it works" icon="information-outline" tone="info">
              <Text style={s.help}>
                1. Find the kWh number on your electricity meter (it only ever goes up).{'\n'}
                2. Enter it here now, and again tomorrow at about the same time.{'\n'}
                3. SaveVolt turns the difference into real usage for each day, replacing estimates in your trends, goals and challenges.
              </Text>
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  modeSwitch: { marginTop: 18 },
  summary: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  summaryMain: { flex: 1 },
  summaryValue: { ...Typography.displayMedium, color: c.textOnDark, fontVariant: ['tabular-nums'] },
  summaryLabel: { ...Typography.bodySmall, color: c.textOnDarkSub, marginTop: 2 },
  deltaPill: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  deltaText: { ...Typography.label, color: c.onPrimary },

  days: { paddingHorizontal: Spacing.page, paddingTop: 16, gap: 8 },
  day: {
    width: 58, paddingVertical: 10, borderRadius: Radius.lg, alignItems: 'center', backgroundColor: c.card,
    borderWidth: 1, borderColor: c.cardBorder,
  },
  daySelected: { backgroundColor: c.primary, borderColor: c.primary },
  dayName: { ...Typography.labelSmall, color: c.textSecondary },
  dayNum: { ...Typography.h2, color: c.text, marginTop: 2 },
  dayTextSelected: { color: c.onPrimary },
  dayDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.page, marginTop: 14 },
  statusText: { flex: 1, ...Typography.bodySmall, color: c.textSecondary },

  list: { paddingHorizontal: Spacing.page, gap: 10 },
  deviceCard: { padding: 14 },
  deviceTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceInfo: { flex: 1 },
  deviceName: { ...Typography.h3, color: c.text },
  deviceMeta: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  deviceKwh: { alignItems: 'flex-end' },
  deviceKwhValue: { ...Typography.statSmall, color: c.text, fontVariant: ['tabular-nums'] },
  deviceDelta: { ...Typography.labelSmall, marginTop: 2 },
  deviceControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  quick: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  footer: { paddingHorizontal: Spacing.page, marginTop: 20, gap: 12 },

  meter: { paddingHorizontal: Spacing.page, marginTop: 18, gap: 14 },
  meterForm: { gap: 14 },
  fieldLabel: { ...Typography.label, color: c.text, marginBottom: -6 },
  rowValue: { ...Typography.statSmall, color: c.text },
  iconButton: { paddingHorizontal: 8 },
  deleteText: { ...Typography.label, color: c.dangerText },
  help: { ...Typography.bodyMedium, color: c.textSecondary, lineHeight: 22 },
});

export default DailyLogScreen;
