import { calculateHybridSystem } from '../src/utils/hybridSystem';

describe('calculateHybridSystem', () => {
  it('sizes solar, biomass, storage, and generator capacity from demand', () => {
    const result = calculateHybridSystem({
      dailyEnergyKwh: 48,
      peakLoadKw: 8,
      solarShare: 0.65,
      peakSunHours: 5,
      solarDerate: 0.8,
      biomassEnergyKwhPerKg: 4.2,
      biomassEfficiency: 0.28,
      batteryAutonomyDays: 1,
      batteryDepthOfDischarge: 0.8,
      generatorReserve: 0.2,
    });

    expect(result.solarCapacityKw).toBe(7.8);
    expect(result.biomassEnergyKwhPerDay).toBe(16.8);
    expect(result.biomassKgPerDay).toBe(14.3);
    expect(result.batteryCapacityKwh).toBe(60);
    expect(result.generatorCapacityKw).toBe(9.6);
    expect(result.annualDieselLitresAvoided).toBe(4905.6);
    expect(result.annualCo2AvoidedTons).toBe(47);
  });

  it('clamps unsafe ratios and emits useful design checks', () => {
    const result = calculateHybridSystem({
      dailyEnergyKwh: 20,
      peakLoadKw: 0,
      solarShare: 1.4,
      peakSunHours: 0,
      solarDerate: 0,
      biomassEnergyKwhPerKg: 0,
      biomassEfficiency: 0,
      batteryAutonomyDays: 0,
      batteryDepthOfDischarge: 0,
      generatorReserve: 0,
    });

    expect(result.solarEnergyKwhPerDay).toBe(20);
    expect(result.biomassEnergyKwhPerDay).toBe(0);
    expect(result.warnings.some(warning => warning.includes('battery backup'))).toBe(true);
  });

  it('keeps non-finite direct inputs safe for service callers', () => {
    const result = calculateHybridSystem({
      dailyEnergyKwh: Number.NaN,
      peakLoadKw: Number.POSITIVE_INFINITY,
      solarShare: Number.NaN,
      peakSunHours: Number.NaN,
      solarDerate: Number.POSITIVE_INFINITY,
      biomassEnergyKwhPerKg: Number.NaN,
      biomassEfficiency: Number.NaN,
      batteryAutonomyDays: Number.NaN,
      batteryDepthOfDischarge: Number.NaN,
      generatorReserve: Number.NaN,
    });

    expect(result.solarCapacityKw).toBe(0);
    expect(result.generatorCapacityKw).toBe(0);
    expect(result.batteryCapacityKwh).toBe(0);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('battery backup'),
    ]));
  });
});