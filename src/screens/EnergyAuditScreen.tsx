import React, { useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { calculateApplianceConsumption, formatEnergy, formatCost } from '../utils/energy';
import { Typography, Spacing, Radius, Shadows } from '../theme';

type Impact = 'high' | 'medium' | 'low';

const IMPACT_LABELS: Record<Impact, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
};

const EnergyAuditScreen = ({ navigation }: any) => {
  const { appliances, toggleAppliance, deleteAppliance, settings } = useEnergy(
    'appliances',
    'toggleAppliance',
    'deleteAppliance',
    'settings',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const rate = settings.electricityRate;

  // Paused appliances use 0 kWh, so they sort to the bottom with a 0% share
  const rows = useMemo(() => {
    const withDaily = appliances
      .map((appliance) => ({ appliance, daily: calculateApplianceConsumption(appliance, 1) }))
      .sort((a, b) => b.daily - a.daily);
    const totalDaily = withDaily.reduce((sum, row) => sum + row.daily, 0);
    return withDaily.map(({ appliance, daily }) => {
      const share = totalDaily > 0 ? (daily / totalDaily) * 100 : 0;
      const impact: Impact = share >= 40 ? 'high' : share >= 20 ? 'medium' : 'low';
      return {
        appliance,
        daily,
        monthly: daily * 30,
        dailyCost: daily * rate,
        monthlyCost: daily * 30 * rate,
        impact,
      };
    });
  }, [appliances, rate]);

  const handleDelete = useCallback((id: string, name: string) =>
    Alert.alert('Remove Appliance', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteAppliance(id) },
    ]), [deleteAppliance]);

  if (appliances.length === 0) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          variant="screen"
          icon="📊"
          title="No appliances yet"
          body="Add your appliances to see an instant energy audit, ranked by how much each one uses."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the add appliance form',
            onPress: () => navigation.navigate('AddAppliance'),
          }}
        />
      </>
    );
  }

  const impactStyles = { high: s.highPriority, medium: s.mediumPriority, low: s.lowPriority };

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ENERGY AUDIT</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Live Analysis</Text>
        <Text style={s.headerSub}>Toggle appliances to see real-time impact</Text>
      </LinearGradient>
      <View style={s.body}>
        {rows.map(({ appliance, daily, monthly, dailyCost, monthlyCost, impact }, index) => (
          <View key={appliance.id} style={s.card}>
            <View style={s.cardTop}>
              <View
                style={s.cardLeft}
                accessible
                accessibilityLabel={`Rank ${index + 1}: ${appliance.name}, ${appliance.category}, ${
                  appliance.isActive ? IMPACT_LABELS[impact] : 'paused'
                }`}
              >
                <View style={[s.rank, index === 0 && s.rankFirst]}>
                  <Text style={[s.rankTxt, index === 0 && s.rankTxtFirst]}>{index + 1}</Text>
                </View>
                <View style={s.nameWrap}>
                  <Text style={s.name}>{appliance.name}</Text>
                  <View style={s.categoryRow}>
                    <Text style={s.cat}>{appliance.category}</Text>
                    <View style={[s.priorityBadge, impactStyles[impact]]}>
                      <Text style={s.priorityText}>{IMPACT_LABELS[impact]}</Text>
                    </View>
                  </View>
                </View>
              </View>
              <Switch
                value={appliance.isActive}
                onValueChange={() => toggleAppliance(appliance.id)}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={appliance.isActive ? colors.primary : colors.switchThumbOff}
                accessibilityLabel={`Track ${appliance.name}`}
                accessibilityHint="Paused appliances don't count toward your totals"
                accessibilityState={{ checked: appliance.isActive }}
              />
            </View>
            {appliance.isActive && (
              <>
                <View
                  style={s.specStrip}
                  accessible
                  accessibilityLabel={`Power ${appliance.powerRating} watts, ${appliance.hoursPerDay} hours per day, quantity ${appliance.quantity}`}
                >
                  {[{ l: 'Power', v: `${appliance.powerRating}W` }, { l: 'Hours', v: `${appliance.hoursPerDay}h` }, { l: 'Qty', v: `${appliance.quantity}` }].map(sp => (
                    <View key={sp.l} style={s.specItem}>
                      <Text style={s.specVal}>{sp.v}</Text>
                      <Text style={s.specLbl}>{sp.l}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.consumGrid}>
                  <View
                    style={s.consumCol}
                    accessible
                    accessibilityLabel={`Daily: ${formatEnergy(daily)}, ${formatCost(dailyCost, settings.currency)}`}
                  >
                    <Text style={s.consumTitle}>DAILY</Text>
                    <Text style={s.consumVal}>{formatEnergy(daily)}</Text>
                    <Text style={s.consumCost}>{formatCost(dailyCost, settings.currency)}</Text>
                  </View>
                  <View style={s.consumDiv} />
                  <View
                    style={s.consumCol}
                    accessible
                    accessibilityLabel={`Monthly: ${formatEnergy(monthly)}, ${formatCost(monthlyCost, settings.currency)}`}
                  >
                    <Text style={s.consumTitle}>MONTHLY</Text>
                    <Text style={s.consumVal}>{formatEnergy(monthly)}</Text>
                    <Text style={s.consumCost}>{formatCost(monthlyCost, settings.currency)}</Text>
                  </View>
                </View>
              </>
            )}
            {/* Edit and remove stay available while an appliance is paused */}
            <View style={s.actionRow}>
              <AccessibleTouchable
                label={`Edit ${appliance.name}`}
                style={s.editBtn}
                onPress={() => navigation.navigate('EditAppliance', { applianceId: appliance.id })}
                activeOpacity={0.7}
              >
                <Text style={s.editTxt}>Edit Details</Text>
              </AccessibleTouchable>
              <AccessibleTouchable
                label={`Remove ${appliance.name}`}
                hint="Asks for confirmation before removing"
                style={s.delBtn}
                onPress={() => handleDelete(appliance.id, appliance.name)}
                activeOpacity={0.7}
              >
                <Text style={s.delTxt}>Remove</Text>
              </AccessibleTouchable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => {
  // Neon green is too light for text on light surfaces; the deeper shade keeps the accent readable
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center' },
    headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
    headerTitle: { ...Typography.displaySmall, color: c.textOnDark, marginBottom: 6 },
    headerSub: { ...Typography.bodySmall, color: c.textOnDarkSub },
    body: { padding: Spacing.page },
    card: { backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.lg, marginBottom: 14, ...Shadows.md },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    rank: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.borderLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    rankFirst: { backgroundColor: c.primary },
    rankTxt: { ...Typography.labelSmall, color: c.textSecondary },
    rankTxtFirst: { color: c.onPrimary },
    nameWrap: { flex: 1 },
    name: { ...Typography.h3, color: c.text },
    categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
    cat: { ...Typography.bodySmall, color: c.textMuted },
    priorityBadge: { borderRadius: Radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
    highPriority: { backgroundColor: c.dangerSoft },
    mediumPriority: { backgroundColor: c.warningSoft },
    lowPriority: { backgroundColor: c.primarySoft },
    // Body text on the soft tints stays readable in both themes; the tint carries the meaning
    priorityText: { ...Typography.labelSmall, color: c.text, fontSize: 10 },
    specStrip: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: c.background, borderRadius: Radius.sm, paddingVertical: 12, marginTop: 14 },
    specItem: { alignItems: 'center' },
    specVal: { ...Typography.statSmall, color: c.text },
    specLbl: { ...Typography.labelSmall, color: c.textMuted, marginTop: 2 },
    consumGrid: { flexDirection: 'row', marginTop: 14, backgroundColor: c.background, borderRadius: Radius.sm, overflow: 'hidden' },
    consumCol: { flex: 1, alignItems: 'center', paddingVertical: 14 },
    consumDiv: { width: 1, backgroundColor: c.border },
    consumTitle: { ...Typography.overline, color: c.textMuted, marginBottom: 6 },
    consumVal: { ...Typography.stat, color: c.primaryText },
    consumCost: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    editBtn: { flex: 1, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center', backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryLight },
    editTxt: { ...Typography.label, color: c.primaryText },
    delBtn: { flex: 1, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center', backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerBorder },
    delTxt: { ...Typography.label, color: c.dangerText },
  });
};

export default EnergyAuditScreen;
