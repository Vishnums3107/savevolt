/**
 * Smoke tests for every screen: each one renders in light and dark mode, with an empty store, a
 * loading store and demo data, and keeps working when the data or theme changes while mounted
 * (which catches hooks called after an early return).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer, ReactTestRendererJSON } from 'react-test-renderer';
import { ThemeProvider } from '../src/context/ThemeContext';
import { themed, ThemeColors } from '../src/theme';
import { EnergyStore, useEnergyStore } from '../src/store/energyStore';
import { generateDemoData } from '../src/services/demo/demoDataGenerator';

type ScreenProps = Record<string, unknown>;
type ScreenComponent = React.ComponentType<ScreenProps>;

interface ScreenCase {
  name: string;
  /** Required lazily so a screen that fails to load only fails its own tests. */
  load: () => ScreenComponent;
  props?: ScreenProps;
  /**
   * 'follows-theme' (default): light and dark renders must use different colors.
   * 'always-dark': the screen deliberately ignores the theme, so both renders must match.
   * 'legacy': not reachable in the app and not themed; the color comparison is skipped.
   */
  theming?: 'follows-theme' | 'always-dark' | 'legacy';
}

const DEMO_APPLIANCE_ID = 'appliance-demo-3';

const SCREENS: ScreenCase[] = [
  { name: 'Dashboard', load: () => require('../src/screens/DashboardScreen').default },
  { name: 'UsageInput', load: () => require('../src/screens/UsageInputScreen').default },
  { name: 'EnergyAudit', load: () => require('../src/screens/EnergyAuditScreen').default },
  {
    name: 'EditAppliance (existing appliance)',
    load: () => require('../src/screens/EditApplianceScreen').default,
    props: { route: { params: { applianceId: DEMO_APPLIANCE_ID } } },
  },
  {
    name: 'EditAppliance (missing appliance)',
    load: () => require('../src/screens/EditApplianceScreen').default,
    props: { route: { params: { applianceId: 'appliance-that-was-deleted' } } },
  },
  { name: 'EnergyMap', load: () => require('../src/screens/EnergyMapScreen').default },
  { name: 'Recommendations', load: () => require('../src/screens/RecommendationsScreen').default },
  { name: 'Trends', load: () => require('../src/screens/TrendsScreen').default },
  { name: 'Tips', load: () => require('../src/screens/TipsScreen').default },
  { name: 'Reports', load: () => require('../src/screens/ReportsScreen').default },
  { name: 'Progress', load: () => require('../src/screens/ProgressScreen').default },
  { name: 'Challenges', load: () => require('../src/screens/ChallengesScreen').default },
  { name: 'CommunityGoals', load: () => require('../src/screens/CommunityGoalsScreen').default },
  { name: 'ImpactVisualizer', load: () => require('../src/screens/ImpactVisualizerScreen').default },
  { name: 'Leaderboard', load: () => require('../src/screens/LeaderboardScreen').default },
  { name: 'Chat', load: () => require('../src/screens/ChatScreen').default },
  { name: 'Reminders', load: () => require('../src/screens/RemindersScreen').default },
  { name: 'Settings', load: () => require('../src/screens/SettingsScreen').default },
  { name: 'Households', load: () => require('../src/screens/HouseholdsScreen').default },
  { name: 'AccountSync', load: () => require('../src/screens/AccountSyncScreen').default },
  { name: 'SmartHome', load: () => require('../src/screens/SmartHomeScreen').default },
  // Not registered in AppNavigator; still rendered so it cannot crash if it is wired up again
  { name: 'More', load: () => require('../src/screens/MoreScreen').default, theming: 'legacy' },
  ...(['track', 'insights', 'goals', 'profile'] as const).map((area) => ({
    name: `FeatureHub (${area})`,
    load: () => require('../src/screens/FeatureHubScreen').default,
    props: { area },
  })),
  {
    name: 'Onboarding',
    load: () => require('../src/screens/OnboardingScreen').default,
    props: { onComplete: jest.fn() },
    // Shown before the app is set up; intentionally dark in both themes
    theming: 'always-dark',
  },
];

type Theme = 'light' | 'dark';
type DataState = 'empty' | 'loading' | 'demo';

const THEMES: Theme[] = ['light', 'dark'];
const DATA_STATES: DataState[] = ['empty', 'loading', 'demo'];

// Wednesday 14 January 2026, midday local time
const NOW = new Date(2026, 0, 14, 12, 0, 0, 0);

// Clean store (state + actions) captured before any test touches it
const baseline: EnergyStore = useEnergyStore.getState();
const originalFetch = global.fetch;

const makeProps = (screen: ScreenCase): ScreenProps => ({
  navigation: {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  },
  route: { params: {} },
  ...screen.props,
});

/** Store contents for the demo state; dates are relative to the faked clock. */
const demoState = (): Partial<EnergyStore> => {
  // Pin the random usage variation so light and dark renders get identical data
  const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const { appliances, usageRecords } = generateDemoData();
  random.mockRestore();

  return {
    appliances,
    usageRecords,
    reminders: [
      {
        id: 'reminder-demo-1',
        title: 'Switch off the AC',
        message: 'Turn the bedroom AC off before you leave.',
        time: '08:30',
        days: [1, 3, 5],
        isActive: true,
        applianceId: DEMO_APPLIANCE_ID,
      },
      {
        id: 'reminder-demo-2',
        title: 'Run the washer off-peak',
        message: 'Start laundry after 21:00.',
        time: '21:00',
        days: [6],
        isActive: false,
      },
    ],
    goals: [
      {
        id: 'goal-demo-1',
        type: 'consumption',
        target: 400,
        currentValue: 0,
        deadline: '2026-02-13T12:00:00.000Z',
        isAchieved: false,
        createdAt: '2026-01-10T12:00:00.000Z',
      },
      {
        id: 'goal-demo-2',
        type: 'cost',
        target: 10,
        currentValue: 0,
        deadline: '2026-01-31T12:00:00.000Z',
        isAchieved: false,
        createdAt: '2026-01-01T12:00:00.000Z',
      },
    ],
    rooms: [
      { id: 'room-demo-1', name: 'Living Room', appliances: ['appliance-demo-1'], position: { x: 0, y: 0 } },
      { id: 'room-demo-2', name: 'Bedroom', appliances: [DEMO_APPLIANCE_ID], position: { x: 1, y: 0 } },
      { id: 'room-demo-3', name: 'Garage', appliances: [], position: { x: 0, y: 1 } },
    ],
    challenges: [
      {
        id: 'challenge-demo-1',
        title: 'No-AC weekend',
        description: 'Keep the AC off for the weekend.',
        type: 'energy',
        target: 20,
        currentProgress: 8,
        duration: 7,
        startDate: '2026-01-10T00:00:00.000Z',
        endDate: '2026-01-17T00:00:00.000Z',
        isCompleted: false,
        reward: 'Movie night',
        createdBy: 'self',
      },
      {
        id: 'challenge-demo-2',
        title: 'Lights out',
        description: 'Turn off unused lights.',
        type: 'streak',
        target: 5,
        currentProgress: 5,
        duration: 5,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-06T00:00:00.000Z',
        isCompleted: true,
        createdBy: 'self',
      },
    ],
    communityGoals: [
      {
        id: 'community-demo-1',
        title: 'Street savings',
        description: 'Save 500 kWh together this month.',
        targetEnergy: 500,
        currentEnergy: 120,
        participants: ['You', 'Sam'],
        deadline: '2026-01-31T00:00:00.000Z',
        isAchieved: false,
        createdAt: '2026-01-02T00:00:00.000Z',
        createdBy: 'You',
      },
    ],
    activeTimers: [
      {
        id: 'timer-demo-1',
        goalId: 'goal-demo-1',
        goalTitle: 'consumption goal',
        targetTime: '2026-01-20T12:00:00.000Z',
        currentTime: NOW.toISOString(),
        remainingHours: 144,
        remainingMinutes: 0,
        targetValue: 400,
        currentValue: 250,
        unit: 'kWh',
        isActive: true,
      },
    ],
    snapshots: [
      {
        id: 'snapshot-demo-1',
        date: '2026-01-13',
        energyConsumed: 12.5,
        moneySaved: 1.5,
        co2Avoided: 11.5,
        topSavingAction: 'Optimized Smart TV (Living Room)',
        streakDays: 4,
      },
    ],
    streak: { currentStreak: 5, longestStreak: 9, lastActivityDate: '2026-01-14', totalDaysActive: 21 },
    badges: baseline.badges.map((badge, index) =>
      index === 0 ? { ...badge, isEarned: true, earnedAt: '2026-01-10T09:00:00.000Z' } : badge,
    ),
    weatherData: {
      temperature: 4,
      condition: 'Cloudy',
      humidity: 70,
      season: 'winter',
      location: 'New York',
      source: 'live',
    },
  };
};

const applyStore = (data: DataState, theme: Theme) => {
  useEnergyStore.setState(baseline, true);
  useEnergyStore.setState({
    hasSeenOnboarding: true,
    isLoading: data === 'loading',
    isWeatherLoading: data === 'loading',
    settings: { ...baseline.settings, darkMode: theme === 'dark' },
    ...(data === 'demo' ? demoState() : {}),
  });
  if (data === 'demo') {
    useEnergyStore.getState().refreshDashboard();
  }
};

/** Runs pending macrotasks that are not faked (setImmediate) so promise chains settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const settle = async () => {
  await act(async () => {
    await flush();
    await flush();
  });
};

const mountScreen = async (screen: ScreenCase): Promise<ReactTestRenderer> => {
  const Screen = screen.load();
  const props = makeProps(screen);
  let tree: ReactTestRenderer | undefined;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <Screen {...props} />
      </ThemeProvider>,
    );
  });
  await settle();
  if (!tree) throw new Error(`${screen.name} did not mount`);
  return tree;
};

const unmountScreen = async (tree: ReactTestRenderer) => {
  // Fire intervals/animation frames once so their callbacks run while the screen is mounted
  await act(async () => {
    jest.runOnlyPendingTimers();
    await flush();
  });
  await act(async () => {
    tree.unmount();
  });
};

interface ColorUsage {
  /** Every color: style colors, gradient stops and *Color props */
  all: Set<string>;
  /** backgroundColor styles and gradient stops */
  surfaces: Set<string>;
  /** Text colors */
  text: Set<string>;
}

const collectColors = (
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null,
  usage: ColorUsage = { all: new Set(), surfaces: new Set(), text: new Set() },
): ColorUsage => {
  if (!node || typeof node === 'string') return usage;
  if (Array.isArray(node)) {
    node.forEach((child) => collectColors(child, usage));
    return usage;
  }

  const add = (value: unknown, ...targets: Set<string>[]) => {
    if (typeof value !== 'string') return;
    [usage.all, ...targets].forEach((set) => set.add(value.toUpperCase()));
  };
  const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined;
  Object.entries(style ?? {}).forEach(([key, value]) => {
    if (key === 'backgroundColor') add(value, usage.surfaces);
    else if (key === 'color' && node.type === 'Text') add(value, usage.text);
    else if (/color/i.test(key)) add(value);
  });
  Object.entries(node.props).forEach(([key, value]) => {
    if (key === 'colors' && Array.isArray(value)) value.forEach((stop) => add(stop, usage.surfaces));
    else if (/color/i.test(key)) {
      if (value && typeof value === 'object') Object.values(value).forEach((item) => add(item));
      else add(value);
    }
  });
  node.children?.forEach((child) => collectColors(child, usage));
  return usage;
};

const lightPalette = themed(false);
const darkValues = new Set(
  Object.values(themed(true)).flatMap((value) => (Array.isArray(value) ? value : [value])).map((v) => v.toUpperCase()),
);
/** Light-theme colors that never appear in the dark palette; painting them in dark mode is a bug. */
const lightOnly = (keys: (keyof ThemeColors)[]) =>
  keys.map((key) => String(lightPalette[key]).toUpperCase()).filter((value) => !darkValues.has(value));
const LIGHT_ONLY_SURFACES = lightOnly([
  'background', 'card', 'cardElevated', 'inputBg', 'border', 'borderLight', 'divider', 'skeleton', 'tabBar',
  'primarySoft', 'primaryLight', 'accentLight', 'accentSoft',
  'successSoft', 'warningSoft', 'dangerSoft', 'dangerBorder', 'infoSoft',
]);
const LIGHT_ONLY_TEXT = lightOnly(['text']);

/** Everything logged with console.error: React key/act/hook-order warnings, update loops, failed loads. */
let consoleErrors: string[] = [];

beforeAll(() => {
  global.fetch = jest.fn(() => Promise.reject(new Error('Network disabled in tests'))) as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  useEnergyStore.setState(baseline, true);
});

beforeEach(() => {
  // Fake the clock and timers; keep setImmediate/microtasks real so promises can settle
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'],
  });
  consoleErrors = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '));
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(SCREENS)('$name screen', (screen) => {
  it.each(
    THEMES.flatMap((theme) => DATA_STATES.map((data) => [theme, data] as const)),
  )('renders in %s mode with %s data', async (theme, data) => {
    applyStore(data, theme);

    const tree = await mountScreen(screen);
    expect(tree.toJSON()).not.toBeNull();
    await unmountScreen(tree);

    expect(consoleErrors).toEqual([]);
  });

  const colorsFor = async (theme: Theme, data: DataState) => {
    applyStore(data, theme);
    const tree = await mountScreen(screen);
    const colors = collectColors(tree.toJSON());
    await unmountScreen(tree);
    return colors;
  };

  const theming = screen.theming ?? 'follows-theme';

  (theming === 'legacy' ? it.skip : it)(
    theming === 'always-dark' ? 'looks the same in light and dark mode' : 'uses different colors in light and dark mode',
    async () => {
      const light = await colorsFor('light', 'demo');
      const dark = await colorsFor('dark', 'demo');

      expect(light.all.size).toBeGreaterThan(0);
      if (theming === 'always-dark') {
        expect([...dark.all].sort()).toEqual([...light.all].sort());
      } else {
        expect([...dark.all].sort()).not.toEqual([...light.all].sort());
      }
      expect(consoleErrors).toEqual([]);
    },
  );

  (theming === 'legacy' ? it.skip : it).each(DATA_STATES)(
    'does not paint light-only surfaces or text in dark mode (%s data)',
    async (data) => {
      const dark = await colorsFor('dark', data);

      expect([...dark.surfaces].filter((color) => LIGHT_ONLY_SURFACES.includes(color))).toEqual([]);
      expect([...dark.text].filter((color) => LIGHT_ONLY_TEXT.includes(color))).toEqual([]);
      expect(consoleErrors).toEqual([]);
    },
  );

  it('keeps working when data and theme change while mounted', async () => {
    applyStore('loading', 'light');
    const tree = await mountScreen(screen);

    const steps: (() => void)[] = [
      () => useEnergyStore.setState({ isLoading: false, isWeatherLoading: false }),
      () => {
        useEnergyStore.setState(demoState());
        useEnergyStore.getState().refreshDashboard();
      },
      () => useEnergyStore.setState({ settings: { ...useEnergyStore.getState().settings, darkMode: true } }),
      () => {
        useEnergyStore.setState({ appliances: [], usageRecords: [], reminders: [], goals: [], rooms: [] });
        useEnergyStore.getState().refreshDashboard();
      },
      () => useEnergyStore.setState({ settings: { ...useEnergyStore.getState().settings, darkMode: false } }),
    ];

    for (const step of steps) {
      await act(async () => {
        step();
      });
      await settle();
      expect(tree.toJSON()).not.toBeNull();
    }

    await unmountScreen(tree);
    expect(consoleErrors).toEqual([]);
  });
});
