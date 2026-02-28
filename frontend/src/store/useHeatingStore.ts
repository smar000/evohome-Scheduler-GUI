import { create } from 'zustand';
import { produce } from 'immer';
import isEqual from 'lodash.isequal';

// --- Types ---
interface Switchpoint { heatSetpoint: number; timeOfDay: string; }
interface DailySchedule { dayOfWeek: string; switchpoints: Switchpoint[]; }
interface ZoneSchedule { name: string; schedule: DailySchedule[]; }
interface ZoneStatus { zoneId: string; name: string; setpoint: number; temperature: number; setpointMode: string; until?: string; }
interface DhwStatus { dhwId: string; state: string; temperature: number; setpointMode: string; until?: string; }
interface SystemStatus { systemMode: string; timeUntil?: string; permanent: boolean; }
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
  } | null; 
  selectedZoneId: string | null;
  failedSchedules: Set<string>;
  
  setZones: (zones: ZoneStatus[]) => void;
  setDhw: (dhw: DhwStatus | null) => void;
  setSystem: (system: SystemStatus | null) => void;
  setInitialSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string | null) => void;
  setError: (error: string | null) => void;
  setProviderInfo: (name: string, error: string | null) => void;
  setSelectedZoneId: (id: string | null) => void;
  markScheduleFailed: (id: string) => void;
  clearFailedSchedules: () => void;
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
  selectedZoneId: null,
  failedSchedules: new Set(),

  setZones: (zones) => {
    set({ zones });
    if (!get().selectedZoneId && zones.length > 0) {
        set({ selectedZoneId: zones[0].zoneId });
    }
  },
  setDhw: (dhw) => set({ dhw }),
  setSystem: (system) => set({ system }),
  setInitialSchedules: (schedules) => set({ schedules, originalSchedules: schedules, isDirty: false }),
  setSchedules: (schedules) => {
    const original = get().originalSchedules;
    set({ schedules, isDirty: !isEqual(original, schedules) });
  },
  setLoading: (loading) => set({ loading }),
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),
  setError: (error) => set({ error }),
  setProviderInfo: (name, error) => set({ provider: { name, error } }),
  setSelectedZoneId: (selectedZoneId) => set({ selectedZoneId }),
  markScheduleFailed: (id) => set(produce((state: HeatingState) => { state.failedSchedules.add(id); })),
  clearFailedSchedules: () => set({ failedSchedules: new Set() }),
}));
