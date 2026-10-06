import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useEnergy } from '../context/EnergyContext';
import { useEnergyStore } from '../store/energyStore';
import CloudSyncService, { CloudAccount, CloudHome, cloudErrorMessage } from '../services/CloudSyncService';
import ManagementPage, { ManagementButton, ManagementCard, ManagementInput, useManagementStyles } from '../components/ManagementPage';

export default function AccountSyncScreen() {
  const s = useManagementStyles();
  const { households, activeHouseholdId, isSwitchingHousehold, captureHouseholdData, updateHouseholdCloudLink,
    restoreHousehold, switchHousehold } = useEnergy('households', 'activeHouseholdId', 'isSwitchingHousehold',
    'captureHouseholdData', 'updateHouseholdCloudLink', 'restoreHousehold', 'switchHousehold');
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [homes, setHomes] = useState<CloudHome[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  const available = CloudSyncService.isAvailable();
  const currentHome = households.find(home => home.id === activeHouseholdId);
  const disabled = busy || isSwitchingHousehold;

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = CloudSyncService.observeAccount(user => {
      if (!mounted.current) return;
      setAccount(user);
      setHomes([]);
      setPassword('');
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  const run = async (action: () => Promise<void>, success?: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await action();
      if (success && mounted.current) Alert.alert('Account sync', success);
    } catch (error) {
      if (mounted.current) Alert.alert('Account sync', cloudErrorMessage(error));
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const refresh = () => run(async () => { const result = await CloudSyncService.listHomes(); if (mounted.current) setHomes(result); });
  const upload = (asNewCopy = false) => run(async () => {
    const { household, data } = await captureHouseholdData();
    const link = await CloudSyncService.upload(household, data, asNewCopy);
    await updateHouseholdCloudLink(household.id, link.ownerId, link.id, link.revision);
    const result = await CloudSyncService.listHomes();
    if (mounted.current) setHomes(result);
  }, 'Your home is backed up. Sign in on another device and restore it there.');

  const restore = (home: CloudHome) => run(async () => {
    const ownerId = account!.uid;
    const backup = await CloudSyncService.download(home.id);
    const existing = useEnergyStore.getState().households;
    const base = backup.name.slice(0, 48);
    let name = base;
    let copy = 1;
    while (existing.some(item => item.name.toLowerCase() === name.toLowerCase())) name = `${base} (restored ${copy++})`;
    const id = await restoreHousehold(name, backup.data, { ownerId, id: backup.id, revision: backup.revision });
    await switchHousehold(id);
  }, 'Cloud data restored as a separate home. Your existing homes are safe.');

  return <ManagementPage title="Account sync" subtitle="Back up homes and bring them to your other devices.">
    <ManagementCard>
      <Text style={s.text}>Backups include devices, logs, rooms, goals, reminders, and energy rates. API keys and device preferences stay on this device.</Text>
      {!available ? <Text style={s.notice}>Cloud sync is unavailable in this build. You can continue managing all your homes offline.</Text> : !account ? <>
        <ManagementInput label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <ManagementInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" />
        <View style={s.row}>
          <ManagementButton label="Sign in" disabled={disabled} onPress={() => run(() => CloudSyncService.signIn(email, password))} />
          <ManagementButton label="Create account" disabled={disabled} onPress={() => run(() => CloudSyncService.createAccount(email, password))} />
          <ManagementButton label="Reset password" disabled={disabled} onPress={() => run(() => CloudSyncService.resetPassword(email), 'If this email has an account, password reset instructions will be sent.')} />
        </View>
      </> : <>
        <Text style={s.heading}>{account.email ?? 'Signed in'}</Text>
        <Text style={s.value}>Current home: {currentHome?.name}</Text>
        <ManagementButton label="Back up current home" disabled={disabled} onPress={() => upload()} />
        <ManagementButton label="Save as a new cloud copy" disabled={disabled} onPress={() => upload(true)} />
        <ManagementButton label="Refresh cloud homes" disabled={disabled} onPress={refresh} />
        <ManagementButton label="Sign out" disabled={disabled} onPress={() => run(() => CloudSyncService.signOut())} />
      </>}
      {busy && <Text style={s.notice} accessibilityLiveRegion="polite">Syncing…</Text>}
    </ManagementCard>
    {account && <Text style={s.text}>Tap Refresh cloud homes to see your backups. Restoring creates a separate home, so you can review it before making changes.</Text>}
    {account && homes.map(home => <ManagementCard key={home.id}>
      <Text style={s.heading}>{home.name}</Text>
      <Text style={s.text}>{home.updatedAt ? `Last backup: ${new Date(home.updatedAt).toLocaleString()}` : 'Backup ready'}</Text>
      <ManagementButton label={`Restore ${home.name}`} disabled={disabled} onPress={() => restore(home)} />
    </ManagementCard>)}
  </ManagementPage>;
}
