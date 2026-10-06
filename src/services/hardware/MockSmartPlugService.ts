import { IHardwareService, DeviceStatus, HardwareDiscovery } from './IHardwareService';

/**
 * A mock implementation of IHardwareService to demonstrate the integration
 * roadmap without needing real physical devices.
 */
export class MockSmartPlugService implements IHardwareService {
  private devices: Record<string, DeviceStatus> = {};
  
  public async connect(_credentials: unknown): Promise<boolean> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Seed some mock devices on connect
    this.devices['plug-001'] = {
      id: 'plug-001',
      name: 'Living Room TV Plug',
      isOn: true,
      currentPowerWatts: 145,
      lastUpdated: new Date().toISOString(),
      isOnline: true,
    };
    
    return true;
  }

  public async discover(): Promise<HardwareDiscovery> {
    return { devices: Object.values(this.devices).map(device => ({ ...device })), powerSensors: [] };
  }
  
  public async getStatus(deviceId: string): Promise<DeviceStatus> {
    const device = this.devices[deviceId];
    if (!device) throw new Error(`Device ${deviceId} not found`);
    
    // Add minor random fluctuation to wattage to simulate reality
    const fluctuation = (Math.random() * 10) - 5;
    device.currentPowerWatts = device.isOn ? Math.max(0, (device.currentPowerWatts ?? 0) + fluctuation) : 0;
    device.lastUpdated = new Date().toISOString();
    
    return { ...device };
  }
  
  public async toggleState(deviceId: string, turnOn: boolean): Promise<boolean> {
    const device = this.devices[deviceId];
    if (!device) return false;
    
    device.isOn = turnOn;
    device.currentPowerWatts = turnOn ? 100 : 0; // arbitrary power reset
    device.lastUpdated = new Date().toISOString();
    
    console.log(`[MockSmartPlug] Device ${deviceId} toggled to ${turnOn ? 'ON' : 'OFF'}`);
    return true;
  }
  
  public async disconnect(): Promise<void> {
    console.log('[MockSmartPlug] Disconnected');
    this.devices = {};
  }
}
