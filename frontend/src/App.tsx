import React, { useEffect, useState } from 'react';
import { useHeatingApi } from './api/useHeatingApi';
import { useHeatingStore } from './store/useHeatingStore';
import { Thermometer, Droplets, Settings, Activity, RefreshCw, Database } from 'lucide-react';
import { Scheduler } from './components/Scheduler';

function App() {
  const { fetchCurrentStatus, fetchAllSchedules } = useHeatingApi();
  const { zones, dhw, system, loading, error, provider } = useHeatingStore();

  useEffect(() => {
    fetchCurrentStatus();
    fetchAllSchedules();
  }, []);

  const handleManualRefresh = async () => {
    console.log('MANUAL REFRESH BUTTON CLICKED. Forcing data fetch...');
    await fetchCurrentStatus(true);
    await fetchAllSchedules(true);
  };

  if (error) return <div className="p-4 bg-red-100 text-red-700 border border-red-200 m-4 rounded">Error: {error}</div>;

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 transition-all pb-20 ${loading ? 'cursor-wait' : ''}`}>
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">evoWeb Modern</h1>
          <p className="text-slate-500 mt-1 font-medium">Smart Heating Control</p>
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

      {loading && zones.length === 0 ? (
         <div className="flex items-center justify-center h-64 bg-slate-100 text-slate-600 rounded-xl text-lg font-bold">
           <RefreshCw size={24} className="animate-spin mr-3 text-indigo-500" />
           Initializing System...
         </div>
      ) : (
        <main className="space-y-12">
          <Scheduler />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
            <section className="xl:col-span-2 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                  <Activity size={24} className="text-indigo-500" />
                  Zones & Rooms
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {zones.map((zone) => (
                  <div key={zone.zoneId} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{zone.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{zone.setpointMode}</p>
                      </div>
                      <Thermometer size={24} className={zone.temperature < zone.setpoint ? "text-orange-500 animate-pulse" : "text-slate-300"} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="text-[10px] uppercase font-black text-slate-400 block mb-1">Current</span>
                        <span className="text-2xl font-black text-slate-800">{zone.temperature.toFixed(1)}°</span>
                      </div>
                      <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-50">
                        <span className="text-[10px] uppercase font-black text-indigo-400 block mb-1 text-center">Target</span>
                        <span className="text-2xl font-black text-indigo-700 block text-center">{zone.setpoint.toFixed(1)}°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-8">
              <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                <Droplets size={24} className="text-blue-500" />
                Hot Water
              </h2>
              {dhw && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-bold text-slate-800 text-lg tracking-tight">Cylinder Status</span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${dhw.state === 'On' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {dhw.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-50">
                    <div className="bg-white p-3 rounded-xl shadow-sm">
                      <Droplets size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-blue-400 block tracking-widest">Temperature</span>
                      <span className="text-3xl font-black text-blue-700">{dhw.temperature.toFixed(1)}°</span>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </main>
      )}

      {/* FIXED STATUS BAR */}
      <footer className={`fixed bottom-0 left-0 right-0 p-3 bg-slate-900 text-white flex items-center justify-center gap-3 transition-transform duration-500 ${loading ? 'translate-y-0' : 'translate-y-full'}`}>
        <RefreshCw size={16} className="animate-spin text-indigo-400" />
        <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            Retrieving data from <span className="text-indigo-400 font-black">{provider || 'Loading...'}</span>...
        </span>
      </footer>
    </div>
  );
}

export default App;
