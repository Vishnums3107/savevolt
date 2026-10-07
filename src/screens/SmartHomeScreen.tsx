import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useEnergy } from '../context/EnergyContext';
import { useEnergyStore } from '../store/energyStore';
import { getHomeAssistantSession } from '../services/hardware/HomeAssistantService';
import { mockSmartPlugSession } from '../services/hardware/MockSmartPlugService';
import { DeviceStatus, HardwareDiscovery, IHardwareService } from '../services/hardware/IHardwareService';
import ManagementPage, { ManagementButton, ManagementCard, ManagementInput, useManagementStyles } from '../components/ManagementPage';

export default function SmartHomeScreen() {
  const { activeHouseholdId, isSwitchingHousehold } = useEnergy('activeHouseholdId', 'isSwitchingHousehold');
  return <SmartHomeControls key={activeHouseholdId} householdId={activeHouseholdId} blocked={isSwitchingHousehold} />;
}

function SmartHomeControls({ householdId, blocked }: { householdId: string; blocked: boolean }) {
  const { appliances, updateAppliance } = useEnergy('appliances', 'updateAppliance');
  const [providerMode, setProviderMode] = useState<'home-assistant' | 'simulator'>('simulator');

  const haService = useMemo(() => getHomeAssistantSession(householdId), [householdId]);
  const activeService: IHardwareService & { isConnected(): boolean } = useMemo(() => {
    return providerMode === 'simulator' ? mockSmartPlugSession : haService;
  }, [haService, providerMode]);

  const s = useManagementStyles();
  const focused = useIsFocused();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(activeService.isConnected());
  const [discovery, setDiscovery] = useState<HardwareDiscovery>({ devices: [], powerSensors: [] });
  const [deviceId, setDeviceId] = useState('');
  const [sensorId, setSensorId] = useState('');
  const [applianceId, setApplianceId] = useState('');
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const working = useRef(false);
  const statusRequest = useRef(0);
  const selectedAppliance = appliances.find(item => item.id === applianceId);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Update connected status when switching provider mode
  useEffect(() => {
    setConnected(activeService.isConnected());
    setStatus(null);
    setDeviceId('');
    setSensorId('');
  }, [activeService, providerMode]);

  const run = async (action: () => Promise<void>) => {
    if (working.current || blocked || !mounted.current) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    try { await action(); } catch (error) {
      if (mounted.current) Alert.alert('Smart plugs', error instanceof Error ? error.message : 'Connection failed. Please try again.');
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const discover = async () => {
    const result = await activeService.discover();
    if (!mounted.current) return;
    setDiscovery(result);
    setDeviceId(previous => result.devices.some(item => item.id === previous) ? previous : result.devices[0]?.id ?? '');
    if (result.powerSensors.length > 0 && !sensorId) {
      setSensorId(result.powerSensors[0].id);
    }
  };

  useEffect(() => {
    if (connected && focused) run(discover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, focused]);

  useEffect(() => {
    setStatus(null);
    if (!connected || !focused || !deviceId) return;
    let cancelled = false;
    const refresh = async () => {
      if (AppState.currentState !== 'active') return;
      const request = ++statusRequest.current;
      try {
        const result = await activeService.getStatus(deviceId, sensorId || undefined);
        if (!cancelled && request === statusRequest.current) { setStatus(result); setMessage(''); }
      } catch (error) {
        if (!cancelled && request === statusRequest.current) {
          setStatus(null);
          setMessage(error instanceof Error ? error.message : 'Device refresh failed.');
        }
      }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connected, focused, deviceId, sensorId, activeService]);

  const connect = () => run(async () => {
    if (providerMode === 'simulator') {
      await mockSmartPlugSession.connect();
    } else {
      await haService.connect({ url, token });
      if (mounted.current) setToken('');
    }
    if (mounted.current) setConnected(true);
  });

  const disconnect = () => run(async () => {
    ++statusRequest.current;
    await activeService.disconnect();
    if (mounted.current) { setConnected(false); setStatus(null); setDiscovery({ devices: [], powerSensors: [] }); }
  });

  const command = () => run(async () => {
    if (!status?.isOnline) throw new Error('This plug is offline.');
    await activeService.toggleState(deviceId, !status.isOn);
    const result = await activeService.getStatus(deviceId, sensorId || undefined);
    if (mounted.current) { setStatus(result); setMessage('Command sent. The current device state is shown above.'); }
  });

  const bind = () => run(async () => {
    if (useEnergyStore.getState().activeHouseholdId !== householdId) return;
    await updateAppliance(applianceId, { hardwareLink: { provider: 'home-assistant', deviceId, powerSensorId: sensorId || undefined } });
    if (mounted.current) setMessage('Plug and sensor paired with your appliance.');
  });

  const applyReading = () => run(async () => {
    if (useEnergyStore.getState().activeHouseholdId !== householdId || !status?.isOn || !status.currentPowerWatts) return;
    await updateAppliance(applianceId, { powerRating: Math.round(status.currentPowerWatts) });
    if (mounted.current) setMessage(`Tracked wattage updated to ${Math.round(status.currentPowerWatts)} W.`);
  });

  const disabled = busy || blocked;

  return (
    <ManagementPage title="Smart plugs" subtitle="Read live wattage and control plugs through Home Assistant or Smart Plug Simulator.">
      <ManagementCard>
        <Text style={s.heading} accessibilityRole="header">Integration Mode</Text>
        <Text style={s.text}>Select your smart plug source:</Text>
        <ManagementButton
          label={providerMode === 'simulator' ? '✓ Mode: Smart Plug Simulator (Ready)' : 'Switch to Smart Plug Simulator'}
          disabled={disabled}
          onPress={() => setProviderMode('simulator')}
        />
        <ManagementButton
          label={providerMode === 'home-assistant' ? '✓ Mode: Home Assistant (HTTPS)' : 'Switch to Home Assistant'}
          disabled={disabled}
          onPress={() => setProviderMode('home-assistant')}
        />
      </ManagementCard>

      <ManagementCard>
        <Text style={s.heading} accessibilityRole="header">
          {providerMode === 'simulator' ? 'Smart Plug Simulator' : 'Home Assistant connection'}
        </Text>
        <Text style={s.text}>
          {providerMode === 'simulator'
            ? 'Connect virtual smart plugs with live power fluctuating telemetry to test hardware control, wattage syncing, and automated toggling.'
            : 'Connect your existing Home Assistant server with a long-lived access token. The token stays in memory for this app session.'}
        </Text>
        {!connected ? (
          <>
            {providerMode === 'home-assistant' && (
              <>
                <ManagementInput label="Home Assistant HTTPS address" value={url} onChangeText={setUrl} placeholder="https://home.example.com" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
                <ManagementInput label="Home Assistant access token" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              </>
            )}
            <ManagementButton
              label={providerMode === 'simulator' ? 'Connect Smart Plug Simulator' : 'Connect Home Assistant'}
              disabled={disabled}
              onPress={connect}
            />
          </>
        ) : (
          <>
            <Text style={s.notice}>Connected ({providerMode === 'simulator' ? 'Simulator' : 'Home Assistant'})</Text>
            <ManagementButton label="Refresh devices" disabled={disabled} onPress={() => run(discover)} />
            <ManagementButton label="Disconnect" disabled={disabled} onPress={disconnect} />
          </>
        )}
        {busy && <Text style={s.notice} accessibilityLiveRegion="polite">Working…</Text>}
      </ManagementCard>

      {connected && (
        <ManagementCard>
          <Text style={s.heading} accessibilityRole="header">Choose a plug</Text>
          {discovery.devices.length === 0 && (
            <Text style={s.text}>No switches or plugs found. Tap Refresh devices to scan.</Text>
          )}
          {discovery.devices.map(device => (
            <ManagementButton
              key={device.id}
              label={`${device.id === deviceId ? 'Selected: ' : ''}${device.name} (${device.isOn ? 'ON' : 'OFF'})`}
              disabled={disabled}
              onPress={() => setDeviceId(device.id)}
            />
          ))}
        </ManagementCard>
      )}

      {connected && deviceId !== '' && (
        <>
          <ManagementCard>
            <Text style={s.heading} accessibilityRole="header">Live Power & Plug Control</Text>
            <Text style={s.text}>Control plug relay and observe real-time power draw:</Text>
            <Text style={s.value} accessibilityLiveRegion="polite">
              {status
                ? `${status.isOnline ? (status.isOn ? '⚡ Plug is ON' : '⭕ Plug is OFF') : 'Offline'} · ${status.currentPowerWatts === null ? 'Power reading unavailable' : `${status.currentPowerWatts.toFixed(1)} W`}`
                : 'Waiting for device reading…'}
            </Text>
            {status && <Text style={s.text}>Updated {new Date(status.lastUpdated).toLocaleTimeString()}</Text>}
            <ManagementButton
              label={status?.isOn ? 'Turn plug OFF' : 'Turn plug ON'}
              disabled={disabled || !status?.isOnline}
              onPress={command}
            />
          </ManagementCard>

          <ManagementCard>
            <Text style={s.heading} accessibilityRole="header">Pair with tracked appliance</Text>
            {!appliances.length && <Text style={s.text}>Add an appliance in Track, then pair it here.</Text>}
            {appliances.map(appliance => (
              <ManagementButton
                key={appliance.id}
                label={`${applianceId === appliance.id ? 'Selected: ' : ''}${appliance.name} (${appliance.powerRating}W)`}
                disabled={disabled}
                onPress={() => {
                  setApplianceId(appliance.id);
                  if (appliance.hardwareLink) {
                    setDeviceId(appliance.hardwareLink.deviceId);
                    setSensorId(appliance.hardwareLink.powerSensorId ?? '');
                  }
                }}
              />
            ))}
            <ManagementButton label="Save appliance pairing" disabled={disabled || !applianceId} onPress={bind} />
            <ManagementButton
              label="Sync live wattage into SaveVolt appliance"
              disabled={disabled || !applianceId || !status?.isOn || !status.currentPowerWatts}
              onPress={applyReading}
            />
            {selectedAppliance?.hardwareLink && (
              <ManagementButton
                label="Remove appliance pairing"
                disabled={disabled}
                onPress={() => run(async () => { await updateAppliance(applianceId, { hardwareLink: undefined }); })}
              />
            )}
          </ManagementCard>
        </>
      )}

      {message !== '' && <Text style={s.notice} accessibilityLiveRegion="polite">{message}</Text>}
    </ManagementPage>
  );
}
