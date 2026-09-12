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

const saveApi = axios.create({
  baseURL: '/rest',
  timeout: 60000,
});

// Module-level (not component state) so it's a true singleton shared by every
// useHeatingApi() call site, tracking the one bulk schedule download that can
// ever be in flight at a time — set by _downloadSchedulesSequentially, read
// by cancelScheduleDownload.
let refreshAbortController: AbortController | null = null;
let refreshCancelled = false;

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
    markSaveZoneFailed,
    clearSaveFailedZones,
    revertSchedules,
    setNotification,
    setIsRefreshRunning,
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

  const saveAllSchedules = async (
    schedules: Record<string, ZoneSchedule>,
    onProgress?: (message: string) => void
  ): Promise<{ saved: string[]; failed: string[] }> => {
    const changed = Object.entries(schedules)
      .filter(([id, s]) => !isEqual(s, originalSchedules[id]))
      .sort(([a], [b]) => {
        if (a === 'dhw') return 1;
        if (b === 'dhw') return -1;
        return parseInt(a, 10) - parseInt(b, 10);
      });
    if (changed.length === 0) return { saved: [], failed: [] };

    clearSaveFailedZones();
    setLoading(true);
    const saved: string[] = [];
    const failed: string[] = [];
    const saveMode = useHeatingStore.getState().uiConfig?.mqttSaveMode ?? 'day';

    for (let i = 0; i < changed.length; i++) {
      const [zoneId, schedule] = changed[i];

      if (saveMode === 'week') {
        const progress = `Saving ${schedule.name} (${i + 1} of ${changed.length})...`;
        setLoadingMessage(progress);
        onProgress?.(progress);
        try {
          await saveApi.post(`/savescheduleforzone/${zoneId}`, schedule);
          setZoneSchedule(zoneId, schedule, true);
          saved.push(schedule.name);
        } catch (err: any) {
          markSaveZoneFailed(zoneId);
          const detail = err?.response?.data?.error || err?.message || '';
          failed.push(detail ? `${schedule.name}: ${detail}` : schedule.name);
        }
      } else {
        // Day-by-day: one HTTP call per day → granular progress + per-day ACK
        const dayFailed: string[] = [];
        for (let d = 0; d < schedule.schedule.length; d++) {
          const day = schedule.schedule[d];
          const progress = `Saving ${schedule.name} · ${day.dayOfWeek.substring(0, 3)} (${i + 1} of ${changed.length})`;
          setLoadingMessage(progress);
          onProgress?.(progress);
          try {
            await saveApi.post(`/savescheduleforzone/${zoneId}`, { name: schedule.name, schedule: [day] });
          } catch (err: any) {
            const detail = err?.response?.data?.error || err?.message || '';
            dayFailed.push(detail ? `${day.dayOfWeek}: ${detail}` : day.dayOfWeek);
          }
        }
        if (dayFailed.length === 0) {
          setZoneSchedule(zoneId, schedule, true);
          saved.push(schedule.name);
        } else {
          markSaveZoneFailed(zoneId);
          failed.push(`${schedule.name} (${dayFailed.join('; ')})`);
        }
      }
    }

    setLoading(false);
    setLoadingMessage(null);
    setError(failed.length > 0 ? `${failed.length} zone${failed.length > 1 ? 's' : ''} failed to save` : null);
    return { saved, failed };
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

  // Downloads one zone's schedule directly (bypassing fetchScheduleForZone's
  // own setError — a single zone failing mid-bulk-refresh shouldn't trigger
  // the app's full-page error view). A cancelled request is reported
  // distinctly from a real failure, so it doesn't get marked failed or
  // counted against the zone.
  const _downloadOneZoneSchedule = async (id: string, force: boolean): Promise<'ok' | 'failed' | 'cancelled'> => {
    try {
        let url = `/getscheduleforzone/${id}`;
        if (force) url += '?refresh=true';
        const response = await api.get(url, { signal: refreshAbortController?.signal });
        setZoneSchedule(id, response.data, true);
        return 'ok';
    } catch (err) {
        if (axios.isCancel(err)) return 'cancelled';
        markScheduleFailed(id);
        return 'failed';
    }
  };

  // Surfaces the outcome of a bulk zone-schedule download via the global
  // notification bar (visible on either tab) instead of the blocking
  // full-page error view, since a partial failure shouldn't hide the rest
  // of the app.
  const _reportScheduleDownload = (succeeded: string[], failed: string[], verb: string) => {
    const total = succeeded.length + failed.length;
    if (total === 0) return; // nothing was missing/forced — a silent no-op revert
    const plural = (n: number) => (n === 1 ? '' : 's');
    if (failed.length === 0) {
        setNotification({ type: 'success', message: `${verb} ${succeeded.length} zone schedule${plural(succeeded.length)}` });
    } else {
        setNotification({
            type: 'error',
            message: `${verb} ${succeeded.length} of ${total} zone schedule${plural(total)} — failed: ${failed.join(', ')}`,
        });
    }
    setTimeout(() => setNotification(null), failed.length > 0 ? 10000 : 6000);
  };

  // Runs the given zones through _downloadOneZoneSchedule one at a time
  // (never in parallel — a single RF channel means concurrent RQs would
  // just collide), surfacing live per-zone progress via loadingMessage
  // (shown in the app's global footer) and a final tally via the
  // notification bar. Cancellable mid-run via cancelScheduleDownload, which
  // both stops the loop before its next zone and aborts whichever request
  // is currently in flight, so cancelling doesn't wait out a slow/stuck zone.
  const _downloadSchedulesSequentially = async (
    items: { id: string; name: string }[],
    force: boolean,
    progressVerb: string, // present continuous, e.g. "Loading" / "Downloading"
    reportVerb: string,   // past tense, e.g. "Loaded" / "Downloaded"
  ) => {
    if (items.length === 0) return;
    refreshCancelled = false;
    refreshAbortController = new AbortController();
    setIsRefreshRunning(true);
    setLoading(true);
    const succeeded: string[] = [];
    const failed: string[] = [];
    let cancelledEarly = false;
    try {
        for (let i = 0; i < items.length; i++) {
            if (refreshCancelled) { cancelledEarly = true; break; }
            const item = items[i];
            setLoadingMessage(`${progressVerb} schedule: ${item.name} (${i + 1} of ${items.length})...`);
            const outcome = await _downloadOneZoneSchedule(item.id, force);
            if (outcome === 'cancelled') { cancelledEarly = true; break; }
            (outcome === 'ok' ? succeeded : failed).push(item.name);
        }
    } finally {
        setLoading(false);
        setLoadingMessage(null);
        setIsRefreshRunning(false);
        refreshAbortController = null;
    }

    if (cancelledEarly) {
        const plural = (n: number) => (n === 1 ? '' : 's');
        setNotification({
            type: 'error',
            message: succeeded.length > 0
                ? `Cancelled — ${reportVerb.toLowerCase()} ${succeeded.length} of ${items.length} zone schedule${plural(items.length)} before stopping`
                : 'Cancelled — no zone schedules were downloaded',
        });
        setTimeout(() => setNotification(null), 8000);
        return;
    }
    _reportScheduleDownload(succeeded, failed, reportVerb);
  };

  // Stops an in-progress bulk schedule download: prevents the next zone from
  // starting, and aborts whichever request is currently in flight so the
  // cancel feels immediate rather than waiting out that zone's timeout.
  const cancelScheduleDownload = () => {
    refreshCancelled = true;
    refreshAbortController?.abort();
  };

  // "Refresh All" default behaviour: discard any unsaved edits and fall back to
  // whatever's already loaded, without touching the RF network (schedules aren't
  // pushed live like zone/system status, so a real refresh has to RQ the controller
  // per zone — see forceDownloadAllSchedules for the genuinely-forced path, gated
  // behind an explicit confirm in the UI). A zone with nothing loaded yet has
  // nothing to revert to, so it still gets a real (non-forced, cache-if-available)
  // download.
  const revertAllSchedules = async () => {
    const { zones, dhw, originalSchedules: original, isDirty: wasDirty } = useHeatingStore.getState();
    revertSchedules();
    const items = [...zones.map(z => ({ id: z.zoneId, name: z.name })), ...(dhw ? [{ id: dhw.dhwId, name: 'Hot Water' }] : [])];
    const missing = items.filter(item => !original[item.id]);

    if (missing.length === 0) {
        // Nothing to download — acknowledge rather than silently doing nothing,
        // so a click that looks like it did nothing doesn't feel broken.
        setNotification({
            type: 'success',
            message: wasDirty
                ? 'Discarded unsaved changes'
                : "Already up to date — click Refresh All twice quickly to force a re-download from the controller",
        });
        setTimeout(() => setNotification(null), 6000);
        return;
    }

    await _downloadSchedulesSequentially(missing, false, 'Loading', 'Loaded');
  };

  // The genuine forced RF re-download — every zone, one at a time, gated
  // behind the double-click confirm in the UI.
  const forceDownloadAllSchedules = async () => {
    const { zones, dhw } = useHeatingStore.getState();
    const items = [...zones.map(z => ({ id: z.zoneId, name: z.name })), ...(dhw ? [{ id: dhw.dhwId, name: 'Hot Water' }] : [])];
    await _downloadSchedulesSequentially(items, true, 'Downloading', 'Downloaded');
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
    revertAllSchedules,
    forceDownloadAllSchedules,
    cancelScheduleDownload,
    fetchAllSchedulesSequentially,
    fetchDualStatus,
  };
};
