import axios from 'axios';
import { useHeatingStore } from '../store/useHeatingStore';
import isEqual from 'lodash.isequal';
import { produce } from 'immer';

// --- Types ---
interface ZoneSchedule {
  name: string;
  schedule: {
    dayOfWeek: string;
    switchpoints: {
      heatSetpoint: number;
      timeOfDay: string;
    }[];
  }[];
}
// -------------

const api = axios.create({
  baseURL: '/rest',
  timeout: 15000,
});

export const useHeatingApi = () => {
  const { 
    setZones, 
    setDhw, 
    setSystem, 
    setInitialSchedules, 
    setSchedules,
    setLoading, 
    setLoadingMessage,
    setError,
    originalSchedules,
    setProviderInfo
  } = useHeatingStore();

  const ensureProviderInfo = async () => {
    try {
        const response = await api.get('/session');
        const name = response.data.userId ? 'Honeywell' : (response.data.provider || 'Unknown');
        const error = response.data.error || null;
        setProviderInfo(name, error);
    } catch (e) {
        console.error("Failed to fetch provider info");
    }
  }

  const selectProvider = async (type: 'honeywell' | 'mqtt' | 'mock') => {
    setLoading(true);
    try {
        await api.post('/selectprovider', { type });
        window.location.reload(); 
    } catch (err: any) {
        setError(err.message || 'Failed to switch provider');
        setLoading(false);
    }
  };

  const fetchCurrentStatus = async (force = false, preferCache = false) => {
    let url = '/getcurrentstatus';
    if (force) url += '?refresh=true';
    else if (preferCache) url += '?cache=true';

    await ensureProviderInfo();
    setLoading(true);
    try {
      const response = await api.get(url);
      setZones(response.data.zones || []);
      setDhw(response.data.dhw || null);
      setSystem(response.data.system || null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSchedules = async (force = false, preferCache = false) => {
    let url = '/getallschedules';
    if (force) url += '?refresh=true';
    else if (preferCache) url += '?cache=true';

    await ensureProviderInfo();
    setLoading(true);
    try {
      const response = await api.get(url);
      setInitialSchedules(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch schedules');
    } finally {
      setLoading(false);
    }
  };

  const saveAllSchedules = async (schedules: Record<string, ZoneSchedule>) => {
    setLoading(true);
    try {
      const changedSchedules: Record<string, ZoneSchedule> = {};
      let changeCount = 0;
      for (const zoneId in schedules) {
          if (!isEqual(schedules[zoneId], originalSchedules[zoneId])) {
              changedSchedules[zoneId] = schedules[zoneId];
              changeCount++;
          }
      }
      if (changeCount === 0) { setLoading(false); return; }
      await api.post('/saveallschedules', changedSchedules);
      
      // Update local store immediately with the saved values
      // This prevents the UI from reverting while waiting for async MQTT updates
      setInitialSchedules(schedules); 
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save schedules');
    } finally {
      setLoading(false);
    }
  };

  const refreshMqttMappings = async () => {
    setLoading(true);
    try {
        await api.post('/mqtt/refresh-mappings');
        await fetchCurrentStatus(true); 
        setError(null);
    } catch (err: any) {
        setError(err.message || 'Failed to refresh mappings');
    } finally {
        setLoading(false);
    }
  };

  const fetchScheduleForZone = async (zoneId: string) => {
    setLoading(true);
    const zone = useHeatingStore.getState().zones.find(z => z.zoneId === zoneId);
    setLoadingMessage(`Fetching schedule: ${zone?.name || zoneId}...`);
    try {
        const response = await api.get(`/getscheduleforzone/${zoneId}`);
        setSchedules(produce(useHeatingStore.getState().schedules, draft => {
            draft[zoneId] = response.data;
        }));
        setError(null);
    } catch (err: any) {
        setError(err.message || `Failed to fetch schedule for zone ${zoneId}`);
    } finally {
        setLoading(false);
        setLoadingMessage(null);
    }
  };

  const fetchAllSchedulesSequentially = async () => {
    const { zones } = useHeatingStore.getState();
    setLoading(true);
    try {
        for (const zone of zones) {
            setLoadingMessage(`Refreshing all: ${zone.name}...`);
            const response = await api.get(`/getscheduleforzone/${zone.zoneId}`);
            setSchedules(produce(useHeatingStore.getState().schedules, draft => {
                draft[zone.zoneId] = response.data;
            }));
        }
        setError(null);
    } catch (err: any) {
        setError(err.message || `Failed to download all schedules`);
    } finally {
        setLoading(false);
        setLoadingMessage(null);
    }
  };

  return {
    fetchCurrentStatus,
    fetchAllSchedules,
    saveAllSchedules,
    selectProvider,
    refreshMqttMappings,
    fetchScheduleForZone,
    fetchAllSchedulesSequentially
  };
};
