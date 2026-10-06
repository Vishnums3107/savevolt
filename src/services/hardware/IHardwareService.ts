export interface DeviceStatus {
  id: string;
  name: string;
  isOn: boolean;
  currentPowerWatts: number | null;
  lastUpdated: string;
  isOnline: boolean;
}

export interface HardwareDiscovery {
  devices: DeviceStatus[];
  powerSensors: { id: string; name: string }[];
}

/**
 * Defines the core contract for any hardware integration (Smart Plugs, Meters, etc.)
 * that SaveVolt might support in the future.
 */
export interface IHardwareService {
  /** Connects to a device via IP, MAC, or cloud API token */
  connect(credentials: unknown): Promise<boolean>;

  discover(): Promise<HardwareDiscovery>;
  
  /** Retrieves the real-time status of the device */
  getStatus(deviceId: string, powerSensorId?: string): Promise<DeviceStatus>;
  
  /** Toggles the device state */
  toggleState(deviceId: string, turnOn: boolean): Promise<boolean>;
  
  /** Disconnects the session */
  disconnect(): Promise<void>;
}
