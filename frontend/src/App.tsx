import React, { useEffect, useState } from 'react';
import { useHeatingApi } from './api/useHeatingApi';
import { useHeatingStore } from './store/useHeatingStore';
import { Thermometer, Droplets, Settings, Activity, RefreshCw, AlertCircle, LayoutDashboard } from 'lucide-react';
import { Scheduler } from './components/Scheduler';

function App() {
  const { fetchCurrentStatus, fetchAllSchedules, selectProvider, refreshMqttMappings } = useHeatingApi();
  const { zones, dhw, system, loading, loadingMessage, error, provider } = useHeatingStore();
  const [activeTab, setActiveTab] = useState<'scheduler' | 'dashboard'>('scheduler');

  useEffect(() => {
    fetchCurrentStatus();
    fetchAllSchedules();
  }, []);

  const handleManualRefresh = async () => {
    await fetchCurrentStatus(true);
    await fetchAllSchedules(true);
  };

  const getTitle = () => {
    if (provider?.name === 'Honeywell') return 'evoWeb Cloud';
    if (provider?.name === 'MQTT') return 'evoWeb Local';
    return 'evoWeb Modern';
  };

  if (error) return <div className="p-4 bg-red-100 text-red-700 border border-red-200 m-4 rounded">Error: {error}</div>;

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 transition-all pb-20 ${loading ? 'cursor-wait' : ''}`}>
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{getTitle()}</h1>
            <p className="text-slate-500 mt-1 font-medium">Smart Heating Control</p>
          </div>
          
          <select 
            value={provider?.name === 'Honeywell' ? 'honeywell' : (provider?.name === 'MQTT' ? 'mqtt' : 'mock')}
            onChange={(e) => selectProvider(e.target.value as any)}
            className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="honeywell">Cloud (Honeywell)</option>
            <option value="mqtt">Local (MQTT)</option>
            <option value="mock">Demo (Mock)</option>
          </select>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh Data
          </button>

          {provider?.name === 'MQTT' && (
            <button 
              onClick={() => {
                if (window.confirm("This will attempt to sync zone names from Honeywell Cloud. If you get a 401 error, please switch to Cloud mode first to re-authenticate, then try again. Continue?")) {
                  refreshMqttMappings();
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 border border-indigo-700 rounded-xl shadow-sm text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              <Activity size={18} />
              Sync Zones
            </button>
          )}

          {system && (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
              <Settings size={20} className="text-slate-400" />
              <div className="text-sm">
                <span className="text-slate-400">System Mode:</span>
                <span className="ml-2 font-bold text-slate-800">{system.systemMode}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* TAB NAVIGATION */}
      <div className="flex gap-2 mb-8 bg-slate-200/50 p-1.5 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('scheduler')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'scheduler' ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Activity size={18} />
          Scheduler
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>
      </div>

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
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black flex items-center gap-3 text-slate-800 tracking-tight">
                  <LayoutDashboard size={28} className="text-indigo-500" />
                  Live House Overview
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {/* Hot Water Card (Always First) */}
                {dhw && (
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500 flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <Droplets size={20} className="text-blue-500" />
                        <h3 className="font-bold text-slate-800 text-lg">Hot Water</h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${dhw.state === 'On' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {dhw.state}
                      </span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-50 flex items-center justify-between mt-auto">
                      <span className="text-[10px] uppercase font-black text-blue-400 tracking-widest">Temperature</span>
                      <span className="text-3xl font-black text-blue-700">{dhw.temperature.toFixed(1)}°</span>
                    </div>
                  </div>
                )}

                {/* Zone Cards */}
                {[...zones].sort((a, b) => a.name.localeCompare(b.name)).map((zone) => (
                  <div key={zone.zoneId} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight mb-1">{zone.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {zone.setpointMode}
                          {zone.setpointMode === 'Temporary Override' && zone.until && ` until ${new Date(zone.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>
                      <Thermometer size={24} className={zone.temperature < zone.setpoint ? "text-orange-500 animate-pulse" : "text-slate-300"} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-auto">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] uppercase font-black text-slate-400 block mb-1">Current</span>
                        <span className="text-2xl font-black text-slate-800">{zone.temperature.toFixed(1)}°</span>
                      </div>
                      <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-50 text-center">
                        <span className="text-[10px] uppercase font-black text-indigo-400 block mb-1">Target</span>
                        <span className="text-2xl font-black text-indigo-700 block">{zone.setpoint.toFixed(1)}°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* FIXED STATUS BAR WITH ERROR SUPPORT */}
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
