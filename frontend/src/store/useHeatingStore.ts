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
  originalSchedules: Record<string, ZoneSchedule>; // Store the pristine version
  isDirty: boolean; // Is the current schedule modified?
  loading: boolean;
  error: string | null;
  
  setZones: (zones: ZoneStatus[]) => void;
  setDhw: (dhw: DhwStatus | null) => void;
  setSystem: (system: SystemStatus | null) => void;
  // This will now set both the working copy and the original
  setInitialSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  // This will only update the working copy
  setSchedules: (schedules: Record<string, ZoneSchedule>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
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
}));
