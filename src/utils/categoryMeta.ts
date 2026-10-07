import { ApplianceCategory } from '../types';
import type { Tone } from '../components/ui';

/** Icon (MaterialCommunityIcons) and tone for each appliance category, shared by every screen. */
export const CATEGORY_META: Record<ApplianceCategory, { icon: string; tone: Tone; chartIndex: number }> = {
  [ApplianceCategory.LIGHTING]: { icon: 'lightbulb-on-outline', tone: 'warning', chartIndex: 3 },
  [ApplianceCategory.COOLING]: { icon: 'snowflake', tone: 'info', chartIndex: 2 },
  [ApplianceCategory.HEATING]: { icon: 'fire', tone: 'danger', chartIndex: 4 },
  [ApplianceCategory.KITCHEN]: { icon: 'fridge-outline', tone: 'success', chartIndex: 6 },
  [ApplianceCategory.ENTERTAINMENT]: { icon: 'television-classic', tone: 'accent', chartIndex: 1 },
  [ApplianceCategory.LAUNDRY]: { icon: 'washing-machine', tone: 'info', chartIndex: 7 },
  [ApplianceCategory.OFFICE]: { icon: 'laptop', tone: 'neutral', chartIndex: 5 },
  [ApplianceCategory.OTHER]: { icon: 'power-plug-outline', tone: 'primary', chartIndex: 0 },
};

export const categoryMeta = (category: ApplianceCategory | string) =>
  CATEGORY_META[category as ApplianceCategory] ?? CATEGORY_META[ApplianceCategory.OTHER];

/** Hours as "4 h", "1.5 h" or "45 min". */
export const formatHours = (hours: number): string => {
  if (hours > 0 && hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(hours * 4 % 1 === 0 ? 2 : 1).replace(/0$/, '')} h`;
};
