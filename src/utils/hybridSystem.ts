export interface HybridSystemInputs {
  dailyEnergyKwh: number;
  peakLoadKw: number;
  solarShare: number;
  peakSunHours: number;
  solarDerate: number;
  biomassEnergyKwhPerKg: number;
  biomassEfficiency: number;
  batteryAutonomyDays: number;
  batteryDepthOfDischarge: number;
  generatorReserve: number;
}

export interface HybridSystemSizing {
  solarCapacityKw: number;
  solarEnergyKwhPerDay: number;
  biomassEnergyKwhPerDay: number;
  biomassKgPerDay: number;
  generatorCapacityKw: number;
  batteryCapacityKwh: number;
  renewableShare: number;
  annualSolarKwh: number;
  annualBiomassKg: number;
  annualDieselLitresAvoided: number;
  annualCo2AvoidedTons: number;
  warnings: string[];
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
const atLeast = (value: number, min: number) => Number.isFinite(value) ? Math.max(min, value) : min;
const round = (value: number, decimals = 1) => Number(value.toFixed(decimals));

export const calculateHybridSystem = (rawInputs: HybridSystemInputs): HybridSystemSizing => {
  const inputs = {
    ...rawInputs,
    dailyEnergyKwh: atLeast(rawInputs.dailyEnergyKwh, 0),
    peakLoadKw: atLeast(rawInputs.peakLoadKw, 0),
    solarShare: clamp(rawInputs.solarShare, 0, 1),
    peakSunHours: atLeast(rawInputs.peakSunHours, 0.1),
    solarDerate: clamp(rawInputs.solarDerate, 0.1, 1),
    biomassEnergyKwhPerKg: atLeast(rawInputs.biomassEnergyKwhPerKg, 0.1),
    biomassEfficiency: clamp(rawInputs.biomassEfficiency, 0.1, 1),
    batteryAutonomyDays: atLeast(rawInputs.batteryAutonomyDays, 0),
    batteryDepthOfDischarge: clamp(rawInputs.batteryDepthOfDischarge, 0.1, 1),
    generatorReserve: atLeast(rawInputs.generatorReserve, 0),
  };

  const solarEnergyKwhPerDay = inputs.dailyEnergyKwh * inputs.solarShare;
  const biomassEnergyKwhPerDay = inputs.dailyEnergyKwh - solarEnergyKwhPerDay;
  const solarCapacityKw = solarEnergyKwhPerDay / (inputs.peakSunHours * inputs.solarDerate);
  const biomassKgPerDay = biomassEnergyKwhPerDay / (inputs.biomassEnergyKwhPerKg * inputs.biomassEfficiency);
  const generatorCapacityKw = inputs.peakLoadKw * (1 + inputs.generatorReserve);
  const batteryCapacityKwh = inputs.dailyEnergyKwh * inputs.batteryAutonomyDays / inputs.batteryDepthOfDischarge;
  const annualSolarKwh = solarEnergyKwhPerDay * 365;
  const annualBiomassKg = biomassKgPerDay * 365;
  // A conservative comparison baseline: 0.28 L diesel and 2.68 kg CO2 per kWh generated.
  const annualDieselLitresAvoided = inputs.dailyEnergyKwh * 365 * 0.28;
  const annualCo2AvoidedKg = inputs.dailyEnergyKwh * 365 * 2.68 / 1000;
  const warnings: string[] = [];

  if (inputs.solarShare < 0.35) warnings.push('The biomass stream carries most of the daily energy. Confirm year-round feedstock access.');
  if (inputs.solarShare > 0.8) warnings.push('Solar is doing most of the work. Validate battery autonomy for cloudy periods.');
  if (inputs.batteryAutonomyDays === 0) warnings.push('There is no battery backup. Essential loads will need biomass generation after sunset or during cloudy periods.');
  if (biomassKgPerDay > 100) warnings.push('Feedstock demand is high. Consider a larger community digester or a second biomass source.');
  if (inputs.peakLoadKw < inputs.dailyEnergyKwh / 24) warnings.push('Peak load is below the average load; check the demand estimate.');

  return {
    solarCapacityKw: round(solarCapacityKw, 2),
    solarEnergyKwhPerDay: round(solarEnergyKwhPerDay, 1),
    biomassEnergyKwhPerDay: round(biomassEnergyKwhPerDay, 1),
    biomassKgPerDay: round(biomassKgPerDay, 1),
    generatorCapacityKw: round(generatorCapacityKw, 2),
    batteryCapacityKwh: round(batteryCapacityKwh, 1),
    renewableShare: round(inputs.dailyEnergyKwh > 0 ? 1 : 0, 2),
    annualSolarKwh: round(annualSolarKwh),
    annualBiomassKg: round(annualBiomassKg),
    annualDieselLitresAvoided: round(annualDieselLitresAvoided),
    annualCo2AvoidedTons: round(annualCo2AvoidedKg),
    warnings,
  };
};