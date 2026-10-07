import { Appliance, EnergyTip, ApplianceCategory, EnergyConsumption } from '../types';
import { applianceDailyKwh } from './analytics';

/**
 * Personal tips built from the user's own appliances. Every tip has a stable id
 * (`rule:applianceId`), so marking it done or dismissing it survives refreshes, and its saving
 * is a share of the kWh that appliance actually uses, not a fixed number.
 */

const monthlyKwh = (appliance: Appliance) => (appliance.isActive ? applianceDailyKwh(appliance) * 30 : 0);

const nameHas = (appliance: Appliance, pattern: RegExp) => pattern.test(appliance.name.toLowerCase());

const categoryMonthly = (appliances: Appliance[], category: ApplianceCategory) =>
  appliances.filter((a) => a.category === category).reduce((sum, a) => sum + monthlyKwh(a), 0);

export const generateEnergyTips = (
  appliances: Appliance[],
  consumptions: EnergyConsumption[]
): EnergyTip[] => {
  const tips: EnergyTip[] = [];
  const active = appliances.filter((a) => a.isActive);
  const sorted = [...consumptions].filter((c) => c.dailyConsumption > 0)
    .sort((a, b) => b.dailyConsumption - a.dailyConsumption);
  const totalMonthly = active.reduce((sum, a) => sum + monthlyKwh(a), 0);

  // Top three consumers get a tip tailored to what they are
  sorted.slice(0, 3).forEach((consumption) => {
    const appliance = appliances.find((a) => a.id === consumption.applianceId);
    if (!appliance) return;
    const monthly = consumption.monthlyConsumption;
    const id = (rule: string) => `tip:${rule}:${appliance.id}`;

    switch (appliance.category) {
      case ApplianceCategory.COOLING:
        if (appliance.powerRating >= 800) {
          tips.push({
            id: id('ac-setpoint'),
            title: `Set ${appliance.name} to 25°C`,
            description: `${appliance.name} uses about ${monthly.toFixed(0)} kWh a month. Each degree warmer cuts cooling energy by roughly 6%; going from 22°C to 25°C and using the sleep timer saves about 18%.`,
            category: ApplianceCategory.COOLING,
            potentialSavings: monthly * 0.18,
            priority: 'high',
            isPersonalized: true,
          });
        } else {
          tips.push({
            id: id('fan-off'),
            title: `Switch ${appliance.name} off in empty rooms`,
            description: `Fans cool people, not rooms. Turning ${appliance.name} off when nobody is there trims about 20% of its ${monthly.toFixed(1)} kWh a month.`,
            category: ApplianceCategory.COOLING,
            potentialSavings: monthly * 0.2,
            priority: 'medium',
            isPersonalized: true,
          });
        }
        break;

      case ApplianceCategory.LIGHTING:
        if (appliance.powerRating > 15) {
          const ledWatts = Math.max(Math.round(appliance.powerRating * 0.15), 5);
          tips.push({
            id: id('led-swap'),
            title: `Swap ${appliance.name} for LEDs`,
            description: `A ${ledWatts} W LED gives the same light as your ${appliance.powerRating} W bulb${appliance.quantity > 1 ? 's' : ''}, cutting ${appliance.name}'s energy by about ${Math.round((1 - ledWatts / appliance.powerRating) * 100)}%.`,
            category: ApplianceCategory.LIGHTING,
            potentialSavings: monthly * (1 - ledWatts / appliance.powerRating),
            priority: 'high',
            isPersonalized: true,
          });
        } else {
          tips.push({
            id: id('lights-daylight'),
            title: `Use daylight instead of ${appliance.name}`,
            description: `You already use efficient bulbs. Opening blinds and switching ${appliance.name} off for one daylight hour saves ${((appliance.powerRating * appliance.quantity * 30) / 1000).toFixed(1)} kWh a month.`,
            category: ApplianceCategory.LIGHTING,
            potentialSavings: (appliance.powerRating * appliance.quantity * 30) / 1000,
            priority: 'low',
            isPersonalized: true,
          });
        }
        break;

      case ApplianceCategory.HEATING:
        tips.push({
          id: id(nameHas(appliance, /water|geyser|boiler/) ? 'heater-temp' : 'heating-schedule'),
          title: nameHas(appliance, /water|geyser|boiler/)
            ? `Lower ${appliance.name} to 50°C`
            : `Put ${appliance.name} on a schedule`,
          description: nameHas(appliance, /water|geyser|boiler/)
            ? `Water heated to 60°C+ loses heat all day. Setting ${appliance.name} to 50°C and switching it on 30 minutes before use saves about 20% of ${monthly.toFixed(0)} kWh.`
            : `Heat only the hours you are home: a timer on ${appliance.name} typically saves 20% of ${monthly.toFixed(0)} kWh a month.`,
          category: ApplianceCategory.HEATING,
          potentialSavings: monthly * 0.2,
          priority: 'high',
          isPersonalized: true,
        });
        break;

      case ApplianceCategory.KITCHEN:
        if (nameHas(appliance, /fridge|refrigerator|freezer/)) {
          tips.push({
            id: id('fridge-care'),
            title: `Tune up ${appliance.name}`,
            description: 'Clean the rear coils, check the door seal with a sheet of paper, and keep it at 4°C (freezer −18°C). Together that recovers around 10% of its energy.',
            category: ApplianceCategory.KITCHEN,
            potentialSavings: monthly * 0.1,
            priority: 'medium',
            isPersonalized: true,
          });
        } else {
          tips.push({
            id: id('kitchen-lids'),
            title: `Cook smarter with ${appliance.name}`,
            description: `Lids on pans, batch cooking and the microwave for reheating use far less energy than an oven. Aim for 15% less ${appliance.name} time.`,
            category: ApplianceCategory.KITCHEN,
            potentialSavings: monthly * 0.15,
            priority: 'medium',
            isPersonalized: true,
          });
        }
        break;

      case ApplianceCategory.LAUNDRY:
        tips.push({
          id: id('cold-wash'),
          title: `Wash cold with ${appliance.name}`,
          description: 'About 90% of a washer\'s energy heats water. Washing at 30°C and running full loads cuts its energy by around 40%.',
          category: ApplianceCategory.LAUNDRY,
          potentialSavings: monthly * 0.4,
          priority: 'medium',
          isPersonalized: true,
        });
        break;

      case ApplianceCategory.ENTERTAINMENT:
        tips.push({
          id: id('screen-eco'),
          title: `Turn on eco mode for ${appliance.name}`,
          description: 'Eco picture mode and lower brightness use 20–30% less power, and a sleep timer stops it running to an empty room.',
          category: ApplianceCategory.ENTERTAINMENT,
          potentialSavings: monthly * 0.25,
          priority: 'medium',
          isPersonalized: true,
        });
        break;

      case ApplianceCategory.OFFICE:
        tips.push({
          id: id('sleep-settings'),
          title: `Let ${appliance.name} sleep`,
          description: 'Set sleep after 10 idle minutes and switch the power strip off at night. Idle computers and monitors waste about 15% of their use.',
          category: ApplianceCategory.OFFICE,
          potentialSavings: monthly * 0.15,
          priority: 'low',
          isPersonalized: true,
        });
        break;

      default:
        break;
    }
  });

  // Long-running devices that are not meant to run all day
  active.forEach((appliance) => {
    if (appliance.hoursPerDay > 12 && appliance.hoursPerDay < 24 && appliance.category !== ApplianceCategory.KITCHEN) {
      const cut = Math.min(3, appliance.hoursPerDay - 10);
      tips.push({
        id: `tip:long-hours:${appliance.id}`,
        title: `Run ${appliance.name} ${cut} h less`,
        description: `${appliance.name} runs ${appliance.hoursPerDay} hours a day. Cutting ${cut} hours saves ${((appliance.powerRating * appliance.quantity * cut * 30) / 1000).toFixed(1)} kWh a month.`,
        category: appliance.category,
        potentialSavings: (appliance.powerRating * appliance.quantity * cut * 30) / 1000,
        priority: 'high',
        isPersonalized: true,
      });
    }
  });

  // Standby: plugged-in electronics left on for many hours
  const standby = active.filter((a) =>
    [ApplianceCategory.ENTERTAINMENT, ApplianceCategory.OFFICE].includes(a.category));
  if (standby.length > 0) {
    // Typical standby draw is ~2 W per device for the hours it is "off"
    const kWh = standby.reduce((sum, a) => sum + (2 * a.quantity * Math.max(24 - a.hoursPerDay, 0) * 30) / 1000, 0);
    if (kWh >= 0.5) {
      tips.push({
        id: 'tip:standby-strip',
        title: 'Cut standby power with a switched strip',
        description: `${standby.map((a) => a.name).slice(0, 3).join(', ')}${standby.length > 3 ? ' and more' : ''} draw a little power even when "off". A switched power strip saves about ${kWh.toFixed(1)} kWh a month.`,
        category: 'General',
        potentialSavings: kWh,
        priority: 'low',
        isPersonalized: true,
      });
    }
  }

  // A general habit tip sized to the home
  if (totalMonthly > 0) {
    tips.push({
      id: 'tip:switch-off-habit',
      title: 'Make “last one out, lights off” a habit',
      description: `Switching off what nobody is using typically trims 5% of a home's electricity. For you that is about ${(totalMonthly * 0.05).toFixed(1)} kWh a month.`,
      category: 'General',
      potentialSavings: totalMonthly * 0.05,
      priority: 'medium',
      isPersonalized: false,
    });
  }

  return tips;
};

/**
 * Weather tips, only for appliance types the home actually has, sized to that category's use.
 */
export const getWeatherBasedTips = (
  temperature: number,
  season: string,
  humidity: number,
  appliances: Appliance[] = [],
): EnergyTip[] => {
  const tips: EnergyTip[] = [];
  const cooling = categoryMonthly(appliances, ApplianceCategory.COOLING);
  const heating = categoryMonthly(appliances, ApplianceCategory.HEATING);
  const laundry = categoryMonthly(appliances, ApplianceCategory.LAUNDRY);
  const hasCooling = appliances.some((a) => a.category === ApplianceCategory.COOLING);
  const hasHeating = appliances.some((a) => a.category === ApplianceCategory.HEATING);

  if (temperature >= 30 && hasCooling) {
    tips.push({
      id: 'weather:heat-wave',
      title: `It's ${Math.round(temperature)}°C: pre-cool, then coast`,
      description: 'Cool the house in the morning, close blinds on sunny windows by noon, and let the AC hold 25–26°C. Blocking sun alone cuts cooling load by up to 20%.',
      category: ApplianceCategory.COOLING,
      potentialSavings: cooling * 0.2,
      priority: 'high',
      isPersonalized: true,
    });
  } else if (temperature >= 18 && temperature <= 25 && humidity < 70 && hasCooling) {
    tips.push({
      id: 'weather:mild-ventilate',
      title: `Mild ${Math.round(temperature)}°C outside: open the windows`,
      description: 'Today you can skip the AC entirely. Cross-ventilate in the morning and evening and keep fans for still afternoons.',
      category: ApplianceCategory.COOLING,
      potentialSavings: cooling / 30,
      priority: 'medium',
      isPersonalized: true,
    });
  }

  if (humidity > 75 && temperature >= 24 && hasCooling) {
    tips.push({
      id: 'weather:humid-dry-mode',
      title: `${Math.round(humidity)}% humidity: use Dry mode`,
      description: 'Humid air feels hotter than it is. Dry/dehumidify mode keeps you comfortable at a higher set point and uses about 30% less power than Cool.',
      category: ApplianceCategory.COOLING,
      potentialSavings: (cooling * 0.3) / 4,
      priority: 'medium',
      isPersonalized: true,
    });
  }

  if (temperature <= 12 && hasHeating) {
    tips.push({
      id: 'weather:cold-snap',
      title: `${Math.round(temperature)}°C outside: keep the heat in`,
      description: 'Close curtains at dusk, block draughts under doors, and set heating to 19–20°C. Each degree lower saves around 7% of heating energy.',
      category: ApplianceCategory.HEATING,
      potentialSavings: heating * 0.14,
      priority: 'high',
      isPersonalized: true,
    });
  }

  if (laundry > 0 && humidity < 60 && temperature >= 15 && season !== 'winter') {
    tips.push({
      id: 'weather:line-dry',
      title: 'Good drying weather today',
      description: `It's ${Math.round(temperature)}°C with ${Math.round(humidity)}% humidity. Hang laundry outside instead of using a dryer.`,
      category: ApplianceCategory.LAUNDRY,
      potentialSavings: laundry * 0.1,
      priority: 'low',
      isPersonalized: true,
    });
  }

  return tips;
};
