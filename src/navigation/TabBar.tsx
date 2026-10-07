import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Typography } from '../theme';
import AccessibleTouchable from '../components/AccessibleTouchable';
import { IconBubble, Sheet } from '../components/ui';
import { useEnergy } from '../context/EnergyContext';

const TAB_ICONS: Record<string, { focused: string; unfocused: string; label: string }> = {
  Home: { focused: 'home-variant', unfocused: 'home-variant-outline', label: 'Home' },
  Track: { focused: 'lightning-bolt-circle', unfocused: 'lightning-bolt-outline', label: 'Track' },
  Insights: { focused: 'chart-box', unfocused: 'chart-box-outline', label: 'Insights' },
  Goals: { focused: 'trophy', unfocused: 'trophy-outline', label: 'Goals' },
  Account: { focused: 'account-circle', unfocused: 'account-circle-outline', label: 'Me' },
};

interface QuickAction {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  tone: 'primary' | 'info' | 'accent' | 'warning' | 'success';
  tab: string;
  screen: string;
  params?: Record<string, unknown>;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'log', icon: 'calendar-check', title: 'Log today', subtitle: 'Confirm how long each device ran', tone: 'primary', tab: 'Track', screen: 'DailyLog' },
  { key: 'meter', icon: 'counter', title: 'Meter reading', subtitle: 'Enter the number on your electricity meter', tone: 'info', tab: 'Track', screen: 'DailyLog', params: { mode: 'meter' } },
  { key: 'add', icon: 'power-plug-outline', title: 'Add a device', subtitle: 'Register an appliance and its wattage', tone: 'success', tab: 'Track', screen: 'AddAppliance' },
  { key: 'switch', icon: 'toggle-switch-outline', title: 'Switch devices', subtitle: 'Pause or resume what you track', tone: 'warning', tab: 'Track', screen: 'Audit' },
  { key: 'ask', icon: 'robot-happy-outline', title: 'Ask Volt', subtitle: 'Questions, what-ifs and quick actions', tone: 'accent', tab: 'Account', screen: 'Chat' },
];

/**
 * Docked tab bar with a raised ⚡ button in the middle that opens quick actions, so the daily
 * loop (log, read the meter, ask) is one tap from anywhere.
 */
const TabBar = ({ state, navigation, descriptors, insets }: BottomTabBarProps) => {
  const s = useThemedStyles(createStyles);
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const { appliances } = useEnergy('appliances');
  const active = isDark ? colors.primary : colors.primaryDark;

  const go = (action: QuickAction) => {
    setOpen(false);
    const target = action.key === 'log' || action.key === 'meter' || action.key === 'switch'
      ? (appliances.length === 0 && action.key !== 'meter' ? { tab: 'Track', screen: 'AddAppliance' } : action)
      : action;
    navigation.navigate(target.tab, { screen: target.screen, params: 'params' in target ? target.params : undefined, initial: false });
  };

  const renderTab = (index: number) => {
    const route = state.routes[index];
    if (!route) return null;
    const focused = state.index === index;
    const meta = TAB_ICONS[route.name] ?? { focused: 'circle', unfocused: 'circle-outline', label: route.name };
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
      else if (focused) {
        // Tapping the active tab returns to its first screen
        const nested = route.state as { index?: number } | undefined;
        if (nested?.index) navigation.navigate(route.name, { screen: (route.state as { routeNames?: string[] }).routeNames?.[0] });
      }
    };
    return (
      <AccessibleTouchable
        key={route.key}
        label={descriptors[route.key]?.options.tabBarAccessibilityLabel ?? `${meta.label} tab`}
        role="tab"
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        style={s.tab}
      >
        {/* Keep the pill a stable native view: Android dropped its corner radius when the background toggled */}
        <View collapsable={false} style={[s.iconPill, focused ? s.iconPillOn : s.iconPillOff]}>
          <Icon name={focused ? meta.focused : meta.unfocused} size={23} color={focused ? active : colors.tabInactive}
            accessible={false} importantForAccessibility="no" />
        </View>
        <Text style={[s.label, { color: focused ? active : colors.tabInactive }]}>{meta.label}</Text>
      </AccessibleTouchable>
    );
  };

  return (
    <>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 10) }]}>
        {renderTab(0)}
        {renderTab(1)}
        <View style={s.fabSlot}>
          <AccessibleTouchable label="Quick actions" hint="Log today, add a meter reading, add a device or ask Volt" onPress={() => setOpen(true)} style={s.fabTouch}>
            <LinearGradient colors={colors.gradVolt} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fab}>
              <Icon name="lightning-bolt" size={30} color={colors.onPrimary} accessible={false} importantForAccessibility="no" />
            </LinearGradient>
          </AccessibleTouchable>
        </View>
        {renderTab(2)}
        {renderTab(3)}
        {renderTab(4)}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Quick actions" subtitle="What would you like to do?">
        {QUICK_ACTIONS.map((action) => (
          <AccessibleTouchable key={action.key} label={`${action.title}. ${action.subtitle}`} onPress={() => go(action)} style={s.action}>
            <IconBubble icon={action.icon} tone={action.tone} size={46} />
            <View style={s.actionText}>
              <Text style={s.actionTitle}>{action.title}</Text>
              <Text style={s.actionSubtitle}>{action.subtitle}</Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.textMuted} accessible={false} importantForAccessibility="no" />
          </AccessibleTouchable>
        ))}
      </Sheet>
    </>
  );
};

const createStyles = (c: ThemeColors, isDark: boolean) => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.tabBar,
    paddingTop: 8, paddingHorizontal: 6, // bottom padding follows the safe-area inset
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: c.border,
    shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 },
  iconPill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPillOn: { backgroundColor: c.primarySoft },
  iconPillOff: { backgroundColor: 'transparent' },
  label: { ...Typography.labelSmall, fontSize: 10.5, marginTop: 3 },
  fabSlot: { width: 72, alignItems: 'center' },
  fabTouch: { marginTop: -34, borderRadius: 34 },
  fab: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: c.tabBar,
    shadowColor: c.primary, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: Radius.lg,
    backgroundColor: c.surfaceMuted,
  },
  actionText: { flex: 1 },
  actionTitle: { ...Typography.h3, color: c.text },
  actionSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
});

export default TabBar;
