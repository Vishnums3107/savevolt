import { DeviceStatus, HardwareDiscovery, IHardwareService } from './IHardwareService';

export interface ShellyCredentials {
  host: string; // IP or hostname, e.g. 192.168.1.120 or shellyplus1pm.local
  channel?: number;
}

export class ShellyLocalService implements IHardwareService {
  private credentials: ShellyCredentials | null = null;
  private generation: 1 | 2 = 2;
  private deviceName = 'Shelly Plug';

  public isConnected(): boolean {
    return this.credentials !== null;
  }

  public getGeneration(): 1 | 2 {
    return this.generation;
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  private normalizeHost(raw: string): string {
    let clean = raw.trim();
    clean = clean.replace(/^https?:\/\//i, '');
    clean = clean.replace(/\/+$/, '');
    return clean;
  }

  public async connect(input: unknown): Promise<boolean> {
    if (!input || typeof input !== 'object') {
      throw new Error('Enter a valid Shelly IP or hostname on your local network.');
    }
    const creds = input as ShellyCredentials;
    if (!creds.host || !creds.host.trim()) {
      throw new Error('Enter a valid Shelly IP or hostname (e.g. 192.168.1.150).');
    }

    const host = this.normalizeHost(creds.host);
    const channel = creds.channel ?? 0;

    // Test Gen 2 RPC endpoint first with 4s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const resGen2 = await fetch(`http://${host}/rpc/Shelly.GetDeviceInfo`, {
        signal: controller.signal,
      });

      if (resGen2.ok) {
        clearTimeout(timeout);
        const data = await resGen2.json();
        this.generation = 2;
        this.deviceName = data.name || data.id || 'Shelly Gen2 Plus';
        this.credentials = { host, channel };
        return true;
      }
    } catch {
      // Fall through to Gen 1 probe
    } finally {
      clearTimeout(timeout);
    }

    // Test Gen 1 endpoint
    const gen1Controller = new AbortController();
    const gen1Timeout = setTimeout(() => gen1Controller.abort(), 4000);

    try {
      const resGen1 = await fetch(`http://${host}/status`, {
        signal: gen1Controller.signal,
      });

      if (resGen1.ok) {
        clearTimeout(gen1Timeout);
        const data = await resGen1.json();
        this.generation = 1;
        this.deviceName = data.mac ? `Shelly Plug (${data.mac.slice(-4)})` : 'Shelly Gen1';
        this.credentials = { host, channel };
        return true;
      }
    } catch {
      // Unreachable
    } finally {
      clearTimeout(gen1Timeout);
    }

    throw new Error(
      `Could not reach Shelly at "${host}". Ensure your phone and the Shelly device are on the same Wi-Fi network.`
    );
  }

  public async discover(): Promise<HardwareDiscovery> {
    if (!this.credentials) throw new Error('Connect to Shelly first.');
    const { host, channel = 0 } = this.credentials;

    const deviceId = `shelly-${host.replace(/[^a-zA-Z0-9]/g, '_')}-${channel}`;
    const status = await this.getStatus(deviceId);

    return {
      devices: [status],
      powerSensors: [
        {
          id: `sensor.${deviceId}.power`,
          name: `${status.name} Live Power (W)`,
        },
      ],
    };
  }

  public async getStatus(deviceId: string): Promise<DeviceStatus> {
    if (!this.credentials) throw new Error('Connect to Shelly first.');
    const { host, channel = 0 } = this.credentials;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      if (this.generation === 2) {
        const res = await fetch(`http://${host}/rpc/Switch.GetStatus?id=${channel}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Shelly returned HTTP ${res.status}`);
        const data = await res.json();
        return {
          id: deviceId,
          name: this.deviceName,
          isOn: Boolean(data.output),
          currentPowerWatts: typeof data.apower === 'number' ? Math.round(data.apower * 10) / 10 : 0,
          lastUpdated: new Date().toISOString(),
          isOnline: true,
        };
      } else {
        const res = await fetch(`http://${host}/status`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Shelly returned HTTP ${res.status}`);
        const data = await res.json();
        const relay = data.relays?.[channel] || data.relays?.[0];
        const meter = data.meters?.[channel] || data.meters?.[0];
        return {
          id: deviceId,
          name: this.deviceName,
          isOn: Boolean(relay?.ison),
          currentPowerWatts: typeof meter?.power === 'number' ? Math.round(meter.power * 10) / 10 : 0,
          lastUpdated: new Date().toISOString(),
          isOnline: true,
        };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Shelly request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async toggleState(deviceId: string, turnOn: boolean): Promise<boolean> {
    if (!this.credentials) throw new Error('Connect to Shelly first.');
    const { host, channel = 0 } = this.credentials;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      if (this.generation === 2) {
        const res = await fetch(`http://${host}/rpc/Switch.Set?id=${channel}&on=${turnOn}`, {
          signal: controller.signal,
        });
        return res.ok;
      } else {
        const res = await fetch(`http://${host}/relay/${channel}?turn=${turnOn ? 'on' : 'off'}`, {
          signal: controller.signal,
        });
        return res.ok;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  public async disconnect(): Promise<void> {
    this.credentials = null;
  }
}

export const shellyLocalSession = new ShellyLocalService();
