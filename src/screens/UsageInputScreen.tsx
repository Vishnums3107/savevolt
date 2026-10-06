import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { ApplianceCategory } from '../types';
import { getDefaultAppliances, validateAppliance } from '../utils/energy';
import { Typography, Spacing, Radius, Shadows } from '../theme';

const CATEGORY_ICONS: Record<string, string> = {
  Lighting: '💡', Cooling: '❄️', Heating: '🔥', Kitchen: '🍳',
  Entertainment: '📺', Laundry: '👕', Office: '💻', Other: '🔌',
};

const CATEGORIES = Object.values(ApplianceCategory);
const PRESETS = getDefaultAppliances();
type Preset = (typeof PRESETS)[number];

const UsageInputScreen = () => {
  const { addAppliance, appliances } = useEnergy('addAppliance', 'appliances');
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [powerRating, setPowerRating] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ApplianceCategory>(ApplianceCategory.OTHER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const keyboardAppearance = isDark ? 'dark' : 'light';

  const handleSubmit = async () => {
    const data = {
      name: name.trim(), powerRating: parseFloat(powerRating),
      hoursPerDay: parseFloat(hoursPerDay), quantity: parseInt(quantity, 10),
      category, isActive: true,
    };
    const errors = validateAppliance(data);
    if (errors.length > 0) { Alert.alert('Validation Error', errors.join('\n')); return; }
    setIsSubmitting(true);
    try {
      await addAppliance(data);
      Alert.alert('Added!', `${data.name} is now being tracked.`);
      setName(''); setPowerRating(''); setHoursPerDay(''); setQuantity('1');
      setCategory(ApplianceCategory.OTHER);
    } catch { Alert.alert('Error', 'Failed to add appliance'); }
    finally { setIsSubmitting(false); }
  };

  const handlePresetSelect = (preset: Preset) => {
    setName(preset.name); setPowerRating(preset.powerRating.toString());
    setCategory(preset.category); setShowPresets(false);
  };

  const isPresetSelected = (preset: Preset) =>
    name === preset.name && powerRating === preset.powerRating.toString() && category === preset.category;

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <FocusAwareStatusBar variant="hero" />

      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ADD APPLIANCE</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Track New Device</Text>
        <Text style={s.headerSub}>Enter details to start monitoring energy usage</Text>
      </LinearGradient>

      <View style={s.body}>
        <View
          style={s.trackingStatus}
          accessible
          accessibilityLabel={`${appliances.length} ${appliances.length === 1 ? 'appliance' : 'appliances'} currently tracked`}
        >
          <Text style={s.trackingStatusValue}>{appliances.length}</Text>
          <Text style={s.trackingStatusText}>{appliances.length === 1 ? 'appliance currently tracked' : 'appliances currently tracked'}</Text>
        </View>
        {/* Presets toggle */}
        <AccessibleTouchable
          label={showPresets ? 'Hide quick presets' : 'Use quick presets'}
          hint="Common appliances that fill in the form for you"
          accessibilityState={{ expanded: showPresets }}
          style={s.presetToggle}
          onPress={() => setShowPresets(!showPresets)}
          activeOpacity={0.8}
        >
          <Text style={s.presetToggleIcon}>⚡</Text>
          <Text style={s.presetToggleText}>
            {showPresets ? 'Hide Quick Presets' : 'Use Quick Presets'}
          </Text>
        </AccessibleTouchable>

        {showPresets && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.presetScroll}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="radiogroup"
            accessibilityLabel="Quick presets"
          >
            {PRESETS.map((p) => {
              const selected = isPresetSelected(p);
              return (
                <AccessibleTouchable
                  key={p.id}
                  role="radio"
                  label={`${p.name}, ${p.powerRating} watts`}
                  hint="Fills in the name, power rating and category"
                  accessibilityState={{ checked: selected }}
                  style={[s.presetChip, selected && s.presetChipActive]}
                  onPress={() => handlePresetSelect(p)}
                  activeOpacity={0.7}
                >
                  <Text style={s.presetIcon}>{CATEGORY_ICONS[p.category] || '🔌'}</Text>
                  <Text style={s.presetName}>{p.name}</Text>
                  <Text style={s.presetWatt}>{p.powerRating}W</Text>
                </AccessibleTouchable>
              );
            })}
          </ScrollView>
        )}

        {/* Form — visible labels are hidden from screen readers because each input carries its own */}
        <View style={s.formCard}>
          <Text style={s.label} accessible={false} importantForAccessibility="no">Appliance Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName}
            placeholder="e.g., Air Conditioner" placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Appliance name" />

          <Text style={s.label} accessible={false} importantForAccessibility="no">Power Rating (Watts)</Text>
          <TextInput style={s.input} value={powerRating} onChangeText={setPowerRating}
            keyboardType="decimal-pad" placeholder="e.g., 1500" placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Power rating in watts"
            accessibilityHint="Usually printed on the appliance label, for example 1500" />

          <Text style={s.label} accessible={false} importantForAccessibility="no">Hours Used Per Day</Text>
          <TextInput style={s.input} value={hoursPerDay} onChangeText={setHoursPerDay}
            keyboardType="decimal-pad" placeholder="e.g., 8" placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Hours used per day"
            accessibilityHint="Hours, from 0 to 24" />

          <Text style={s.label} accessible={false} importantForAccessibility="no">Quantity</Text>
          <TextInput style={s.input} value={quantity} onChangeText={setQuantity}
            keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Quantity"
            accessibilityHint="Number of identical units" />

          <Text style={s.label} accessible={false} importantForAccessibility="no">Category</Text>
          <View style={s.catGrid} accessibilityRole="radiogroup" accessibilityLabel="Category">
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <AccessibleTouchable
                  key={cat}
                  role="radio"
                  label={`${cat} category`}
                  accessibilityState={{ checked: selected }}
                  style={[s.catChip, selected && s.catChipActive]}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={s.catIcon}>{CATEGORY_ICONS[cat] || '🔌'}</Text>
                  <Text style={[s.catLabel, selected && s.catLabelActive]}>{cat}</Text>
                </AccessibleTouchable>
              );
            })}
          </View>
        </View>

        {/* Submit */}
        <AccessibleTouchable
          label={isSubmitting ? 'Adding appliance' : 'Add appliance'}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.submitBtn}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.submitText}>Add Appliance</Text>
            )}
          </LinearGradient>
        </AccessibleTouchable>
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
    headerSub: { ...Typography.bodySmall, color: c.textOnDarkSub, textAlign: 'center' },

    body: { padding: Spacing.page, marginTop: -10 },
    trackingStatus: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 16 },
    trackingStatusValue: { ...Typography.statSmall, color: c.primaryText, marginRight: 6 },
    trackingStatusText: { ...Typography.bodySmall, color: c.textMuted },

    presetToggle: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.card, borderRadius: Radius.pill, paddingVertical: 12,
      marginBottom: 16, ...Shadows.sm,
    },
    presetToggleIcon: { fontSize: 18, marginRight: 8 },
    presetToggleText: { ...Typography.label, color: c.primaryText },
    presetScroll: { marginBottom: 16 },
    presetChip: {
      backgroundColor: c.card, borderRadius: Radius.md, padding: 14,
      marginRight: 10, alignItems: 'center', width: 100, ...Shadows.sm,
      borderWidth: 1.5, borderColor: 'transparent',
    },
    presetChipActive: { borderColor: c.primary },
    presetIcon: { fontSize: 28, marginBottom: 6 },
    presetName: { ...Typography.labelSmall, color: c.text, textAlign: 'center' },
    presetWatt: { ...Typography.bodySmall, color: c.textMuted, marginTop: 2 },

    formCard: {
      backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.xl, ...Shadows.md,
    },
    label: { ...Typography.label, color: c.textSecondary, marginBottom: 6, marginTop: 16 },
    input: {
      backgroundColor: c.inputBg, borderRadius: Radius.sm, padding: 14,
      ...Typography.bodyLarge, color: c.text, borderWidth: 1, borderColor: c.border,
    },

    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    catChip: {
      paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.pill,
      borderWidth: 1.5, borderColor: c.border, flexDirection: 'row', alignItems: 'center',
    },
    catChipActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    catIcon: { fontSize: 16, marginRight: 6 },
    catLabel: { ...Typography.labelSmall, color: c.textSecondary },
    catLabelActive: { color: c.primaryText },

    submitBtn: {
      borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center',
      marginTop: 24, marginBottom: 30,
    },
    submitText: { ...Typography.h3, color: c.onPrimary },
  });
};

export default UsageInputScreen;
