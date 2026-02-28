import axios from 'axios';
import { useHeatingStore } from '../store/useHeatingStore';
import isEqual from 'lodash.isequal';

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
    setLoading, 
    setError,
    originalSchedules,
    setProvider
  } = useHeatingStore();

  const ensureProviderInfo = async () => {
    try {
        const response = await api.get('/session');
        const providerName = response.data.userId ? 'Honeywell' : (response.data.provider || 'Unknown');
        setProvider(providerName);
    } catch (e) {
        console.error("Failed to fetch provider info");
    }
  }

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

      if (changeCount === 0) {
          setLoading(false);
          return;
      }

      await api.post('/saveallschedules', changedSchedules);
      await fetchAllSchedules(true); 
    } catch (err: any) {
      setError(err.message || 'Failed to save schedules');
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchCurrentStatus,
    fetchAllSchedules,
    saveAllSchedules,
  };
};
