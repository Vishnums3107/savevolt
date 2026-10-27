import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ManagementPage, { ManagementButton, ManagementCard, ManagementInput, useManagementStyles } from '../components/ManagementPage';
import AccessibleTouchable from '../components/AccessibleTouchable';
import { calculateHybridSystem, HybridSystemInputs } from '../utils/hybridSystem';
import { Radius, Spacing, Typography } from '../theme';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';

const INITIAL_INPUTS: HybridSystemInputs = {
  dailyEnergyKwh: 48,
  peakLoadKw: 8,
  solarShare: 0.65,
  peakSunHours: 5,
  solarDerate: 0.8,
  biomassEnergyKwhPerKg: 4.2,
  biomassEfficiency: 0.28,
  batteryAutonomyDays: 1,
  batteryDepthOfDischarge: 0.8,
  generatorReserve: 0.2,
};

const PRESETS: { key: string; label: string; description: string; values: Partial<HybridSystemInputs> }[] = [
  { key: 'balanced', label: 'Balanced', description: 'A practical starting mix', values: { solarShare: 0.65, batteryAutonomyDays: 1 } },
  { key: 'solar', label: 'Solar-first', description: 'Less daily feedstock', values: { solarShare: 0.8, batteryAutonomyDays: 1.5 } },
  { key: 'biomass', label: 'Biomass-led', description: 'More dispatchable power', values: { solarShare: 0.4, batteryAutonomyDays: 0.5 } },
];

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const HybridRenewableScreen = () => {
  const [inputs, setInputs] = useState(INITIAL_INPUTS);
  const styles = useThemedStyles(createStyles);
  const form = useManagementStyles();
  const { colors } = useTheme();
  const result = useMemo(() => calculateHybridSystem(inputs), [inputs]);
  const solarPercent = Math.round(inputs.solarShare * 100);
  const biomassPercent = 100 - solarPercent;

  const update = (key: keyof HybridSystemInputs, value: string) => {
    setInputs(current => ({ ...current, [key]: parseNumber(value, current[key]) }));
  };

  const adjustSolarShare = (delta: number) => {
    setInputs(current => ({ ...current, solarShare: Math.min(0.9, Math.max(0.1, current.solarShare + delta)) }));
  };

  const applyPreset = (values: Partial<HybridSystemInputs>) => setInputs(current => ({ ...current, ...values }));

  return (
    <ManagementPage title="Solar + biomass" subtitle="Design a resilient mini-grid for a rural community with a live sizing model.">
      <ManagementCard>
        <View style={styles.sectionHeading}><View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View><Text style={form.heading}>Community demand</Text></View>
        <Text style={form.text}>Start with the energy the community needs each day and the largest simultaneous load.</Text>
        <ManagementInput label="Daily energy demand (kWh/day)" value={String(inputs.dailyEnergyKwh)} onChangeText={value => update('dailyEnergyKwh', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Peak load (kW)" value={String(inputs.peakLoadKw)} onChangeText={value => update('peakLoadKw', value)} keyboardType="decimal-pad" />
      </ManagementCard>

      <ManagementCard>
        <View style={styles.sectionHeading}><View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View><Text style={form.heading}>Choose the balance</Text></View>
        <Text style={form.text}>Solar reduces fuel handling. Biomass provides dispatchable power after sunset.</Text>
        <View style={styles.presetRow}>
          {PRESETS.map(preset => <AccessibleTouchable key={preset.key} label={`Use ${preset.label} scenario`} hint={preset.description} onPress={() => applyPreset(preset.values)} style={[styles.preset, inputs.solarShare === preset.values.solarShare && styles.presetActive]}><Text style={[styles.presetLabel, inputs.solarShare === preset.values.solarShare && styles.presetLabelActive]}>{preset.label}</Text></AccessibleTouchable>)}
        </View>
        <View style={styles.shareRow} accessibilityLabel={`Solar share ${Math.round(inputs.solarShare * 100)} percent`}>
          <Text style={styles.shareValue}>{solarPercent}%</Text>
          <View style={styles.shareCopy}><Text style={form.value}>Solar energy share</Text><Text style={form.text}>The rest is supplied by biomass.</Text></View>
        </View>
        <View style={styles.stepperRow}>
          <ManagementButton label="- 10%" onPress={() => adjustSolarShare(-0.1)} />
          <View style={styles.track}><View style={[styles.trackFill, { width: `${inputs.solarShare * 100}%` }]} /></View>
          <ManagementButton label="+ 10%" onPress={() => adjustSolarShare(0.1)} />
        </View>
        <ManagementInput label="Peak sun hours/day" value={String(inputs.peakSunHours)} onChangeText={value => update('peakSunHours', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Solar system derate (0-1)" value={String(inputs.solarDerate)} onChangeText={value => update('solarDerate', value)} keyboardType="decimal-pad" />
      </ManagementCard>

      <ManagementCard>
        <View style={styles.sectionHeading}><View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View><Text style={form.heading}>Local biomass and storage</Text></View>
        <Text style={form.text}>Use a measured feedstock estimate where possible. The model assumes a biomass generator, not direct combustion in homes.</Text>
        <ManagementInput label="Feedstock energy (kWh/kg)" value={String(inputs.biomassEnergyKwhPerKg)} onChangeText={value => update('biomassEnergyKwhPerKg', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Generator efficiency (0-1)" value={String(inputs.biomassEfficiency)} onChangeText={value => update('biomassEfficiency', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Battery autonomy (days)" value={String(inputs.batteryAutonomyDays)} onChangeText={value => update('batteryAutonomyDays', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Battery usable fraction (0-1)" value={String(inputs.batteryDepthOfDischarge)} onChangeText={value => update('batteryDepthOfDischarge', value)} keyboardType="decimal-pad" />
        <ManagementInput label="Generator reserve (0-1)" value={String(inputs.generatorReserve)} onChangeText={value => update('generatorReserve', value)} keyboardType="decimal-pad" />
      </ManagementCard>

      <View style={styles.resultHeader}><Text style={styles.resultEyebrow}>SYSTEM BLUEPRINT</Text><Text style={styles.resultTitle}>Recommended starting point</Text><Text style={styles.resultSub}>A renewable mini-grid sized for {inputs.dailyEnergyKwh} kWh of daily demand.</Text></View>
      <ManagementCard>
        <View style={styles.mixHeader}><Text style={form.heading}>Renewable mix</Text><Text style={styles.mixStatus}>{solarPercent >= 60 ? 'Solar-led' : 'Biomass-led'}</Text></View>
        <View style={styles.mixBar} accessibilityLabel={`${solarPercent} percent solar and ${biomassPercent} percent biomass`}><View style={[styles.solarBar, { width: `${solarPercent}%` }]} /><View style={[styles.biomassBar, { width: `${biomassPercent}%` }]} /></View>
        <View style={styles.legend}><Text style={styles.legendSolar}>Solar {solarPercent}%</Text><Text style={styles.legendBiomass}>Biomass {biomassPercent}%</Text></View>
        <Text style={form.text}>Solar supplies the daytime share. Biomass remains available for evening demand and resilience.</Text>
      </ManagementCard>
      <View style={styles.grid}>
        <Metric label="Solar array" value={`${result.solarCapacityKw} kW`} color={colors.warning} />
        <Metric label="Biomass power" value={`${result.biomassEnergyKwhPerDay} kWh/day`} color={colors.success} />
        <Metric label="Battery bank" value={`${result.batteryCapacityKwh} kWh`} color={colors.info} />
        <Metric label="Generator" value={`${result.generatorCapacityKw} kW`} color={colors.accent} />
      </View>

      <ManagementCard>
        <Text style={form.heading}>Operations forecast</Text>
        <View style={styles.forecastRow}><Text style={form.text}>Daily feedstock</Text><Text style={styles.forecastValue}>{result.biomassKgPerDay} kg</Text></View>
        <View style={styles.forecastRow}><Text style={form.text}>Annual solar output</Text><Text style={styles.forecastValue}>{result.annualSolarKwh.toLocaleString()} kWh</Text></View>
        <View style={styles.forecastRow}><Text style={form.text}>Annual feedstock</Text><Text style={styles.forecastValue}>{result.annualBiomassKg.toLocaleString()} kg</Text></View>
        <View style={styles.forecastRow}><Text style={form.text}>Diesel displaced</Text><Text style={styles.forecastValue}>{result.annualDieselLitresAvoided.toLocaleString()} L/year</Text></View>
        <View style={styles.forecastRow}><Text style={form.text}>CO2 avoided estimate</Text><Text style={styles.forecastValue}>{result.annualCo2AvoidedTons.toLocaleString()} t/year</Text></View>
      </ManagementCard>

      {result.warnings.length > 0 && <ManagementCard><Text style={form.heading}>Design checks</Text>{result.warnings.map(warning => <Text key={warning} style={styles.warning}>! {warning}</Text>)}</ManagementCard>}
      <ManagementButton label="Reset to baseline" onPress={() => setInputs(INITIAL_INPUTS)} />
      <Text style={styles.disclaimer}>Planning estimate only. Confirm resource surveys, seasonal demand, electrical protection, local regulations, and professional engineering requirements before construction.</Text>
    </ManagementPage>
  );
};

const Metric = ({ label, value, color }: { label: string; value: string; color: string }) => {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.metric}><View style={[styles.metricDot, { backgroundColor: color }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepBadge: { width: 26, height: 26, borderRadius: Radius.pill, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { ...Typography.label, color: c.primaryText },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  preset: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: c.border, borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 8, alignItems: 'center' },
  presetActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
  presetLabel: { ...Typography.labelSmall, color: c.textSecondary, textAlign: 'center' },
  presetLabelActive: { color: c.primaryText },
  shareRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  shareValue: { ...Typography.displaySmall, color: c.warning, width: 82 },
  shareCopy: { flex: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  track: { height: 8, flex: 1, backgroundColor: c.surfaceMuted, borderRadius: Radius.pill, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: c.warning, borderRadius: Radius.pill },
  resultHeader: { marginTop: Spacing.sm },
  resultEyebrow: { ...Typography.overline, color: c.primaryText },
  resultTitle: { ...Typography.h2, color: c.text, marginTop: 4 },
  resultSub: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 5 },
  mixHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mixStatus: { ...Typography.labelSmall, color: c.primaryText, backgroundColor: c.primarySoft, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  mixBar: { flexDirection: 'row', height: 14, borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.md, backgroundColor: c.surfaceMuted },
  solarBar: { height: '100%', backgroundColor: c.warning },
  biomassBar: { height: '100%', backgroundColor: c.success },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 },
  legendSolar: { ...Typography.labelSmall, color: c.warning },
  legendBiomass: { ...Typography.labelSmall, color: c.success },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: Spacing.sm },
  metric: { width: '48%', backgroundColor: c.card, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: c.cardBorder },
  metricDot: { width: 8, height: 8, borderRadius: Radius.pill, marginBottom: 10 },
  metricLabel: { ...Typography.labelSmall, color: c.textSecondary },
  metricValue: { ...Typography.h3, color: c.text, marginTop: 4 },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderLight },
  forecastValue: { ...Typography.label, color: c.primaryText },
  warning: { ...Typography.bodySmall, color: c.text, backgroundColor: c.warningSoft, padding: 10, borderRadius: Radius.sm, marginTop: 8 },
  disclaimer: { ...Typography.bodySmall, color: c.textMuted, lineHeight: 18, paddingHorizontal: 4, paddingBottom: 20 },
});

export default HybridRenewableScreen;