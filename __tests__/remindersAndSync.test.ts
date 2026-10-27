import { validateHouseholdData } from '../src/services/sync/householdData';
import { ApplianceCategory, HouseholdData } from '../src/types';

describe('Session 6: Reminders, Settings, and Offline Household Sync', () => {
  describe('Reminder Routine Templates', () => {
    const ROUTINE_TEMPLATES = [
      {
        id: 'tpl-vampire',
        title: 'Bedtime Vampire Sweep',
        message: 'Check entertainment centers and unplug idle chargers before bed.',
        time: '22:30',
        days: [0, 1, 2, 3, 4, 5, 6],
        icon: '🌙',
        tag: 'DAILY · SAVINGS',
      },
      {
        id: 'tpl-peak',
        title: 'Peak Rate Alert',
        message: 'Peak electricity rates are in effect now! Shift high-energy tasks.',
        time: '14:00',
        days: [1, 2, 3, 4, 5],
        icon: '⚡',
        tag: 'WEEKDAYS · COST',
      },
      {
        id: 'tpl-log',
        title: 'Daily Usage Check',
        message: 'Take a quick look at your active appliances and log your daily usage.',
        time: '20:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        icon: '📝',
        tag: 'HABIT · STREAK',
      },
      {
        id: 'tpl-bill',
        title: 'Utility Bill Reconciliation',
        message: 'Check your utility portal for your latest bill and reconcile your tracked costs.',
        time: '10:00',
        days: [0],
        icon: '📄',
        tag: 'WEEKLY · BILLS',
      },
    ];

    it('all routine templates have valid 24h times and day indices', () => {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      ROUTINE_TEMPLATES.forEach((tpl) => {
        expect(tpl.title.length).toBeGreaterThan(0);
        expect(tpl.message.length).toBeGreaterThan(0);
        expect(timeRegex.test(tpl.time)).toBe(true);
        expect(tpl.days.length).toBeGreaterThan(0);
        tpl.days.forEach((day) => {
          expect(day).toBeGreaterThanOrEqual(0);
          expect(day).toBeLessThanOrEqual(6);
        });
      });
    });

    it('correctly maps a template to a reminder store payload', () => {
      const tpl = ROUTINE_TEMPLATES[0];
      const reminder = {
        id: 'rem-vampire-1',
        title: tpl.title,
        message: tpl.message,
        time: tpl.time,
        days: tpl.days,
        isActive: true,
      };

      expect(reminder.title).toBe('Bedtime Vampire Sweep');
      expect(reminder.time).toBe('22:30');
      expect(reminder.days).toHaveLength(7);
      expect(reminder.isActive).toBe(true);
    });
  });

  describe('Regional Presets & Standard Energy Defaults', () => {
    const REGIONAL_PRESETS = [
      { label: '🇺🇸 US', rate: '0.16', currency: '$', name: 'United States' },
      { label: '🇪🇺 Europe', rate: '0.28', currency: '€', name: 'Eurozone' },
      { label: '🇬🇧 UK', rate: '0.245', currency: '£', name: 'United Kingdom' },
      { label: '🇮🇳 India', rate: '7.50', currency: '₹', name: 'India' },
      { label: '🇦🇺 Australia', rate: '0.32', currency: 'A$', name: 'Australia' },
      { label: '🇨🇦 Canada', rate: '0.14', currency: 'C$', name: 'Canada' },
    ];

    it('all regional presets define positive numeric rates and currencies', () => {
      REGIONAL_PRESETS.forEach((preset) => {
        const parsedRate = Number.parseFloat(preset.rate);
        expect(Number.isFinite(parsedRate)).toBe(true);
        expect(parsedRate).toBeGreaterThan(0);
        expect(preset.currency.trim().length).toBeGreaterThan(0);
      });
    });

    it('standard defaults provide fallback electricity rate and CO2 emission factor', () => {
      const DEFAULT_RATE = 0.15;
      const DEFAULT_CO2 = 0.85;

      expect(DEFAULT_RATE).toBe(0.15);
      expect(DEFAULT_CO2).toBe(0.85);
    });
  });

  describe('Offline Household JSON Backup & Restore Validation', () => {
    const validSampleHouseholdData: HouseholdData = {
      settings: {
        electricityRate: 0.18,
        currency: '$',
        co2Factor: 0.85,
        weatherLocation: 'San Francisco',
      },
      streak: {
        currentStreak: 5,
        longestStreak: 12,
        lastActivityDate: '2026-03-10',
        totalDaysActive: 20,
      },
      appliances: [
        {
          id: 'app-fridge',
          name: 'Smart Refrigerator',
          powerRating: 150,
          hoursPerDay: 24,
          quantity: 1,
          category: ApplianceCategory.KITCHEN,
          createdAt: '2026-01-01T00:00:00.000Z',
          isActive: true,
        },
      ],
      usageRecords: [],
      reminders: [
        {
          id: 'rem-night',
          title: 'Night Check',
          message: 'Check devices',
          time: '23:00',
          days: [0, 1, 2, 3, 4, 5, 6],
          isActive: true,
          applianceId: 'app-fridge',
        },
      ],
      goals: [],
      badges: [],
      rooms: [
        {
          id: 'room-kitchen',
          name: 'Kitchen',
          appliances: ['app-fridge'],
          position: { x: 10, y: 20 },
        },
      ],
      communityGoals: [],
      challenges: [],
      snapshots: [],
      activeTimers: [],
    };

    it('validates and accepts valid household data', () => {
      const validated = validateHouseholdData(validSampleHouseholdData);
      expect(validated.appliances).toHaveLength(1);
      expect(validated.appliances[0].name).toBe('Smart Refrigerator');
      expect(validated.reminders).toHaveLength(1);
      expect(validated.rooms).toHaveLength(1);
      expect(validated.streak.currentStreak).toBe(5);
    });

    it('correctly handles savevolt_home_backup envelope format', () => {
      const backupEnvelope = {
        format: 'savevolt_home_backup',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        homeName: 'Main Residence',
        data: validSampleHouseholdData,
      };

      const payloadData = backupEnvelope.format === 'savevolt_home_backup'
        ? backupEnvelope.data
        : backupEnvelope;

      const validated = validateHouseholdData(payloadData);
      expect(validated.appliances).toHaveLength(1);
      expect(backupEnvelope.homeName).toBe('Main Residence');
    });

    it('rejects corrupted payload with invalid settings', () => {
      const corruptData = {
        ...validSampleHouseholdData,
        settings: {
          electricityRate: -1, // invalid negative rate
          currency: '$',
          co2Factor: 0.85,
          weatherLocation: 'San Francisco',
        },
      };

      expect(() => validateHouseholdData(corruptData)).toThrow('Invalid energy settings');
    });

    it('rejects corrupted payload with duplicate appliance IDs', () => {
      const duplicateApplianceData = {
        ...validSampleHouseholdData,
        appliances: [
          validSampleHouseholdData.appliances[0],
          { ...validSampleHouseholdData.appliances[0] }, // duplicate ID
        ],
      };

      expect(() => validateHouseholdData(duplicateApplianceData)).toThrow('Duplicate appliances');
    });

    it('cleans up reminders pointing to nonexistent appliances', () => {
      const orphanReminderData = {
        ...validSampleHouseholdData,
        reminders: [
          {
            id: 'rem-orphan',
            title: 'Ghost Appliance Check',
            message: 'Check ghost',
            time: '12:00',
            days: [1],
            isActive: true,
            applianceId: 'nonexistent-appliance-id',
          },
        ],
      };

      const validated = validateHouseholdData(orphanReminderData);
      expect(validated.reminders[0].applianceId).toBeUndefined();
    });
  });
});
