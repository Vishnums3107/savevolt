import { virtualSmartPlugSession } from '../src/services/hardware/MockSmartPlugService';
import { ShellyLocalService } from '../src/services/hardware/ShellyLocalService';
import { normalizeHomeAssistantUrl } from '../src/services/hardware/HomeAssistantService';
import { useEnergyStore } from '../src/store/energyStore';
import { Appliance, ApplianceCategory } from '../src/types';

describe('Devices and Smart Plugs (Session 5)', () => {
  const sampleAppliances: Appliance[] = [
    {
      id: 'app-ac',
      name: 'Bedroom AC',
      powerRating: 1500,
      hoursPerDay: 6,
      quantity: 1,
      category: ApplianceCategory.COOLING,
      createdAt: '2026-01-01',
      isActive: true,
    },
    {
      id: 'app-tv',
      name: 'OLED TV',
      powerRating: 120,
      hoursPerDay: 4,
      quantity: 1,
      category: ApplianceCategory.ENTERTAINMENT,
      createdAt: '2026-01-01',
      isActive: false,
    },
  ];

  beforeEach(() => {
    useEnergyStore.setState({
      appliances: [...sampleAppliances],
    });
  });

  describe('VirtualSmartPlugService (Appliance-Driven)', () => {
    it('discovers virtual plugs directly generated from registered appliances', async () => {
      await virtualSmartPlugSession.connect();
      expect(virtualSmartPlugSession.isConnected()).toBe(true);

      const discovery = await virtualSmartPlugSession.discover();
      expect(discovery.devices.length).toBe(2);

      const acPlug = discovery.devices.find((d) => d.id === 'vplug-app-ac');
      expect(acPlug).toBeDefined();
      expect(acPlug?.name).toBe('Bedroom AC Plug');
      expect(acPlug?.isOn).toBe(true);
      expect(acPlug?.currentPowerWatts).toBeGreaterThan(1400);

      const tvPlug = discovery.devices.find((d) => d.id === 'vplug-app-tv');
      expect(tvPlug).toBeDefined();
      expect(tvPlug?.isOn).toBe(false);
      expect(tvPlug?.currentPowerWatts).toBe(0);
    });

    it('toggling virtual plug synchronizes state directly to SaveVolt appliance', async () => {
      await virtualSmartPlugSession.connect();
      // Turn off AC plug
      const toggled = await virtualSmartPlugSession.toggleState('vplug-app-ac', false);
      expect(toggled).toBe(true);

      const updatedAc = useEnergyStore.getState().appliances.find((a) => a.id === 'app-ac');
      expect(updatedAc?.isActive).toBe(false);

      // Turn on TV plug
      await virtualSmartPlugSession.toggleState('vplug-app-tv', true);
      const updatedTv = useEnergyStore.getState().appliances.find((a) => a.id === 'app-tv');
      expect(updatedTv?.isActive).toBe(true);
      expect(updatedTv?.measuredWatts).toBe(120);
    });

    it('getStatus reflects natural telemetry fluctuation around appliance power rating', async () => {
      await virtualSmartPlugSession.connect();
      const status = await virtualSmartPlugSession.getStatus('vplug-app-ac');
      expect(status.isOnline).toBe(true);
      expect(status.currentPowerWatts).toBeGreaterThan(0);
      expect(status.lastUpdated).toBeDefined();
    });
  });

  describe('ShellyLocalService (LAN & Wi-Fi Direct Control)', () => {
    let shellyService: ShellyLocalService;

    beforeEach(() => {
      shellyService = new ShellyLocalService();
    });

    it('normalizes host addresses and connects to Gen 2 device via RPC', async () => {
      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/rpc/Shelly.GetDeviceInfo')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'shellyplus1pm-abc', name: 'Living Room Plug Plus' }),
          });
        }
        if (url.includes('/rpc/Switch.GetStatus')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ output: true, apower: 84.5, voltage: 230.2 }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      // @ts-ignore
      global.fetch = mockFetch;

      const connected = await shellyService.connect({ host: 'http://192.168.1.150/' });
      expect(connected).toBe(true);
      expect(shellyService.isConnected()).toBe(true);
      expect(shellyService.getGeneration()).toBe(2);

      const discovery = await shellyService.discover();
      expect(discovery.devices.length).toBe(1);
      expect(discovery.devices[0].currentPowerWatts).toBe(84.5);
      expect(discovery.devices[0].isOn).toBe(true);
    });

    it('connects to Gen 1 Shelly devices via /status endpoint', async () => {
      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/rpc/Shelly.GetDeviceInfo')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/status')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              mac: 'AABBCCDDEEFF',
              relays: [{ ison: true }],
              meters: [{ power: 45.2 }],
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      // @ts-ignore
      global.fetch = mockFetch;

      const connected = await shellyService.connect({ host: '192.168.1.160' });
      expect(connected).toBe(true);
      expect(shellyService.getGeneration()).toBe(1);

      const status = await shellyService.getStatus('shelly-device');
      expect(status.isOn).toBe(true);
      expect(status.currentPowerWatts).toBe(45.2);
    });

    it('toggles relay state with Gen 2 RPC', async () => {
      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/rpc/Shelly.GetDeviceInfo')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'gen2' }) });
        }
        if (url.includes('/rpc/Switch.Set')) {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: false });
      });

      // @ts-ignore
      global.fetch = mockFetch;

      await shellyService.connect({ host: '192.168.1.170' });
      const turnedOn = await shellyService.toggleState('shelly-test', true);
      expect(turnedOn).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('on=true'), expect.any(Object));
    });
  });

  describe('HomeAssistantService Local Network URL Support', () => {
    it('accepts local network HTTP URLs without enforcing HTTPS', () => {
      expect(normalizeHomeAssistantUrl('http://192.168.1.100:8123')).toBe('http://192.168.1.100:8123');
      expect(normalizeHomeAssistantUrl('http://homeassistant.local:8123/')).toBe('http://homeassistant.local:8123');
      expect(normalizeHomeAssistantUrl('https://myhome.duckdns.org')).toBe('https://myhome.duckdns.org');
    });

    it('rejects invalid or malformed addresses', () => {
      expect(() => normalizeHomeAssistantUrl('ftp://invalid.com')).toThrow();
      expect(() => normalizeHomeAssistantUrl('not-a-url')).toThrow();
    });
  });
});
