import React, { useEffect, useState } from 'react';
import { useHeatingApi } from './api/useHeatingApi';
import { useHeatingStore } from './store/useHeatingStore';
import { Thermometer, Droplets, Activity, RefreshCw, AlertCircle, LayoutDashboard, Cpu, Cloud } from 'lucide-react';
import { Scheduler } from './components/Scheduler';

// Normalise setpointMode strings from both providers into a short human label
function formatMode(mode: string, until?: string): string {
  const n = mode.toLowerCase().replace(/[\s_]/g, '');
  if (n.startsWith('follow')) return 'Following Schedule';
  if (n.includes('temporary')) {
    return until
      ? `Override until ${new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Temp Override';
  }
  if (n.includes('permanent')) return 'Permanent Override';
  return mode;
}

function normName(name: string) { return name.toLowerCase().trim(); }

function App() {
  const { fetchCurrentStatus, fetchAllSchedules, fetchScheduleForZone, selectProvider, fetchDualStatus } = useHeatingApi();
  const {
    zones, system, loading, loadingMessage, error, provider, setSelectedZoneId,
    selectedZoneId,
    mqttSnapshot, cloudSnapshot, providersStatus,
  } = useHeatingStore();
  const [activeTab, setActiveTab] = useState<'scheduler' | 'dashboard'>('scheduler');
  const isInitialized = React.useRef(false);

  const queryParams = new URLSearchParams(window.location.search);
  const isEmbedded = queryParams.get('embed') === 'true';
  const initialZoneId = queryParams.get('zoneId') || queryParams.get('zone_id');
  const initialZoneLabel = queryParams.get('zone_label') || queryParams.get('zoneLabel');
  const urlParamProcessed = React.useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    const init = async () => {
        await fetchCurrentStatus();
        if (!isEmbedded) await fetchAllSchedules();
    };
    init();
  }, []);

  // Load dual status whenever the dashboard tab is active
  useEffect(() => {
    if (activeTab === 'dashboard') fetchDualStatus();
  }, [activeTab]);

  useEffect(() => {
    if (zones.length > 0 && !urlParamProcessed.current) {
        const targetId = initialZoneId || initialZoneLabel;
        if (targetId) {
            const normalize = (s: string) => s.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
            const search = normalize(targetId);
            const found = zones.find(z =>
                (z.label && normalize(z.label) === search) ||
                (z.name && normalize(z.name) === search) ||
                z.zoneId === targetId ||
                z.zoneId === search
            );
            if (found) {
                urlParamProcessed.current = true;
                setSelectedZoneId(found.zoneId);
                fetchScheduleForZone(found.zoneId, true);
                return;
            }
        }
        const currentId = useHeatingStore.getState().selectedZoneId;
        if (!currentId || !zones.find(z => z.zoneId === currentId)) {
            setSelectedZoneId(zones[0].zoneId);
        }
        urlParamProcessed.current = true;
    }
  }, [zones, initialZoneId, initialZoneLabel]);

  // Persist the selected zone so it is restored on the next page load
  useEffect(() => {
    if (selectedZoneId) localStorage.setItem('evoWeb:lastZoneId', selectedZoneId);
  }, [selectedZoneId]);

  const handleManualRefresh = async () => {
    await fetchCurrentStatus(true);
    await fetchAllSchedules(true);
    if (activeTab === 'dashboard') await fetchDualStatus();
  };

  const getTitle = () => {
    if (provider?.name === 'Honeywell') return 'evoWeb Cloud';
    if (provider?.name === 'MQTT') return 'evoWeb Local';
    return 'evoWeb Modern';
  };

  if (error) return <div className="p-4 bg-red-100 text-red-700 border border-red-200 m-4 rounded">Error: {error}</div>;

  if (isEmbedded) {
    return (
        <div className={`bg-white min-h-screen ${loading ? 'cursor-wait' : ''}`}>
            <main className="p-2">
                <Scheduler />
            </main>
            {loading && (
                <div className="fixed bottom-4 right-4 bg-slate-900/80 text-white px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-sm">
                    <RefreshCw size={14} className="animate-spin text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{loadingMessage || 'Syncing...'}</span>
                </div>
            )}
        </div>
    );
  }

  // --- Dashboard helpers ---
  const mqttConnected  = providersStatus?.mqtt?.connected  ?? false;
  const cloudConnected = providersStatus?.cloud?.connected ?? false;

  // Union of all zone names across both snapshots, sorted
  const allZoneNames = Array.from(new Set([
    ...(mqttSnapshot?.zones.map(z => z.name)   ?? []),
    ...(cloudSnapshot?.zones.map(z => z.name)  ?? []),
  ])).sort((a, b) => a.localeCompare(b));

  // DHW from either snapshot
  const mqttDhw  = mqttSnapshot?.dhw  ?? null;
  const cloudDhw = cloudSnapshot?.dhw ?? null;
  const hasDhw   = !!(mqttDhw || cloudDhw);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 transition-all pb-20 ${loading ? 'cursor-wait' : ''}`}>
      <header className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-6 gap-6">
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{getTitle()}</h1>
            {system && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100/50">
                <div className={`w-1.5 h-1.5 rounded-full bg-indigo-500 ${system.systemMode === 'Auto' ? 'animate-pulse' : ''}`}></div>
                <span className="text-[10px] font-black uppercase tracking-wider">{system.systemMode}</span>
              </div>
            )}
            {provider?.gatewayStatus && (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${(['online', 'authenticated'].includes(provider.gatewayStatus.toLowerCase())) ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-rose-50 text-rose-600 border-rose-100/50'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${(['online', 'authenticated'].includes(provider.gatewayStatus.toLowerCase())) ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {provider.name === 'Honeywell' ? 'TCC' : 'evoGateway'}: {provider.gatewayStatus}
                </span>
              </div>
            )}
          </div>

          <select
            value={provider?.name === 'Honeywell' ? 'honeywell' : (provider?.name === 'MQTT' ? 'mqtt' : 'mock')}
            onChange={(e) => selectProvider(e.target.value as any)}
            className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer w-fit"
          >
            <option value="honeywell">Cloud (Honeywell)</option>
            <option value="mqtt">Local (MQTT)</option>
            <option value="mock">Demo (Mock)</option>
          </select>
        </div>

        <div className="flex gap-1 bg-slate-200/50 p-1 rounded-2xl w-fit lg:mx-auto">
          <button
            onClick={() => setActiveTab('scheduler')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'scheduler' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Activity size={16} />
            Scheduler
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
            title="Refresh live temperatures, modes and all zone schedules"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh All</span>
          </button>
        </div>
      </header>

      {loading && zones.length === 0 ? (
         <div className="flex items-center justify-center h-64 bg-slate-100 text-slate-600 rounded-xl text-lg font-bold">
           <RefreshCw size={24} className="animate-spin mr-3 text-indigo-500" />
           Initializing System...
         </div>
      ) : (
        <main className="max-w-[1600px] mx-auto">
          {activeTab === 'scheduler' ? (
            <div className="animate-in fade-in duration-500">
              <Scheduler />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800 tracking-tight">
                  <LayoutDashboard size={28} className="text-indigo-500" />
                  Live House Overview
                </h2>
              </div>

              {/* --- Connection status row --- */}
              <div className="flex flex-wrap gap-3 mb-8">
                {/* MQTT */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${mqttConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                  <Cpu size={16} className={mqttConnected ? 'text-emerald-500' : 'text-slate-400'} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Local (MQTT)</div>
                    <div className={`text-xs font-black uppercase tracking-wide ${mqttConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {providersStatus?.mqtt?.status ?? (mqttSnapshot ? 'unknown' : '—')}
                    </div>
                    {providersStatus?.mqtt?.error && (
                      <div className="text-[9px] text-rose-500 font-bold mt-0.5">{providersStatus.mqtt.error}</div>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full ml-1 ${mqttConnected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                </div>

                {/* Cloud */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${cloudConnected ? 'bg-sky-50 border-sky-100' : 'bg-slate-50 border-slate-200'}`}>
                  <Cloud size={16} className={cloudConnected ? 'text-sky-500' : 'text-slate-400'} />
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cloud (Honeywell)</div>
                    <div className={`text-xs font-black uppercase tracking-wide ${cloudConnected ? 'text-sky-600' : 'text-slate-500'}`}>
                      {providersStatus?.cloud?.status ?? (cloudSnapshot ? 'unknown' : '—')}
                    </div>
                    {providersStatus?.cloud?.error && (
                      <div className="text-[9px] text-rose-500 font-bold mt-0.5">{providersStatus.cloud.error}</div>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full ml-1 ${cloudConnected ? 'bg-sky-400' : 'bg-slate-300'}`} />
                </div>
              </div>

              {/* --- Zone / DHW cards --- */}
              {(allZoneNames.length === 0 && !hasDhw) ? (
                <div className="flex flex-col items-center justify-center h-48 bg-white rounded-3xl border border-slate-100 text-slate-400 gap-3">
                  <RefreshCw size={24} className={loading ? 'animate-spin text-indigo-400' : ''} />
                  <span className="text-sm font-bold">
                    {loading ? 'Loading data…' : 'No data yet — click Refresh to load'}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">

                  {/* Hot Water card */}
                  {hasDhw && (
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <Droplets size={18} className="text-blue-500" />
                        <h3 className="font-bold text-slate-800">Hot Water</h3>
                      </div>
                      <div className="flex flex-col gap-2">
                        {/* Local row */}
                        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-amber-50 border-l-4 border-amber-400">
                          <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                            <Cpu size={13} className="text-amber-500" />
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-600">Local</span>
                          </div>
                          {mqttDhw ? (
                            <div className="flex gap-4 flex-1 items-center min-w-0">
                              <div className="shrink-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Temp</div>
                                <div className="text-lg font-black text-slate-700 leading-none">{mqttDhw.temperature.toFixed(1)}°</div>
                              </div>
                              <div className="shrink-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">State</div>
                                <span className={`text-[9px] font-black uppercase ${mqttDhw.state === 'On' ? 'text-green-600' : 'text-slate-400'}`}>{mqttDhw.state}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Mode</div>
                                <div className="text-[9px] font-black text-amber-600 uppercase tracking-wide leading-tight truncate">{formatMode(mqttDhw.setpointMode, mqttDhw.until)}</div>
                              </div>
                            </div>
                          ) : <span className="text-slate-300 font-black">—</span>}
                        </div>
                        {/* Cloud row */}
                        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-sky-50 border-l-4 border-sky-400">
                          <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                            <Cloud size={13} className="text-sky-500" />
                            <span className="text-[8px] font-black uppercase tracking-wider text-sky-600">Cloud</span>
                          </div>
                          {cloudDhw ? (
                            <div className="flex gap-4 flex-1 items-center min-w-0">
                              <div className="shrink-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Temp</div>
                                <div className="text-lg font-black text-slate-700 leading-none">{cloudDhw.temperature.toFixed(1)}°</div>
                              </div>
                              <div className="shrink-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">State</div>
                                <span className={`text-[9px] font-black uppercase ${cloudDhw.state === 'On' ? 'text-green-600' : 'text-slate-400'}`}>{cloudDhw.state}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Mode</div>
                                <div className="text-[9px] font-black text-sky-600 uppercase tracking-wide leading-tight truncate">{formatMode(cloudDhw.setpointMode, cloudDhw.until)}</div>
                              </div>
                            </div>
                          ) : <span className="text-slate-300 font-black">—</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Zone cards */}
                  {allZoneNames.map((zoneName) => {
                    const mqttZone  = mqttSnapshot?.zones.find(z => normName(z.name) === normName(zoneName));
                    const cloudZone = cloudSnapshot?.zones.find(z => normName(z.name) === normName(zoneName));
                    const heating   = (mqttZone ?? cloudZone);
                    const isHeating = !!(heating && heating.temperature < heating.setpoint);

                    return (
                      <div key={zoneName} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">{zoneName}</h3>
                          <Thermometer size={20} className={isHeating ? 'text-orange-500 animate-pulse' : 'text-slate-300'} />
                        </div>

                        <div className="flex flex-col gap-2">
                          {/* Local row */}
                          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-amber-50 border-l-4 border-amber-400">
                            <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                              <Cpu size={13} className="text-amber-500" />
                              <span className="text-[8px] font-black uppercase tracking-wider text-amber-600">Local</span>
                            </div>
                            {mqttZone ? (
                              <div className="flex gap-4 flex-1 items-center min-w-0">
                                <div className="shrink-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Now</div>
                                  <div className="text-lg font-black text-slate-700 leading-none">{mqttZone.temperature.toFixed(1)}°</div>
                                </div>
                                <div className="shrink-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Set</div>
                                  <div className="text-lg font-black text-amber-600 leading-none">{mqttZone.setpoint.toFixed(1)}°</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Mode</div>
                                  <div className="text-[9px] font-black text-amber-600 uppercase tracking-wide leading-tight truncate">{formatMode(mqttZone.setpointMode, mqttZone.until)}</div>
                                </div>
                              </div>
                            ) : <span className="text-slate-300 font-black">—</span>}
                          </div>

                          {/* Cloud row */}
                          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-sky-50 border-l-4 border-sky-400">
                            <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                              <Cloud size={13} className="text-sky-500" />
                              <span className="text-[8px] font-black uppercase tracking-wider text-sky-600">Cloud</span>
                            </div>
                            {cloudZone ? (
                              <div className="flex gap-4 flex-1 items-center min-w-0">
                                <div className="shrink-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Now</div>
                                  <div className="text-lg font-black text-slate-700 leading-none">{cloudZone.temperature.toFixed(1)}°</div>
                                </div>
                                <div className="shrink-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Set</div>
                                  <div className="text-lg font-black text-sky-600 leading-none">{cloudZone.setpoint.toFixed(1)}°</div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Mode</div>
                                  <div className="text-[9px] font-black text-sky-600 uppercase tracking-wide leading-tight truncate">{formatMode(cloudZone.setpointMode, cloudZone.until)}</div>
                                </div>
                              </div>
                            ) : <span className="text-slate-300 font-black">—</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      <footer className={`fixed bottom-0 left-0 right-0 p-3 flex items-center justify-center gap-3 transition-all duration-500 ${loading || provider?.error ? 'translate-y-0' : 'translate-y-full'} ${provider?.error ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
        {provider?.error ? (
            <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-200" />
                <span className="text-xs font-bold uppercase tracking-widest">
                    {provider.name} Connection Error: <span className="text-red-100 font-black ml-1">{provider.error}</span>
                </span>
            </div>
        ) : (
            <div className="flex items-center gap-2">
                <RefreshCw size={16} className="animate-spin text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-widest">
                    {loadingMessage ? loadingMessage : `Retrieving data from ${provider?.name || 'Loading...'}...`}
                </span>
            </div>
        )}
      </footer>
    </div>
  );
}

export default App;
