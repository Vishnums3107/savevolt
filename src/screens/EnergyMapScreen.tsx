import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { Appliance, Room, EnergyHotspot } from '../types';
import { calculateApplianceConsumption, formatEnergy, formatCost } from '../utils/energy';

const screenWidth = Dimensions.get('window').width;
const mapWidth = screenWidth - 40;
const mapHeight = 400;

const ROOM_POSITIONS = [
  { x: 50, y: 50 }, { x: 200, y: 50 }, { x: 50, y: 200 },
  { x: 200, y: 200 }, { x: 125, y: 125 }, { x: 50, y: 300 },
];

const RANK_BADGES = ['🥇', '🥈', '🥉'];

interface HeatLevel {
  name: string;
  /** Visible legend range */
  range: string;
  /** Range phrased for screen readers */
  spokenRange: string;
  /** Share of total consumption (%) the room must exceed to reach this level */
  above: number;
  color: string;
}

// Fixed intensity scale, identical in both themes so a level always looks the same. Every fill
// takes dark ink (onPrimary) at 5:1 or better, and each level is also spelled out in text.
const HEAT_LEVELS: HeatLevel[] = [
  { name: 'Low', range: '<5%', spokenRange: 'under 5%', above: -Infinity, color: '#10B981' },
  { name: 'Moderate', range: '5-15%', spokenRange: '5 to 15%', above: 5, color: '#FFC107' },
  { name: 'Medium', range: '15-30%', spokenRange: '15 to 30%', above: 15, color: '#F59E0B' },
  { name: 'High', range: '>30%', spokenRange: 'over 30%', above: 30, color: '#EF4444' },
];

const LEGEND_LABEL = `Heat map legend, share of total energy: ${HEAT_LEVELS.map(
  (level) => `${level.name}, ${level.spokenRange}`,
).join('; ')}`;

const getHeatLevel = (percentage: number): HeatLevel => {
  for (let i = HEAT_LEVELS.length - 1; i > 0; i--) {
    if (percentage > HEAT_LEVELS[i].above) return HEAT_LEVELS[i];
  }
  return HEAT_LEVELS[0];
};

interface RoomHotspot extends EnergyHotspot {
  room: Room;
  appliances: Appliance[];
  level: HeatLevel;
}

const describeHotspot = (hotspot: RoomHotspot, currency: string, digits = 0) =>
  `${hotspot.roomName}: ${formatEnergy(hotspot.totalConsumption)} and ` +
  `${formatCost(hotspot.totalCost, currency)} per month, ` +
  `${hotspot.percentage.toFixed(digits)}% of total energy, ${hotspot.level.name.toLowerCase()} usage`;

const EnergyMapScreen = () => {
  const { appliances, settings, rooms, addRoom, assignApplianceToRoom } = useEnergy(
    'appliances',
    'settings',
    'rooms',
    'addRoom',
    'assignApplianceToRoom',
  );
  const { electricityRate, currency } = settings;
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignRoomId, setAssignRoomId] = useState<string | null>(null);

  // Daily kWh per appliance, shared by the hotspot totals and the room details list
  const dailyKwhById = useMemo(() => {
    const byId = new Map<string, number>();
    appliances.forEach((app) => byId.set(app.id, calculateApplianceConsumption(app, 1)));
    return byId;
  }, [appliances]);

  // Calculate energy hotspots
  const hotspots = useMemo<RoomHotspot[]>(() => {
    const totalConsumption = appliances.reduce(
      (sum, app) => sum + (dailyKwhById.get(app.id) ?? 0),
      0,
    );

    return rooms.map((room) => {
      const roomAppliances = appliances.filter(a => room.appliances.includes(a.id));
      const consumption = roomAppliances.reduce(
        (sum, app) => sum + (dailyKwhById.get(app.id) ?? 0),
        0,
      );
      const monthlyConsumption = consumption * 30;
      const percentage = totalConsumption > 0 ? (consumption / totalConsumption) * 100 : 0;
      const level = getHeatLevel(percentage);

      return {
        roomId: room.id,
        roomName: room.name,
        totalConsumption: monthlyConsumption,
        totalCost: monthlyConsumption * electricityRate,
        percentage,
        color: level.color,
        room,
        appliances: roomAppliances,
        level,
      };
    });
  }, [rooms, appliances, dailyKwhById, electricityRate]);

  const rankedHotspots = useMemo(
    () => [...hotspots].sort((a, b) => b.percentage - a.percentage),
    [hotspots],
  );

  const selectedHotspot = useMemo(
    () => hotspots.find(h => h.roomId === selectedRoom) ?? null,
    [hotspots, selectedRoom],
  );

  const unassignedAppliances = useMemo(() => {
    const assignedIds = new Set(rooms.flatMap(r => r.appliances));
    return appliances.filter(a => !assignedIds.has(a.id));
  }, [rooms, appliances]);

  const assignRoomName = rooms.find(r => r.id === assignRoomId)?.name;
  const trimmedRoomName = newRoomName.trim();

  const handleAddRoom = () => {
    setNewRoomName('');
    setShowAddRoomModal(true);
  };

  const closeAddRoom = () => setShowAddRoomModal(false);

  const confirmAddRoom = () => {
    if (trimmedRoomName) {
      const newRoom: Room = {
        id: `room-${Date.now()}`,
        name: trimmedRoomName,
        appliances: [],
        position: ROOM_POSITIONS[rooms.length % ROOM_POSITIONS.length],
      };
      addRoom(newRoom);
      setShowAddRoomModal(false);
    }
  };

  const handleAssignAppliance = (roomId: string) => {
    setAssignRoomId(roomId);
    setShowAssignModal(true);
  };

  const closeAssign = () => setShowAssignModal(false);

  const handlePickAppliance = (applianceId: string) => {
    if (assignRoomId) {
      assignApplianceToRoom(applianceId, assignRoomId);
    }
    setShowAssignModal(false);
  };

  const handleRoomPress = (roomId: string) => {
    setSelectedRoom(prev => (prev === roomId ? null : roomId));
  };

  const header = (
    <LinearGradient colors={colors.heroGradient} style={s.header}>
      <Text style={s.headerLabel} accessible={false} importantForAccessibility="no">
        ENERGY MAP
      </Text>
      <Text style={s.headerTitle} accessibilityRole="header">Energy Map</Text>
    </LinearGradient>
  );

  // Rendered in both branches so "Add First Room" can open it from the empty state
  const addRoomModal = (
    <Modal
      visible={showAddRoomModal}
      animationType="fade"
      transparent
      onRequestClose={closeAddRoom}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalContent}>
          <Text style={s.modalTitle} accessibilityRole="header">Add Room</Text>
          <TextInput
            style={s.modalInput}
            value={newRoomName}
            onChangeText={setNewRoomName}
            placeholder="Enter room name"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            accessibilityLabel="Room name"
            autoFocus
          />
          <View style={s.modalButtons}>
            <AccessibleTouchable
              label="Cancel"
              hint="Closes without adding a room"
              style={[s.modalCancel, s.modalRowButton]}
              onPress={closeAddRoom}
            >
              <Text style={s.modalCancelText}>Cancel</Text>
            </AccessibleTouchable>
            <AccessibleTouchable
              label="Add room"
              hint={trimmedRoomName ? 'Places the room on your energy map' : 'Enter a room name first'}
              disabled={!trimmedRoomName}
              accessibilityState={{ disabled: !trimmedRoomName }}
              style={!trimmedRoomName && s.disabled}
              onPress={confirmAddRoom}
            >
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.modalConfirm}>
                <Text style={s.modalConfirmText}>Add</Text>
              </LinearGradient>
            </AccessibleTouchable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (rooms.length === 0) {
    return (
      <View style={s.container}>
        <FocusAwareStatusBar variant="hero" />
        {header}
        <EmptyState
          icon="🏠"
          title="No Rooms Added"
          body="Create rooms like Kitchen or Bedroom, then assign appliances to see which parts of your home use the most energy."
          primaryAction={{
            label: 'Add First Room',
            hint: 'Opens a form to name your first room',
            onPress: handleAddRoom,
          }}
        />
        {addRoomModal}
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      {header}

      {/* Heat Map Legend */}
      <View style={s.legend} accessible accessibilityLabel={LEGEND_LABEL}>
        <Text style={s.legendTitle}>Heat Map Legend:</Text>
        <View style={s.legendItems}>
          {HEAT_LEVELS.map((level) => (
            <View key={level.name} style={s.legendItem}>
              <View style={[s.legendColor, { backgroundColor: level.color }]} />
              <Text style={s.legendText}>{level.name} ({level.range})</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Energy Map Visualization */}
      <View style={s.mapContainer}>
        <View style={s.map}>
          {hotspots.map((hotspot) => {
            // Calculate size based on consumption percentage
            const size = Math.max(60, Math.min(120, 60 + (hotspot.percentage * 2)));
            const isSelected = selectedRoom === hotspot.roomId;

            return (
              <AccessibleTouchable
                key={hotspot.roomId}
                label={describeHotspot(hotspot, currency)}
                hint={isSelected ? 'Hides the room details' : 'Shows the room details and its appliances'}
                accessibilityState={{ selected: isSelected, expanded: isSelected }}
                style={[
                  s.roomMarker,
                  {
                    backgroundColor: hotspot.color,
                    width: size,
                    height: size,
                    left: hotspot.room.position.x,
                    top: hotspot.room.position.y,
                  },
                  isSelected && s.roomMarkerSelected,
                ]}
                onPress={() => handleRoomPress(hotspot.roomId)}
              >
                <Text style={s.roomName} numberOfLines={2}>{hotspot.roomName}</Text>
                <Text style={s.roomPercentage}>{hotspot.percentage.toFixed(0)}%</Text>
              </AccessibleTouchable>
            );
          })}
        </View>
      </View>

      {/* Room Details */}
      {selectedHotspot && (
        <View style={s.detailsContainer}>
          <View style={s.detailsCard}>
            <Text
              style={s.detailsTitle}
              accessibilityRole="header"
              accessibilityLabel={`${selectedHotspot.roomName} details`}
            >
              📍 {selectedHotspot.roomName}
            </Text>

            <View style={s.statsRow}>
              <View
                style={s.statBox}
                accessible
                accessibilityLabel={`Monthly energy: ${formatEnergy(selectedHotspot.totalConsumption)}`}
              >
                <Text style={s.statLabel}>Monthly Energy</Text>
                <Text style={s.statValue}>{formatEnergy(selectedHotspot.totalConsumption)}</Text>
              </View>
              <View
                style={s.statBox}
                accessible
                accessibilityLabel={`Monthly cost: ${formatCost(selectedHotspot.totalCost, currency)}`}
              >
                <Text style={s.statLabel}>Monthly Cost</Text>
                <Text style={s.statValue}>{formatCost(selectedHotspot.totalCost, currency)}</Text>
              </View>
              <View
                style={s.statBox}
                accessible
                accessibilityLabel={`Share of total: ${selectedHotspot.percentage.toFixed(1)}%`}
              >
                <Text style={s.statLabel}>% of Total</Text>
                <Text style={s.statValue}>{selectedHotspot.percentage.toFixed(1)}%</Text>
              </View>
            </View>

            <View style={s.appliancesHeaderRow}>
              <Text style={s.appliancesTitle} accessibilityRole="header">
                Appliances in this room:
              </Text>
              <AccessibleTouchable
                label={`Assign appliance to ${selectedHotspot.roomName}`}
                hint="Opens a list of appliances that are not in a room yet"
                onPress={() => handleAssignAppliance(selectedHotspot.roomId)}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={s.assignButton}
                >
                  <Text style={s.assignButtonText}>+ Assign</Text>
                </LinearGradient>
              </AccessibleTouchable>
            </View>
            {selectedHotspot.appliances.length === 0 ? (
              <EmptyState
                variant="inline"
                icon="🔌"
                title="No appliances here yet"
                body={`Assign appliances to ${selectedHotspot.roomName} to see how much energy this room uses.`}
                primaryAction={{
                  label: 'Assign Appliance',
                  hint: 'Opens a list of appliances that are not in a room yet',
                  onPress: () => handleAssignAppliance(selectedHotspot.roomId),
                }}
              />
            ) : (
              selectedHotspot.appliances.map((appliance) => {
                const monthly = formatEnergy((dailyKwhById.get(appliance.id) ?? 0) * 30);
                return (
                  <View
                    key={appliance.id}
                    style={s.applianceItem}
                    accessible
                    accessibilityLabel={`${appliance.name}: ${monthly} per month`}
                  >
                    <Text style={s.applianceName}>{appliance.name}</Text>
                    <Text style={s.applianceConsumption}>{monthly}/mo</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      )}

      {/* Hotspot Summary */}
      <View style={s.summaryContainer}>
        <Text style={s.summaryTitle} accessibilityRole="header">Energy Hotspots Ranking</Text>
        {rankedHotspots.map((hotspot, index) => (
          <View
            key={hotspot.roomId}
            style={s.hotspotItem}
            accessible
            accessibilityLabel={`Rank ${index + 1}, ${describeHotspot(hotspot, currency, 1)}`}
          >
            <View style={s.hotspotRank}>
              <Text style={s.rankText}>{RANK_BADGES[index] ?? `${index + 1}.`}</Text>
            </View>
            <View style={s.hotspotInfo}>
              <Text style={s.hotspotName}>{hotspot.roomName}</Text>
              <View
                style={s.hotspotBar}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(hotspot.percentage) }}
              >
                <View
                  style={[
                    s.hotspotBarFill,
                    { width: `${hotspot.percentage}%`, backgroundColor: hotspot.color },
                  ]}
                />
              </View>
            </View>
            <Text style={s.hotspotValue}>{hotspot.percentage.toFixed(1)}%</Text>
          </View>
        ))}
      </View>

      <AccessibleTouchable
        label="Add room"
        hint="Opens a form to name a new room"
        onPress={handleAddRoom}
        style={s.fabWrapper}
      >
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.fab}>
          <Text style={s.fabText}>+ Add Room</Text>
        </LinearGradient>
      </AccessibleTouchable>

      {addRoomModal}

      {/* Assign Appliance Modal */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        transparent
        onRequestClose={closeAssign}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, s.assignModalContent]}>
            <Text style={s.modalTitle} accessibilityRole="header">Assign Appliance</Text>
            <ScrollView>
              {unassignedAppliances.length > 0 ? (
                unassignedAppliances.map(appliance => (
                  <AccessibleTouchable
                    key={appliance.id}
                    label={`Assign ${appliance.name}, ${appliance.powerRating} watts, ${appliance.category}`}
                    hint={assignRoomName ? `Adds it to ${assignRoomName}` : undefined}
                    style={s.assignItem}
                    onPress={() => handlePickAppliance(appliance.id)}
                  >
                    <Text style={s.assignItemName}>{appliance.name}</Text>
                    <Text style={s.assignItemInfo}>{appliance.powerRating}W - {appliance.category}</Text>
                  </AccessibleTouchable>
                ))
              ) : appliances.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon="🔌"
                  title="No appliances yet"
                  body="Add appliances from the Track tab first, then place them in rooms here."
                />
              ) : (
                <EmptyState
                  variant="inline"
                  icon="✅"
                  title="All appliances are assigned"
                  body="Every appliance already belongs to a room. New appliances you add will show up here."
                />
              )}
            </ScrollView>
            <AccessibleTouchable
              label="Close"
              hint="Closes the appliance list"
              style={s.modalCancel}
              onPress={closeAssign}
            >
              <Text style={s.modalCancelText}>Close</Text>
            </AccessibleTouchable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingTop: 54,
    paddingBottom: 28,
    paddingHorizontal: Spacing.page,
    alignItems: 'center',
  },
  headerLabel: {
    ...Typography.overline,
    color: c.primary,
    marginBottom: 4,
  },
  headerTitle: {
    ...Typography.displaySmall,
    color: c.textOnDark,
  },
  legend: {
    backgroundColor: c.card,
    margin: Spacing.page,
    padding: Spacing.lg,
    borderRadius: Radius.card,
    ...Shadows.sm,
  },
  legendTitle: {
    ...Typography.label,
    color: c.text,
    marginBottom: Spacing.md,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: Spacing.xs,
    marginRight: Spacing.xs,
  },
  legendText: {
    ...Typography.bodySmall,
    color: c.textSecondary,
  },
  mapContainer: {
    marginHorizontal: Spacing.page,
    backgroundColor: c.card,
    borderRadius: Radius.card,
    ...Shadows.md,
    overflow: 'hidden',
  },
  map: {
    width: mapWidth,
    height: mapHeight,
    backgroundColor: c.background,
    position: 'relative',
  },
  roomMarker: {
    position: 'absolute',
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    ...Shadows.md,
  },
  // c.text contrasts with the map surface in both themes (a white ring vanished on light)
  roomMarkerSelected: { borderWidth: 3, borderColor: c.text },
  // Heat fills are bright in both themes, so marker text uses the dark ink
  roomName: {
    ...Typography.labelSmall,
    color: c.onPrimary,
    textAlign: 'center',
  },
  roomPercentage: {
    ...Typography.statSmall,
    color: c.onPrimary,
    marginTop: 2,
  },
  detailsContainer: {
    marginHorizontal: Spacing.page,
    marginTop: Spacing.page,
  },
  detailsCard: {
    backgroundColor: c.card,
    padding: Spacing.page,
    borderRadius: Radius.card,
    ...Shadows.md,
  },
  detailsTitle: {
    ...Typography.h2,
    color: c.text,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.page,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...Typography.labelSmall,
    color: c.textSecondary,
    marginBottom: Spacing.xs,
  },
  // Bright green text washes out on a white card; the deeper green reads better in light mode
  statValue: {
    ...Typography.statSmall,
    color: c.primaryText,
  },
  appliancesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  appliancesTitle: {
    ...Typography.label,
    color: c.text,
  },
  assignButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.card,
  },
  assignButtonText: {
    ...Typography.labelSmall,
    color: c.onPrimary,
  },
  applianceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  applianceName: {
    ...Typography.bodyMedium,
    color: c.text,
  },
  applianceConsumption: {
    ...Typography.label,
    color: c.primaryText,
  },
  summaryContainer: {
    backgroundColor: c.card,
    margin: Spacing.page,
    marginTop: Spacing.page,
    padding: Spacing.page,
    borderRadius: Radius.card,
    ...Shadows.md,
  },
  summaryTitle: {
    ...Typography.h3,
    color: c.text,
    marginBottom: Spacing.lg,
  },
  hotspotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  hotspotRank: {
    width: 40,
  },
  rankText: {
    fontSize: 18,
    color: c.text,
  },
  hotspotInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  hotspotName: {
    ...Typography.label,
    color: c.text,
    marginBottom: Spacing.xs,
  },
  hotspotBar: {
    height: 8,
    backgroundColor: c.border,
    borderRadius: Spacing.xs,
    overflow: 'hidden',
  },
  hotspotBarFill: {
    height: '100%',
    borderRadius: Spacing.xs,
  },
  hotspotValue: {
    ...Typography.label,
    color: c.textSecondary,
    width: 50,
    textAlign: 'right',
  },
  fabWrapper: {
    alignSelf: 'center',
    marginVertical: Spacing.page,
  },
  fab: {
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: Radius.pill,
    ...Shadows.lg,
  },
  fabText: {
    ...Typography.h3,
    color: c.onPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: Spacing.page,
    width: '85%',
    ...Shadows.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: c.text,
    marginBottom: Spacing.lg,
  },
  assignModalContent: { maxHeight: '70%' },
  modalInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    ...Typography.bodyLarge,
    color: c.text,
    backgroundColor: c.inputBg,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.md,
  },
  modalCancel: {
    paddingHorizontal: Spacing.page,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: c.background,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  // Keeps Cancel level with Add when both sit in the button row
  modalRowButton: { marginTop: 0 },
  modalCancelText: {
    ...Typography.h3,
    color: c.textSecondary,
  },
  modalConfirm: {
    paddingHorizontal: Spacing.page,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
  },
  modalConfirmText: {
    ...Typography.h3,
    color: c.onPrimary,
  },
  disabled: { opacity: 0.5 },
  assignItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  assignItemName: {
    ...Typography.h3,
    color: c.text,
  },
  assignItemInfo: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    marginTop: 2,
  },
});

export default EnergyMapScreen;
