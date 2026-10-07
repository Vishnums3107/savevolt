import React, { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { BottomTabNavigationOptions, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, StackNavigationOptions } from '@react-navigation/stack';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Shadows } from '../theme';
import TabBar from './TabBar';
import StatusBarBackdrop from '../components/StatusBarBackdrop';
import DailyLogScreen from '../screens/DailyLogScreen';

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

const TAB_OPTIONS: Record<TabName, BottomTabNavigationOptions> = {
  Home: { tabBarAccessibilityLabel: 'Home tab' },
  Track: { tabBarAccessibilityLabel: 'Track tab' },
  Insights: { tabBarAccessibilityLabel: 'Insights tab' },
  Goals: { tabBarAccessibilityLabel: 'Goals tab' },
  Account: { tabBarAccessibilityLabel: 'Me tab' },
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
    <Stack.Screen name="DailyLog" component={DailyLogScreen} />
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

const renderTabBar = (props: React.ComponentProps<typeof TabBar>) => <TabBar {...props} />;

const AppNavigator = () => {
  const { colors, isDark } = useTheme();

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

  const tabScreenOptions = useMemo<BottomTabNavigationOptions>(() => ({ headerShown: false }), []);

  return (
    <>
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator screenOptions={tabScreenOptions} tabBar={renderTabBar}>
          <Tab.Screen name="Home" component={HomeStack} options={TAB_OPTIONS.Home} />
          <Tab.Screen name="Track" component={TrackStack} options={TAB_OPTIONS.Track} />
          <Tab.Screen name="Insights" component={InsightsStack} options={TAB_OPTIONS.Insights} />
          <Tab.Screen name="Goals" component={GoalsStack} options={TAB_OPTIONS.Goals} />
          <Tab.Screen name="Account" component={AccountStack} options={TAB_OPTIONS.Account} />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBarBackdrop />
    </>
  );
};

export default AppNavigator;
