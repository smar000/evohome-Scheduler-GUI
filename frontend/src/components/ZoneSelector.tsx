import React from 'react';
import { useHeatingStore } from '../store/useHeatingStore';

interface ZoneSelectorProps {
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
}

export const ZoneSelector: React.FC<ZoneSelectorProps> = ({ selectedZoneId, onSelectZone }) => {
  const { zones, dhw } = useHeatingStore();
  const sortedZones = [...zones].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full">
      <label htmlFor="zone-select" className="block text-[10px] font-black uppercase text-slate-400 mb-2 ml-1">
        Select Active Zone
      </label>
      <select
        id="zone-select"
        value={selectedZoneId || ''}
        onChange={(e) => onSelectZone(e.target.value)}
        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none"
      >
        <option value="" disabled>-- Choose a zone --</option>
        {dhw && <option value={dhw.dhwId}>Hot Water</option>}
        {sortedZones.map((zone) => (
          <option key={zone.zoneId} value={zone.zoneId}>
            {zone.name}
          </option>
        ))}
      </select>
    </div>
  );
};
