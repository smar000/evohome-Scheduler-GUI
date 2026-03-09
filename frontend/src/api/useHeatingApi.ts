import axios from 'axios';
import { useHeatingStore } from '../store/useHeatingStore';
import isEqual from 'lodash.isequal';

// --- Types ---
interface ZoneSchedule {
  name: string;
  fetchedAt?: string;
  schedule: {
    dayOfWeek: string;
    switchpoints: {
      heatSetpoint?: number;
      state?: string;
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
    setZoneSchedule,
    setLoading,
    setLoadingMessage,
    setError,
    originalSchedules,
    setProviderInfo,
    setUiConfig,
    markScheduleFailed,
    setMqttSnapshot,
    setCloudSnapshot,
    setProvidersStatus,
  } = useHeatingStore();

  const ensureConfig = async () => {
    if (useHeatingStore.getState().uiConfig) return;
    try {
        const response = await api.get('/config');
        setUiConfig(response.data);
        if (response.data.apiTimeout) {
            api.defaults.timeout = response.data.apiTimeout;
        }
    } catch (e) {
        console.error("Failed to fetch UI config");
    }
  };

  const ensureProviderInfo = async () => {
    await ensureConfig();
    try {
        const response = await api.get('/session');
        const name = response.data.userId ? 'Honeywell' : (response.data.provider || 'Unknown');
        const error = response.data.error || null;
        const gatewayStatus = response.data.gatewayStatus || null;
        setProviderInfo(name, error, gatewayStatus);
    } catch (e) {
        console.error("Failed to fetch provider info");
    }
  };

  const selectProvider = async (type: 'honeywell' | 'mqtt' | 'mock') => {
    setLoading(true);
    try {
        await api.post('/selectprovider', { type });
        // Clear persisted zone so the next load starts fresh for the new provider
        localStorage.removeItem('evoWeb:lastZoneId');
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

  const fetchScheduleForZone = async (zoneId: string, isInitial = false, force = false) => {
    setLoading(true);
    const zone = useHeatingStore.getState().zones.find(z => z.zoneId === zoneId);
    setLoadingMessage(`Fetching schedule: ${zone?.name || zoneId}...`);
    try {
        let url = `/getscheduleforzone/${zoneId}`;
        if (force) url += '?refresh=true';
        const response = await api.get(url);
        setZoneSchedule(zoneId, response.data, isInitial || force);
        setError(null);
    } catch (err: any) {
        markScheduleFailed(zoneId);
        setError(err.message || `Failed to fetch schedule for zone ${zoneId}`);
    } finally {
        setLoading(false);
        setLoadingMessage(null);
    }
  };

  const fetchAllSchedulesSequentially = async () => {
    const { zones, dhw } = useHeatingStore.getState();
    setLoading(true);
    try {
        const items = [...zones];
        if (dhw) items.push({ zoneId: dhw.dhwId, name: 'Hot Water' } as any);

        for (const item of items) {
            setLoadingMessage(`Refreshing all: ${item.name}...`);
            const response = await api.get(`/getscheduleforzone/${item.zoneId}`);
            setZoneSchedule(item.zoneId, response.data, true);
        }
        setError(null);
    } catch (err: any) {
        setError(err.message || `Failed to download all schedules`);
    } finally {
        setLoading(false);
        setLoadingMessage(null);
    }
  };

  // Fetch status from both providers simultaneously for the dashboard
  const fetchDualStatus = async () => {
    try {
        const [statusRes, mqttRes, cloudRes] = await Promise.allSettled([
            api.get('/providers/status'),
            api.get('/mqtt/currentstatus'),
            api.get('/cloud/currentstatus'),
        ]);

        const provStatus = statusRes.status === 'fulfilled' ? statusRes.value.data : null;
        if (provStatus) setProvidersStatus(provStatus);

        const mqttMeta = provStatus?.mqtt;
        if (mqttRes.status === 'fulfilled') {
            setMqttSnapshot({
                zones:     mqttRes.value.data.zones ?? [],
                dhw:       mqttRes.value.data.dhw   ?? null,
                connected: mqttMeta?.connected       ?? false,
                status:    mqttMeta?.status          ?? 'unknown',
                error:     mqttMeta?.error,
            });
        } else {
            setMqttSnapshot({
                zones:     [],
                dhw:       null,
                connected: false,
                status:    mqttMeta?.status ?? 'unavailable',
                error:     mqttMeta?.error  ?? (mqttRes as PromiseRejectedResult).reason?.message,
            });
        }

        const cloudMeta = provStatus?.cloud;
        if (cloudRes.status === 'fulfilled') {
            setCloudSnapshot({
                zones:     cloudRes.value.data.zones ?? [],
                dhw:       cloudRes.value.data.dhw   ?? null,
                connected: cloudMeta?.connected       ?? false,
                status:    cloudMeta?.status          ?? 'unknown',
                error:     cloudMeta?.error,
            });
        } else {
            setCloudSnapshot({
                zones:     [],
                dhw:       null,
                connected: false,
                status:    cloudMeta?.status ?? 'unavailable',
                error:     cloudMeta?.error  ?? (cloudRes as PromiseRejectedResult).reason?.message,
            });
        }
    } catch (e) {
        console.error('Failed to fetch dual provider status', e);
    }
  };

  return {
    fetchCurrentStatus,
    fetchAllSchedules,
    saveAllSchedules,
    selectProvider,
    refreshMqttMappings,
    fetchScheduleForZone,
    fetchAllSchedulesSequentially,
    fetchDualStatus,
  };
};
