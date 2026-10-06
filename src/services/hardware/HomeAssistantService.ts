import { DeviceStatus, HardwareDiscovery, IHardwareService } from './IHardwareService';

export interface HomeAssistantCredentials { url: string; token: string }
interface Entity {
  entity_id: string;
  state: string;
  attributes: { friendly_name?: string; unit_of_measurement?: string };
  last_updated: string;
}

const controllable = (id: string) => /^(switch|light)\.[a-z0-9_]+$/.test(id);
const powerSensor = (id: string) => /^sensor\.[a-z0-9_]+$/.test(id);
const isEntity = (value: unknown): value is Entity => {
  if (!value || typeof value !== 'object') return false;
  const entity = value as Entity;
  return typeof entity.entity_id === 'string' && typeof entity.state === 'string' &&
    Boolean(entity.attributes && typeof entity.attributes === 'object') && typeof entity.last_updated === 'string';
};

export const normalizeHomeAssistantUrl = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');
  // Use HTTPS for token-bearing requests on both platforms; do not loosen the
  // app-wide Android cleartext or iOS transport-security policies.
  const match = trimmed.match(/^https:\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?$/);
  if (!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) {
    throw new Error('Enter your Home Assistant HTTPS address, without a path or login details.');
  }
  return trimmed;
};

export const readPowerWatts = (entity: Entity | null): number | null => {
  if (!entity || !entity.state.trim() || ['unavailable', 'unknown'].includes(entity.state)) return null;
  const power = Number(entity.state);
  if (!Number.isFinite(power) || power < 0) return null;
  if (entity.attributes.unit_of_measurement === 'W') return power;
  if (entity.attributes.unit_of_measurement === 'kW') return power * 1000;
  return null;
};

/** A real REST adapter. Tokens are kept only in this session, never in storage. */
export class HomeAssistantService implements IHardwareService {
  private credentials: HomeAssistantCredentials | null = null;
  private session = 0;
  isConnected(): boolean { return this.credentials !== null; }

  private async request(path: string, method = 'GET', body?: Record<string, string>, credentials = this.credentials): Promise<unknown> {
    if (!credentials) throw new Error('Connect to Home Assistant first.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${credentials.url}/api/${path}`, {
        method, signal: controller.signal, headers: {
          Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json',
        }, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 401 || response.status === 403) throw new Error('Home Assistant rejected the token. Check its access and try again.');
      if (!response.ok) throw new Error(`Home Assistant request failed (${response.status}).`);
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Home Assistant took too long to respond. Please try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async connect(input: unknown): Promise<boolean> {
    if (!input || typeof input !== 'object') throw new Error('Enter a server address and access token.');
    const value = input as HomeAssistantCredentials;
    if (typeof value.url !== 'string' || typeof value.token !== 'string' || !value.token.trim()) {
      throw new Error('Enter a server address and access token.');
    }
    const credentials = { url: normalizeHomeAssistantUrl(value.url), token: value.token.trim() };
    const session = ++this.session;
    this.credentials = null;
    await this.request('', 'GET', undefined, credentials);
    if (session !== this.session) throw new Error('The connection was cancelled.');
    this.credentials = credentials;
    return true;
  }

  async discover(): Promise<HardwareDiscovery> {
    const response = await this.request('states');
    if (!Array.isArray(response) || !response.every(isEntity)) throw new Error('Home Assistant returned invalid device data.');
    return {
      devices: response.filter(item => controllable(item.entity_id)).map(item => this.status(item, null)),
      powerSensors: response.filter(item => powerSensor(item.entity_id) && ['W', 'kW'].includes(item.attributes.unit_of_measurement ?? ''))
        .map(item => ({ id: item.entity_id, name: item.attributes.friendly_name ?? item.entity_id })),
    };
  }

  private status(device: Entity, sensor: Entity | null): DeviceStatus {
    return { id: device.entity_id, name: device.attributes.friendly_name ?? device.entity_id,
      isOn: device.state === 'on', isOnline: ['on', 'off'].includes(device.state),
      currentPowerWatts: readPowerWatts(sensor), lastUpdated: sensor?.last_updated ?? device.last_updated };
  }

  async getStatus(deviceId: string, powerSensorId?: string): Promise<DeviceStatus> {
    if (!controllable(deviceId) || (powerSensorId && !powerSensor(powerSensorId))) throw new Error('Choose a valid plug and power sensor.');
    const values = await Promise.all([
      this.request(`states/${encodeURIComponent(deviceId)}`),
      powerSensorId ? this.request(`states/${encodeURIComponent(powerSensorId)}`) : Promise.resolve(null),
    ]);
    const [device, sensor] = values;
    if (!isEntity(device) || device.entity_id !== deviceId ||
        (powerSensorId && (!isEntity(sensor) || sensor.entity_id !== powerSensorId))) {
      throw new Error('Home Assistant returned invalid device data.');
    }
    return this.status(device, isEntity(sensor) ? sensor : null);
  }

  async toggleState(deviceId: string, turnOn: boolean): Promise<boolean> {
    if (!controllable(deviceId)) throw new Error('Choose a valid plug.');
    const domain = deviceId.split('.')[0];
    // Service calls control the device. Writing /states only changes its reported representation.
    await this.request(`services/${domain}/${turnOn ? 'turn_on' : 'turn_off'}`, 'POST', { entity_id: deviceId });
    return true;
  }

  async disconnect(): Promise<void> { ++this.session; this.credentials = null; }
}

const sessions = new Map<string, HomeAssistantService>();
export const getHomeAssistantSession = (householdId: string) => {
  if (!sessions.has(householdId)) sessions.set(householdId, new HomeAssistantService());
  return sessions.get(householdId)!;
};
