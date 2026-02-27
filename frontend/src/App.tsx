import React, { useEffect, useState } from 'react';
import { useHeatingApi } from './api/useHeatingApi';
import { useHeatingStore } from './store/useHeatingStore';
import { Thermometer, Droplets, Settings, Activity } from 'lucide-react';
import { Scheduler } from './components/Scheduler';

function App() {
  const { fetchCurrentStatus, fetchAllSchedules } = useHeatingApi();
  const { zones, dhw, system, loading, error } = useHeatingStore();

  useEffect(() => {
    fetchCurrentStatus();
    fetchAllSchedules();
  }, []);

  if (error) return <div className="p-4 bg-red-100 text-red-700 border border-red-200 m-4 rounded">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">evoWeb Modern</h1>
          <p className="text-slate-500 mt-1 font-medium">Smart Heating Control</p>
        </div>
        {system && (
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
            <Settings size={20} className="text-slate-400" />
            <div className="text-sm">
              <span className="text-slate-400">System Mode:</span>
              <span className="ml-2 font-bold text-slate-800">{system.systemMode}</span>
            </div>
          </div>
        )}
      </header>

      {loading && zones.length === 0 ? (
         <div className="flex items-center justify-center h-64 bg-slate-100 text-slate-600 rounded-xl">Loading your heating system...</div>
      ) : (
        <main className="space-y-8">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <section className="xl:col-span-2 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Activity size={24} className="text-indigo-500" />
                  Zones & Rooms
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {zones.map((zone) => (
                  <div key={zone.zoneId} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{zone.name}</h3>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{zone.setpointMode}</p>
                      </div>
                      <Thermometer size={24} className={zone.temperature < zone.setpoint ? "text-orange-500 animate-pulse" : "text-slate-300"} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Current</span>
                        <span className="text-2xl font-black text-slate-800">{zone.temperature.toFixed(1)}°</span>
                      </div>
                      <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                        <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">Target</span>
                        <span className="text-2xl font-black text-indigo-700">{zone.setpoint.toFixed(1)}°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-8">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Droplets size={24} className="text-blue-500" />
                Hot Water
              </h2>
              {dhw && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-bold text-slate-800 text-lg">Cylinder Status</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${dhw.state === 'On' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {dhw.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <Droplets size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-400 block">Temperature</span>
                      <span className="text-3xl font-black text-blue-700">{dhw.temperature.toFixed(1)}°</span>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
          
          <Scheduler />

        </main>
      )}
    </div>
  );
}

export default App;
