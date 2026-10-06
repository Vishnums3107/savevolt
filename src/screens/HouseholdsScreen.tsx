import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useEnergy } from '../context/EnergyContext';
import ManagementPage, { ManagementButton, ManagementCard, ManagementInput, useManagementStyles } from '../components/ManagementPage';

export default function HouseholdsScreen() {
  const { households, activeHouseholdId, isSwitchingHousehold, createHousehold, switchHousehold,
    renameHousehold, deleteHousehold } = useEnergy('households', 'activeHouseholdId', 'isSwitchingHousehold',
    'createHousehold', 'switchHousehold', 'renameHousehold', 'deleteHousehold');
  const s = useManagementStyles();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const busy = useRef(false);

  const run = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try { await action(); } catch (error) {
      Alert.alert('Home could not be updated', error instanceof Error ? error.message : 'Please try again.');
    } finally { busy.current = false; }
  };
  const save = () => run(async () => {
    if (editingId) await renameHousehold(editingId, name);
    else await switchHousehold(await createHousehold(name));
    setName('');
    setEditingId(null);
  });

  return <ManagementPage title="Homes" subtitle="Keep each home’s devices, rates, goals, and history together.">
    <ManagementCard>
      <Text style={s.heading} accessibilityRole="header">{editingId ? 'Rename home' : 'Add a home'}</Text>
      <ManagementInput label="Home name" value={name} onChangeText={setName} maxLength={60} placeholder="e.g., Apartment" />
      <ManagementButton label={editingId ? 'Save home name' : 'Create home'} onPress={save} disabled={isSwitchingHousehold || !name.trim()} />
      {editingId && <ManagementButton label="Cancel rename" disabled={isSwitchingHousehold} onPress={() => { setEditingId(null); setName(''); }} />}
    </ManagementCard>
    <Text style={s.text}>Homes are stored on this device. Use Account sync to back up a home or restore it on another device.</Text>
    {isSwitchingHousehold && <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={s.notice}>Updating your homes…</Text>}
    {households.map(home => {
      const active = home.id === activeHouseholdId;
      return <ManagementCard key={home.id}>
        <Text style={s.heading}>{home.name}</Text>
        {active && <Text style={s.notice}>Current home</Text>}
        <View style={s.row}>
          <ManagementButton label={`Switch to ${home.name}`} disabled={active || isSwitchingHousehold} onPress={() => run(() => switchHousehold(home.id))} />
          <ManagementButton label={`Rename ${home.name}`} disabled={isSwitchingHousehold} onPress={() => { setEditingId(home.id); setName(home.name); }} />
          {!active && <ManagementButton label={`Delete ${home.name}`} danger disabled={isSwitchingHousehold}
            onPress={() => Alert.alert(`Delete ${home.name}?`, 'This removes this home’s data from this device. Any cloud backup stays available.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete home', style: 'destructive', onPress: () => run(async () => {
                await deleteHousehold(home.id);
                if (editingId === home.id) { setEditingId(null); setName(''); }
              }) },
            ])} />}
        </View>
      </ManagementCard>;
    })}
  </ManagementPage>;
}
