import { IHardwareService, DeviceStatus, HardwareDiscovery } from './IHardwareService';

/**
 * A realistic implementation of IHardwareService to test and demonstrate
 * smart plug hardware monitoring, live power fluctuations, and plug control
 * on any device without requiring an external physical server.
 */
export class MockSmartPlugService implements IHardwareService {
  private devices: Record<string, DeviceStatus> = {};
  private connected = false;

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(_credentials?: unknown): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    this.devices = {
      'plug-001': {
        id: 'plug-001',
        name: 'Living Room TV Plug',
        isOn: true,
        currentPowerWatts: 145,
        lastUpdated: new Date().toISOString(),
        isOnline: true,
      },
      'plug-002': {
        id: 'plug-002',
        name: 'Kitchen Coffee Maker Plug',
        isOn: false,
        currentPowerWatts: 0,
        lastUpdated: new Date().toISOString(),
        isOnline: true,
      },
      'plug-003': {
        id: 'plug-003',
        name: 'Home Office Workstation Plug',
        isOn: true,
        currentPowerWatts: 220,
        lastUpdated: new Date().toISOString(),
        isOnline: true,
      },
      'plug-004': {
        id: 'plug-004',
        name: 'Bedroom AC Smart Plug',
        isOn: true,
        currentPowerWatts: 1150,
        lastUpdated: new Date().toISOString(),
        isOnline: true,
      },
    };

    this.connected = true;
    return true;
  }

  public async discover(): Promise<HardwareDiscovery> {
    const deviceList = Object.values(this.devices).map((device) => ({ ...device }));
    const powerSensors = deviceList.map((device) => ({
      id: `sensor.${device.id}`,
      name: `${device.name} Power Sensor (W)`,
    }));

    return { devices: deviceList, powerSensors };
  }

  public async getStatus(deviceId: string): Promise<DeviceStatus> {
    const device = this.devices[deviceId];
    if (!device) throw new Error(`Device ${deviceId} not found`);

    if (device.isOn) {
      // Natural live wattage fluctuation (+/- 3%)
      const baseWatts = deviceId === 'plug-004' ? 1150 : deviceId === 'plug-003' ? 220 : deviceId === 'plug-002' ? 850 : 145;
      const variation = (Math.random() - 0.5) * 0.06 * baseWatts;
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
    const baseWatts = deviceId === 'plug-004' ? 1150 : deviceId === 'plug-003' ? 220 : deviceId === 'plug-002' ? 850 : 145;
    device.currentPowerWatts = turnOn ? baseWatts : 0;
    device.lastUpdated = new Date().toISOString();

    return true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.devices = {};
  }
}

export const mockSmartPlugSession = new MockSmartPlugService();
