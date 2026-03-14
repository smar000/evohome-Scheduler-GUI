import React from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ZoneSelectorProps {
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  compact?: boolean;
}

export const ZoneSelector: React.FC<ZoneSelectorProps> = ({ selectedZoneId, onSelectZone, compact = false }) => {
  const { zones, dhw, provider } = useHeatingStore();
  const { refreshMqttMappings } = useHeatingApi();
  const sortedZones = [...zones].sort((a, b) => a.name.localeCompare(b.name));
  const isEmpty = sortedZones.length === 0 && !dhw;

  const handleSync = () => {
    if (window.confirm("This will attempt to sync zone names from Honeywell Cloud. If you get a 401 error, please switch to Cloud mode first to re-authenticate, then try again. Continue?")) {
        refreshMqttMappings();
    }
  };

  return (
    <div className="w-full">
      {!compact && (
        <div className="flex justify-between items-center mb-2 ml-1">
          <label htmlFor="zone-select" className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
            Select Active Zone
          </label>
          {isEmpty && provider?.name === 'MQTT' && (
              <button
                  onClick={handleSync}
                  className="text-[10px] font-black uppercase text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors group"
                  title="Sync zone names from Cloud"
              >
                  <RefreshCw size={10} className="group-hover:rotate-180 transition-transform duration-500" />
                  Sync Mappings
              </button>
          )}
        </div>
      )}
      {compact && isEmpty && provider?.name === 'MQTT' && (
        <button onClick={handleSync} className="text-[10px] font-black uppercase text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors group" title="Sync zone names from Cloud">
          <RefreshCw size={10} className="group-hover:rotate-180 transition-transform duration-500" /> Sync
        </button>
      )}
      
      <div className="relative group">
        <select
            id="zone-select"
            value={selectedZoneId || ''}
            onChange={(e) => onSelectZone(e.target.value)}
            className={`w-full bg-slate-50 dark:bg-slate-700 border-2 ${isEmpty ? 'border-amber-100 dark:border-amber-800/50 ring-2 ring-amber-50 dark:ring-amber-900/30' : 'border-slate-100 dark:border-slate-600'} rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all outline-none appearance-none`}
        >
            <option value="" disabled>-- Choose a zone --</option>
            {dhw && <option value={dhw.dhwId}>Hot Water</option>}
            {sortedZones.map((zone) => (
            <option key={zone.zoneId} value={zone.zoneId}>
                {zone.name}
            </option>
            ))}
        </select>

        {isEmpty && provider?.name === 'MQTT' && (
            <div className="absolute left-0 -bottom-12 hidden group-hover:flex items-center gap-2 bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-[10px] font-bold z-50 animate-in fade-in zoom-in duration-200 w-full">
                <AlertCircle size={14} className="text-amber-400 shrink-0" />
                <span>No zones found in local mapping. Please click 'Sync Mappings' or switch to Cloud mode to refresh.</span>
            </div>
        )}
      </div>
    </div>
  );
};
