import axios from 'axios';
import { useHeatingStore } from '../store/useHeatingStore';

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
    setError 
  } = useHeatingStore();

  const fetchCurrentStatus = async () => {
    console.log('Fetching current status from /rest/getcurrentstatus...');
    setLoading(true);
    try {
      const response = await api.get('/getcurrentstatus');
      console.log('Current status response received:', response.data);
      setZones(response.data.zones || []);
      setDhw(response.data.dhw || null);
      setSystem(response.data.system || null);
      setError(null);
    } catch (err: any) {
      console.error('Fetch status error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to fetch status';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSchedules = async () => {
    console.log('Fetching all schedules from /rest/getallschedules...');
    setLoading(true);
    try {
      const response = await api.get('/getallschedules');
      console.log('Schedules response received:', response.data);
      setInitialSchedules(response.data); // Use the new action here
      setError(null);
    } catch (err: any) {
      console.error('Fetch schedules error:', err);
      setError(err.message || 'Failed to fetch schedules');
    } finally {
      setLoading(false);
    }
  };

  const saveAllSchedules = async (schedules: Record<string, ZoneSchedule>) => {
    setLoading(true);
    try {
      await api.post('/saveallschedules', schedules);
      await fetchAllSchedules(); // Refetch to get the new "original" state
    } catch (err: any) {
      console.error('Save schedules error:', err);
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
