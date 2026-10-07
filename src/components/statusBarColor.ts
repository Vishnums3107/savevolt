import { create } from 'zustand';

/**
 * The background the focused screen wants behind the status bar. Android 15+ draws every app
 * edge-to-edge and ignores StatusBar.backgroundColor, so StatusBarBackdrop paints it instead.
 * Each FocusAwareStatusBar claims it while focused; a release only clears its own claim, so a
 * screen blurring after the next one focused cannot wipe the new colour.
 */
interface StatusBarColorState {
  owner: number | null;
  color: string | null;
  claim: (owner: number, color: string) => void;
  release: (owner: number) => void;
}

export const useStatusBarColor = create<StatusBarColorState>((set, get) => ({
  owner: null,
  color: null,
  claim: (owner, color) => set({ owner, color }),
  release: (owner) => {
    if (get().owner === owner) set({ owner: null, color: null });
  },
}));

let nextOwner = 1;
export const newStatusBarOwner = () => nextOwner++;
