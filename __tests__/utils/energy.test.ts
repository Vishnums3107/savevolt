import { calculateCost, calculateCO2Emissions, co2ToTrees } from '../../src/utils/energy';

describe('Energy Utilities', () => {
  describe('calculateCost', () => {
    it('calculates cost based on energy and rate', () => {
      expect(calculateCost(100, 0.12)).toBe(12);
      expect(calculateCost(0, 0.12)).toBe(0);
      expect(calculateCost(50.5, 0.20)).toBeCloseTo(10.1);
    });
  });

  describe('calculateCO2Emissions', () => {
    it('calculates CO2 based on energy and factor', () => {
      expect(calculateCO2Emissions(100, 0.5)).toBe(50);
      expect(calculateCO2Emissions(0, 0.92)).toBe(0);
    });
  });

  describe('co2ToTrees', () => {
    it('converts CO2 to equivalent trees (approx 21.77kg per tree)', () => {
      expect(co2ToTrees(21.77)).toBeCloseTo(1);
      expect(co2ToTrees(43.54)).toBeCloseTo(2);
      expect(co2ToTrees(10)).toBeCloseTo(0.459, 2);
    });
  });
});
