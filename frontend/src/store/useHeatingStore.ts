import { create } from 'zustand';
import { produce } from 'immer';
import isEqual from 'lodash.isequal';

// --- Types ---
interface Switchpoint {
  heatSetpoint: number;
  timeOfDay: string;
}
interface DailySchedule {
  dayOfWeek: string;
  switchpoints: Switchpoint[];
}
interface ZoneSchedule {
  name: string;
  schedule: DailySchedule[];
}
interface ZoneStatus {
  zoneId: string;
  name: string;
  setpoint: number;
  temperature: number;
  setpointMode: string;
  until?: string;
}
interface DhwStatus {
  dhwId: string;
  state: string;
  temperature: number;
  setpointMode: string;
  until?: string;
}
interface SystemStatus {
  systemMode: string;
  timeUntil?: string;
  permanent: boolean;
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
  error: string | null;
  provider: string | null; // NEW: Track data source
  
  setZones: (zones: ZoneStatus[]) => void;
  setDhw: (dhw: DhwStatus | null) => void;
  setSystem: (system: SystemStatus | null) => void;
  setInitialSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProvider: (provider: string | null) => void; // NEW
}

export const useHeatingStore = create<HeatingState>((set, get) => ({
  zones: [],
  dhw: null,
  system: null,
  schedules: {},
  originalSchedules: {},
  isDirty: false,
  loading: false,
  error: null,
  provider: null,

  setZones: (zones) => set({ zones }),
  setDhw: (dhw) => set({ dhw }),
  setSystem: (system) => set({ system }),
  
  setInitialSchedules: (schedules) => set({ 
    schedules, 
    originalSchedules: schedules, 
    isDirty: false 
  }),

  setSchedules: (schedules) => {
    const original = get().originalSchedules;
    set({
      schedules,
      isDirty: !isEqual(original, schedules),
    });
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setProvider: (provider) => set({ provider }),
}));
