import React, { ReactNode, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EnergyStore, useEnergyStore } from '../store/energyStore';

export const EnergyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const loadAllData = useEnergyStore((state) => state.loadAllData);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // State lives in the Zustand store; this provider only triggers the initial load.
  return <>{children}</>;
};

const pick = <K extends keyof EnergyStore>(state: EnergyStore, keys: K[]): Pick<EnergyStore, K> => {
  const picked = {} as Pick<EnergyStore, K>;
  for (const key of keys) {
    picked[key] = state[key];
  }
  return picked;
};

/**
 * Reads from the energy store.
 *
 * Pass the keys a component uses so it only re-renders when those change:
 *   const { appliances, settings } = useEnergy('appliances', 'settings');
 *
 * Calling it with no keys returns the whole store and re-renders on every change.
 */
export function useEnergy(): EnergyStore;
export function useEnergy<K extends keyof EnergyStore>(...keys: K[]): Pick<EnergyStore, K>;
export function useEnergy<K extends keyof EnergyStore>(...keys: K[]) {
  return useEnergyStore(
    useShallow((state: EnergyStore) => (keys.length === 0 ? state : pick(state, keys))),
  );
}
