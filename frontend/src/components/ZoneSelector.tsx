import React from 'react';
import { useHeatingStore } from '../store/useHeatingStore';

interface ZoneSelectorProps {
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
}

export const ZoneSelector: React.FC<ZoneSelectorProps> = ({ selectedZoneId, onSelectZone }) => {
  const { zones } = useHeatingStore();

  return (
    <div className="mb-4">
      <label htmlFor="zone-select" className="block text-sm font-medium text-slate-700 mb-1">
        Select Zone
      </label>
      <select
        id="zone-select"
        value={selectedZoneId || ''}
        onChange={(e) => onSelectZone(e.target.value)}
        className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
      >
        <option value="" disabled>-- Choose a zone --</option>
        {zones.map((zone) => (
          <option key={zone.zoneId} value={zone.zoneId}>
            {zone.name}
          </option>
        ))}
      </select>
    </div>
  );
};
