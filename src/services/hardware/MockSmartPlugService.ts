import { IHardwareService, DeviceStatus, HardwareDiscovery } from './IHardwareService';
import { useEnergyStore } from '../../store/energyStore';

/**
 * Appliance-Driven Virtual Smart Plug Service.
 * Dynamically mirrors the user's actual registered household appliances,
 * generates live fluctuating telemetry, and directly synchronizes toggling
 * with SaveVolt's appliances.
 */
export class VirtualSmartPlugService implements IHardwareService {
  private devices: Record<string, DeviceStatus> = {};
  private connected = false;

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(_credentials?: unknown): Promise<boolean> {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    this.refreshFromAppliances();
    this.connected = true;
    return true;
  }

  /**
   * Refreshes internal device map from actual user appliances
   */
  private refreshFromAppliances(): void {
    const store = useEnergyStore.getState();
    const appliances = store.appliances;

    if (appliances.length === 0) {
      // Default initial virtual devices if user has no appliances yet
      this.devices = {
        'vplug-demo-1': {
          id: 'vplug-demo-1',
          name: 'Living Room TV Virtual Plug',
          isOn: true,
          currentPowerWatts: 145,
          lastUpdated: new Date().toISOString(),
          isOnline: true,
        },
        'vplug-demo-2': {
          id: 'vplug-demo-2',
          name: 'Master AC Virtual Plug',
          isOn: true,
          currentPowerWatts: 1250,
          lastUpdated: new Date().toISOString(),
          isOnline: true,
        },
      };
      return;
    }

    const newMap: Record<string, DeviceStatus> = {};
    for (const app of appliances) {
      const plugId = `vplug-${app.id}`;
      const existing = this.devices[plugId];
      const isOn = app.isActive !== false;
      const baseWatts = app.powerRating;
      const jitter = (Math.random() - 0.5) * 0.04 * baseWatts;
      const watts = isOn ? Math.max(1, Math.round((baseWatts + jitter) * 10) / 10) : 0;

      newMap[plugId] = {
        id: plugId,
        name: `${app.name} Plug`,
        isOn,
        currentPowerWatts: existing && existing.isOn === isOn ? existing.currentPowerWatts : watts,
        lastUpdated: new Date().toISOString(),
        isOnline: true,
      };
    }
    this.devices = newMap;
  }

  public async discover(): Promise<HardwareDiscovery> {
    this.refreshFromAppliances();
    const deviceList = Object.values(this.devices).map((device) => ({ ...device }));
    const powerSensors = deviceList.map((device) => ({
      id: `sensor.${device.id}`,
      name: `${device.name} Power (W)`,
    }));

    return { devices: deviceList, powerSensors };
  }

  public async getStatus(deviceId: string): Promise<DeviceStatus> {
    this.refreshFromAppliances();
    const device = this.devices[deviceId];
    if (!device) throw new Error(`Device ${deviceId} not found`);

    if (device.isOn) {
      // Find appliance rating
      const appId = deviceId.replace('vplug-', '');
      const app = useEnergyStore.getState().appliances.find((a) => a.id === appId);
      const baseWatts = app ? app.powerRating : (device.currentPowerWatts || 100);
      const variation = (Math.random() - 0.5) * 0.04 * baseWatts;
      device.currentPowerWatts = Math.max(1, Math.round((baseWatts + variation) * 10) / 10);
    } else {
      device.currentPowerWatts = 0;
    }

    device.lastUpdated = new Date().toISOString();
    return { ...device };
  }

  public async toggleState(deviceId: string, turnOn: boolean): Promise<boolean> {
    const device = this.devices[deviceId];
    if (!device) return false;

    device.isOn = turnOn;
    const appId = deviceId.replace('vplug-', '');
    const store = useEnergyStore.getState();
    const app = store.appliances.find((a) => a.id === appId);

    const baseWatts = app ? app.powerRating : (device.currentPowerWatts || 100);
    device.currentPowerWatts = turnOn ? baseWatts : 0;
    device.lastUpdated = new Date().toISOString();

    // Sync state into SaveVolt appliance
    if (app) {
      try {
        await store.updateAppliance(app.id, {
          isActive: turnOn,
          measuredWatts: turnOn ? baseWatts : 0,
          measuredAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to sync virtual plug to appliance:', e);
      }
    }

    return true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.devices = {};
  }
}

// Singleton instances for backward compatibility and app use
export const mockSmartPlugSession = new VirtualSmartPlugService();
export const virtualSmartPlugSession = mockSmartPlugSession;
