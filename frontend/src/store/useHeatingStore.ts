import { create } from 'zustand';
import { produce } from 'immer';
import isEqual from 'lodash.isequal';

// --- Types ---
interface Switchpoint { heatSetpoint?: number; state?: string; timeOfDay: string; }
interface DailySchedule { dayOfWeek: string; switchpoints: Switchpoint[]; }
interface ZoneSchedule { name: string; schedule: DailySchedule[]; fetchedAt?: string; }
interface ZoneStatus { zoneId: string; name: string; label?: string; setpoint: number; temperature: number; setpointMode: string; until?: string; }
interface DhwStatus { dhwId: string; state: string; temperature: number; setpointMode: string; until?: string; }
interface SystemStatus { systemMode: string; timeUntil?: string; permanent: boolean; }

export interface ProviderSnapshot {
    zones: ZoneStatus[];
    dhw: DhwStatus | null;
    connected: boolean;
    status: string;
    error?: string;
}

export interface ProvidersStatus {
    mqtt:  { available: boolean; connected: boolean; status: string; error?: string };
    cloud: { available: boolean; connected: boolean; status: string; error?: string };
}
// -------------

interface HeatingState {
  zones: ZoneStatus[];
  dhw: DhwStatus | null;
  system: SystemStatus | null;
  schedules: Record<string, ZoneSchedule>;
  originalSchedules: Record<string, ZoneSchedule>;
  isDirty: boolean;
  loading: boolean;
  loadingMessage: string | null;
  error: string | null;
  provider: {
      name: string;
      error: string | null;
      gatewayStatus?: string;
  } | null;
  uiConfig: {
      timeResolution: number;
      defaultTemp: number;
      longPressMs: number;
      apiTimeout: number;
      scheduleStaleThresholdDays?: number;
      mqttSaveMode?: 'week' | 'day';
      accentColor?: string;
      dhwColors?: { on: string; off: string };
      tempColors?: { maxTemp?: number; color: string }[];
  } | null;
  selectedZoneId: string | null;
  failedSchedules: Set<string>;
  saveFailedZones: Set<string>;

  // Dual-provider dashboard data
  mqttSnapshot: ProviderSnapshot | null;
  cloudSnapshot: ProviderSnapshot | null;
  providersStatus: ProvidersStatus | null;

  // Single shared bottom notification bar, rendered once in App.tsx so it's
  // visible regardless of active tab (Scheduler and App-level code both post
  // to this — kept in the store, not component-local, precisely so there's
  // only ever one "fixed bottom-0" bar rather than two independently-shown
  // ones stacking/hiding each other).
  notification: { type: 'success' | 'error'; message: string } | null;
  // True while a bulk zone-schedule download (revert's missing-zone catch-up,
  // or the forced re-download) is in flight — lets the Refresh All button
  // switch to "Cancel" without reacting to unrelated loading states.
  isRefreshRunning: boolean;
  // Copied schedule slot(s), ready to paste — Scheduler-only concept, but
  // lives here too so the shared bottom bar can show/clear it without
  // reaching into Scheduler's component state. clipboardSource is the
  // day/zone label copied FROM, used to highlight it in the grid.
  clipboard: any[] | null;
  clipboardSource: string | null;
  clipboardMessage: string | null;

  setZones: (zones: ZoneStatus[]) => void;
  setDhw: (dhw: DhwStatus | null) => void;
  setSystem: (system: SystemStatus | null) => void;
  setInitialSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  revertSchedules: () => void;
  setZoneSchedule: (zoneId: string, schedule: ZoneSchedule, isInitial?: boolean) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string | null) => void;
  setError: (error: string | null) => void;
  setProviderInfo: (name: string, error: string | null, gatewayStatus?: string) => void;
  setUiConfig: (config: any) => void;
  setSelectedZoneId: (id: string | null) => void;
  markScheduleFailed: (id: string) => void;
  clearFailedSchedules: () => void;
  markSaveZoneFailed: (id: string) => void;
  clearSaveFailedZones: () => void;
  setMqttSnapshot: (snapshot: ProviderSnapshot | null) => void;
  setCloudSnapshot: (snapshot: ProviderSnapshot | null) => void;
  setProvidersStatus: (status: ProvidersStatus) => void;
  setNotification: (n: { type: 'success' | 'error'; message: string } | null) => void;
  setIsRefreshRunning: (v: boolean) => void;
  setClipboard: (data: any[] | null) => void;
  setClipboardSource: (source: string | null) => void;
  setClipboardMessage: (message: string | null) => void;
}

export const useHeatingStore = create<HeatingState>((set, get) => ({
  zones: [],
  dhw: null,
  system: null,
  schedules: {},
  originalSchedules: {},
  isDirty: false,
  loading: false,
  loadingMessage: null,
  error: null,
  provider: null,
  uiConfig: null,
  selectedZoneId: localStorage.getItem('evoWeb:lastZoneId'),
  failedSchedules: new Set(),
  saveFailedZones: new Set(),
  mqttSnapshot: null,
  cloudSnapshot: null,
  providersStatus: null,
  notification: null,
  isRefreshRunning: false,
  clipboard: null,
  clipboardSource: null,
  clipboardMessage: null,

  setZones: (zones) => set({ zones }),
  setDhw: (dhw) => set({ dhw }),
  setSystem: (system) => set({ system }),
  setInitialSchedules: (schedules) => set({ schedules, originalSchedules: schedules, isDirty: false }),
  setSchedules: (schedules) => {
    const original = get().originalSchedules;
    set({ schedules, isDirty: !isEqual(original, schedules) });
  },
  // Discard any in-progress edits, restoring the last-loaded values — no network I/O.
  revertSchedules: () => set((state) => ({ schedules: state.originalSchedules, isDirty: false })),
  setZoneSchedule: (zoneId: string, schedule: ZoneSchedule, isInitial = false) => {
    const schedules = produce(get().schedules, draft => {
        draft[zoneId] = schedule;
    });
    if (isInitial) {
        const originalSchedules = produce(get().originalSchedules, draft => {
            draft[zoneId] = schedule;
        });
        set({ schedules, originalSchedules, isDirty: !isEqual(originalSchedules, schedules) });
    } else {
        set({ schedules, isDirty: !isEqual(get().originalSchedules, schedules) });
    }
  },
  setLoading: (loading) => set({ loading }),
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),
  setError: (error) => set({ error }),
  setProviderInfo: (name, error, gatewayStatus) => set({ provider: { name, error, gatewayStatus } }),
  setUiConfig: (uiConfig) => set({ uiConfig }),
  setSelectedZoneId: (selectedZoneId) => set({ selectedZoneId }),
  markScheduleFailed: (id) => set(produce((state: HeatingState) => { state.failedSchedules.add(id); })),
  clearFailedSchedules: () => set({ failedSchedules: new Set() }),
  markSaveZoneFailed: (id) => set(produce((state: HeatingState) => { state.saveFailedZones.add(id); })),
  clearSaveFailedZones: () => set({ saveFailedZones: new Set() }),
  setMqttSnapshot: (mqttSnapshot) => set({ mqttSnapshot }),
  setCloudSnapshot: (cloudSnapshot) => set({ cloudSnapshot }),
  setProvidersStatus: (providersStatus) => set({ providersStatus }),
  setNotification: (notification) => set({ notification }),
  setIsRefreshRunning: (isRefreshRunning) => set({ isRefreshRunning }),
  setClipboard: (clipboard) => set({ clipboard }),
  setClipboardSource: (clipboardSource) => set({ clipboardSource }),
  setClipboardMessage: (clipboardMessage) => set({ clipboardMessage }),
}));
