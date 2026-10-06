import React, { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { BottomTabNavigationOptions, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, StackNavigationOptions } from '@react-navigation/stack';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Shadows, Typography } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import UsageInputScreen from '../screens/UsageInputScreen';
import EnergyAuditScreen from '../screens/EnergyAuditScreen';
import TrendsScreen from '../screens/TrendsScreen';
import TipsScreen from '../screens/TipsScreen';
import ChatScreen from '../screens/ChatScreen';
import ProgressScreen from '../screens/ProgressScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EnergyMapScreen from '../screens/EnergyMapScreen';
import CommunityGoalsScreen from '../screens/CommunityGoalsScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import ImpactVisualizerScreen from '../screens/ImpactVisualizerScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import RecommendationsScreen from '../screens/RecommendationsScreen';
import FeatureHubScreen from '../screens/FeatureHubScreen';
import RemindersScreen from '../screens/RemindersScreen';
import EditApplianceScreen from '../screens/EditApplianceScreen';
import HouseholdsScreen from '../screens/HouseholdsScreen';
import AccountSyncScreen from '../screens/AccountSyncScreen';
import SmartHomeScreen from '../screens/SmartHomeScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

type TabName = 'Home' | 'Track' | 'Insights' | 'Goals' | 'Account';

const TAB_ICONS: Record<TabName, { focused: string; unfocused: string }> = {
  Home: { focused: 'home-variant', unfocused: 'home-variant-outline' },
  Track: { focused: 'plus-circle', unfocused: 'plus-circle-outline' },
  Insights: { focused: 'chart-donut', unfocused: 'chart-donut' },
  Goals: { focused: 'trophy', unfocused: 'trophy-outline' },
  Account: { focused: 'account-circle', unfocused: 'account-circle-outline' },
};

/** Active tab tint: the brighter green reads better on the dark tab bar. */
const activeTabColor = (c: ThemeColors, isDark: boolean) => (isDark ? c.primary : c.primaryDark);

const createTabStyles = (c: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    bar: {
      height: 68,
      paddingBottom: 9,
      paddingTop: 7,
      backgroundColor: c.tabBar,
      // The dark bar is close to the background, so a hairline keeps it separated
      borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderTopColor: c.border,
      ...Shadows.lg,
    },
    label: { ...Typography.labelSmall, fontSize: 10, letterSpacing: 0.2 },
    iconWrap: { alignItems: 'center', justifyContent: 'center' },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: activeTabColor(c, isDark) },
  });

const TabIcon = ({ name, focused, color }: { name: TabName; focused: boolean; color: string }) => {
  const s = useThemedStyles(createTabStyles);
  return (
    <View style={s.iconWrap}>
      <Icon
        name={focused ? TAB_ICONS[name].focused : TAB_ICONS[name].unfocused}
        size={24}
        color={color}
        accessible={false}
        importantForAccessibility="no"
      />
      {focused && <View style={s.dot} />}
    </View>
  );
};

const tabOptions = (name: TabName): BottomTabNavigationOptions => ({
  tabBarLabel: name,
  tabBarAccessibilityLabel: `${name} tab`,
  tabBarIcon: ({ focused, color }) => <TabIcon name={name} focused={focused} color={color} />,
});

const TAB_OPTIONS: Record<TabName, BottomTabNavigationOptions> = {
  Home: tabOptions('Home'),
  Track: tabOptions('Track'),
  Insights: tabOptions('Insights'),
  Goals: tabOptions('Goals'),
  Account: tabOptions('Account'),
};

const createStackStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backButton: {
      width: 36,
      height: 36,
      marginLeft: 16,
      marginTop: 4,
      borderRadius: Radius.pill,
      backgroundColor: c.backButtonBg,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadows.sm,
    },
  });

// Extends the 36pt visual button to a 44pt touch target
const BACK_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

const BackButton = ({ navigation }: { navigation: { goBack: () => void } }) => {
  const s = useThemedStyles(createStackStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={s.backButton}
      activeOpacity={0.75}
      hitSlop={BACK_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Icon
        name="chevron-left"
        size={26}
        color={colors.text}
        accessible={false}
        importantForAccessibility="no"
      />
    </TouchableOpacity>
  );
};

const sharedStackOptions = ({ navigation }: { navigation: { goBack: () => void } }): StackNavigationOptions => ({
  headerTransparent: true,
  headerTitle: '',
  headerShadowVisible: false,
  headerLeft: () => <BackButton navigation={navigation} />,
});

const HomeStack = () => (
  <Stack.Navigator screenOptions={sharedStackOptions}>
    <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
  </Stack.Navigator>
);

const TrackHome = ({ navigation }: any) => <FeatureHubScreen area="track" navigation={navigation} />;
const InsightsHome = ({ navigation }: any) => <FeatureHubScreen area="insights" navigation={navigation} />;
const GoalsHome = ({ navigation }: any) => <FeatureHubScreen area="goals" navigation={navigation} />;
const AccountHome = ({ navigation }: any) => <FeatureHubScreen area="profile" navigation={navigation} />;

const TrackStack = () => (
  <Stack.Navigator screenOptions={sharedStackOptions}>
    <Stack.Screen name="TrackHome" component={TrackHome} options={{ headerShown: false }} />
    <Stack.Screen name="AddAppliance" component={UsageInputScreen} />
    <Stack.Screen name="Audit" component={EnergyAuditScreen} />
    <Stack.Screen name="EditAppliance" component={EditApplianceScreen} />
    <Stack.Screen name="Map" component={EnergyMapScreen} />
    <Stack.Screen name="SmartHome" component={SmartHomeScreen} />
  </Stack.Navigator>
);

const InsightsStack = () => (
  <Stack.Navigator screenOptions={sharedStackOptions}>
    <Stack.Screen name="InsightsHome" component={InsightsHome} options={{ headerShown: false }} />
    <Stack.Screen name="Recommendations" component={RecommendationsScreen} />
    <Stack.Screen name="Trends" component={TrendsScreen} />
    <Stack.Screen name="Tips" component={TipsScreen} />
    <Stack.Screen name="Reports" component={ReportsScreen} />
  </Stack.Navigator>
);

const GoalsStack = () => (
  <Stack.Navigator screenOptions={sharedStackOptions}>
    <Stack.Screen name="GoalsHome" component={GoalsHome} options={{ headerShown: false }} />
    <Stack.Screen name="Progress" component={ProgressScreen} />
    <Stack.Screen name="Challenges" component={ChallengesScreen} />
    <Stack.Screen name="Community" component={CommunityGoalsScreen} />
    <Stack.Screen name="Impact" component={ImpactVisualizerScreen} />
    <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
  </Stack.Navigator>
);

const AccountStack = () => (
  <Stack.Navigator screenOptions={sharedStackOptions}>
    <Stack.Screen name="AccountHome" component={AccountHome} options={{ headerShown: false }} />
    <Stack.Screen name="Chat" component={ChatScreen} />
    <Stack.Screen name="Reminders" component={RemindersScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Households" component={HouseholdsScreen} />
    <Stack.Screen name="AccountSync" component={AccountSyncScreen} />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createTabStyles);

  // Stack cards and tab scenes paint theme.colors.background, so matching it avoids a white
  // flash behind transitions in dark mode.
  const navigationTheme = useMemo<Theme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, isDark]);

  const tabScreenOptions = useMemo<BottomTabNavigationOptions>(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: activeTabColor(colors, isDark),
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: s.bar,
      tabBarLabelStyle: s.label,
    }),
    [colors, isDark, s],
  );

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen name="Home" component={HomeStack} options={TAB_OPTIONS.Home} />
        <Tab.Screen name="Track" component={TrackStack} options={TAB_OPTIONS.Track} />
        <Tab.Screen name="Insights" component={InsightsStack} options={TAB_OPTIONS.Insights} />
        <Tab.Screen name="Goals" component={GoalsStack} options={TAB_OPTIONS.Goals} />
        <Tab.Screen name="Account" component={AccountStack} options={TAB_OPTIONS.Account} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
