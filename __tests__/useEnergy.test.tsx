import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useEnergy } from '../src/context/EnergyContext';
import { EnergyStore, useEnergyStore } from '../src/store/energyStore';
import { Appliance, ApplianceCategory } from '../src/types';

const makeAppliance = (id: string): Appliance => ({
  id,
  name: `Appliance ${id}`,
  powerRating: 100,
  hoursPerDay: 1,
  quantity: 1,
  category: ApplianceCategory.OTHER,
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
});

const baseline = useEnergyStore.getState();

let renders = 0;
let lastValue: object | null = null;

const AppliancesProbe = () => {
  const value = useEnergy('appliances');
  renders += 1;
  lastValue = value;
  return null;
};

const AppliancesAndSettingsProbe = () => {
  const value = useEnergy('appliances', 'settings');
  renders += 1;
  lastValue = value;
  return null;
};

const WholeStoreProbe = () => {
  useEnergy();
  renders += 1;
  return null;
};

let tree: ReactTestRenderer | null = null;

const mount = async (element: React.ReactElement) => {
  await act(async () => {
    tree = create(element);
  });
};

const update = async (partial: Partial<EnergyStore>) => {
  await act(async () => {
    useEnergyStore.setState(partial);
  });
};

beforeEach(() => {
  useEnergyStore.setState(baseline, true);
  renders = 0;
  lastValue = null;
});

afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = null;
});

describe('useEnergy with selected keys', () => {
  it('returns only the requested keys', async () => {
    await mount(<AppliancesProbe />);

    expect(renders).toBe(1);
    expect(lastValue).toEqual({ appliances: [] });
  });

  it('does not re-render when an unrelated key changes', async () => {
    await mount(<AppliancesProbe />);

    await update({ streak: { currentStreak: 3, longestStreak: 3, lastActivityDate: '2026-01-14', totalDaysActive: 3 } });
    await update({ isWeatherLoading: true });
    await update({ settings: { ...baseline.settings, currency: '€' } });

    expect(renders).toBe(1);
  });

  it('re-renders when the selected key changes', async () => {
    await mount(<AppliancesProbe />);
    const appliances = [makeAppliance('a1')];

    await update({ appliances });

    expect(renders).toBe(2);
    expect(lastValue).toEqual({ appliances });
  });

  it('does not re-render when the selected key is set to the same reference', async () => {
    const appliances = [makeAppliance('a1')];
    useEnergyStore.setState({ appliances });
    await mount(<AppliancesProbe />);

    await update({ appliances });

    expect(renders).toBe(1);
  });

  it('re-renders for each of several selected keys but not for others', async () => {
    await mount(<AppliancesAndSettingsProbe />);

    await update({ settings: { ...baseline.settings, darkMode: true } });
    expect(renders).toBe(2);

    await update({ appliances: [makeAppliance('a1')] });
    expect(renders).toBe(3);

    await update({ reminders: [] });
    await update({ isLoading: false });
    expect(renders).toBe(3);
    expect(Object.keys(lastValue ?? {}).sort()).toEqual(['appliances', 'settings']);
  });
});

describe('useEnergy without keys', () => {
  it('re-renders on any store change', async () => {
    await mount(<WholeStoreProbe />);

    await update({ isWeatherLoading: true });

    expect(renders).toBe(2);
  });
});
