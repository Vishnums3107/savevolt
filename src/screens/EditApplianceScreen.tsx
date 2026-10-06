import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { ApplianceCategory } from '../types';
import { validateAppliance } from '../utils/energy';
import { Typography, Spacing, Radius, Shadows } from '../theme';

const CATEGORY_ICONS: Record<string, string> = {
  Lighting: '💡', Cooling: '❄️', Heating: '🔥', Kitchen: '🍳',
  Entertainment: '📺', Laundry: '👕', Office: '💻', Other: '🔌',
};

const CATEGORIES = Object.values(ApplianceCategory);

const EditApplianceScreen = ({ route, navigation }: any) => {
  const { applianceId } = route.params;
  const { appliances, updateAppliance, deleteAppliance } = useEnergy('appliances', 'updateAppliance', 'deleteAppliance');
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const appliance = useMemo(() => appliances.find((a) => a.id === applianceId), [appliances, applianceId]);

  const [name, setName] = useState('');
  const [powerRating, setPowerRating] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ApplianceCategory>(ApplianceCategory.OTHER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set on delete: the screen keeps rendering the form while it animates away instead of "not found"
  const [deletedName, setDeletedName] = useState<string | null>(null);

  useEffect(() => {
    if (appliance) {
      setName(appliance.name);
      setPowerRating(appliance.powerRating.toString());
      setHoursPerDay(appliance.hoursPerDay.toString());
      setQuantity(appliance.quantity.toString());
      setCategory(appliance.category);
    }
  }, [appliance]);

  if (!appliance && deletedName === null) {
    return (
      <>
        <FocusAwareStatusBar variant="surface" />
        <EmptyState
          variant="screen"
          icon="🔌"
          title="Appliance not found"
          body="It may have been removed."
          primaryAction={{ label: 'Go back', onPress: () => navigation.goBack() }}
        />
      </>
    );
  }

  const keyboardAppearance = isDark ? 'dark' : 'light';
  const title = appliance?.name ?? deletedName;

  const handleSave = async () => {
    if (!appliance) return;
    const data = {
      name: name.trim(), powerRating: parseFloat(powerRating),
      hoursPerDay: parseFloat(hoursPerDay), quantity: parseInt(quantity, 10),
      category, isActive: appliance.isActive,
    };
    const errors = validateAppliance(data);
    if (errors.length > 0) { Alert.alert('Validation Error', errors.join('\n')); return; }
    setIsSubmitting(true);
    try {
      await updateAppliance(applianceId, data);
      Alert.alert('Updated!', `${data.name} has been updated.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch { Alert.alert('Error', 'Failed to update appliance'); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = () => {
    if (!appliance) return;
    Alert.alert(
      'Delete Appliance',
      `Are you sure you want to delete "${appliance.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            // Leave first so the deletion never shows this screen's not-found state
            setDeletedName(appliance.name);
            navigation.goBack();
            deleteAppliance(applianceId).catch(() => Alert.alert('Error', 'Failed to delete appliance'));
          },
        },
      ],
    );
  };

  const isBusy = isSubmitting || deletedName !== null;

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <FocusAwareStatusBar variant="hero" />

      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>EDIT APPLIANCE</Text>
        <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
        <Text style={s.headerSub}>Update device details or remove it</Text>
      </LinearGradient>

      <View style={s.body}>
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

        {/* Save */}
        <AccessibleTouchable
          label={isSubmitting ? 'Saving changes' : 'Save changes'}
          onPress={handleSave}
          disabled={isBusy}
          accessibilityState={{ disabled: isBusy, busy: isSubmitting }}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.submitBtn}>
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.submitText}>Save Changes</Text>
            )}
          </LinearGradient>
        </AccessibleTouchable>

        {/* Delete */}
        <AccessibleTouchable
          label="Delete appliance"
          hint="Asks for confirmation before deleting"
          onPress={handleDelete}
          disabled={isBusy}
          accessibilityState={{ disabled: isBusy }}
          style={s.deleteBtn}
          activeOpacity={0.7}
        >
          <Text style={s.deleteText}>Delete Appliance</Text>
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
      marginTop: 24,
    },
    submitText: { ...Typography.h3, color: c.onPrimary },

    deleteBtn: {
      alignItems: 'center', paddingVertical: 16, marginTop: 12, marginBottom: 30,
      borderRadius: Radius.md, borderWidth: 1.5, borderColor: c.danger,
    },
    deleteText: { ...Typography.label, color: c.dangerText },
  });
};

export default EditApplianceScreen;
