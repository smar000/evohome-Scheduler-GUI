import React, { useState, useEffect } from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { ZoneSelector } from './ZoneSelector';
import { Activity, Scissors, Move, Save, X, Calendar, User } from 'lucide-react';
import { produce } from 'immer';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

// --- Constants ---
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TOTAL_DAY_MINUTES = 24 * 60;
const TIME_RESOLUTION_MINUTES = 10;

// --- Color & Style Helpers ---
const getTempColor = (temp: number): string => {
  if (temp <= 5) return '#e2e8f0'; // slate-200 (Light Gray)
  if (temp <= 12) return '#bae6fd'; // sky-200 (Light Blue)
  if (temp <= 20) return '#fef08a'; // yellow-200 (Yellow)
  return '#fed7aa'; // orange-200 (Orange)
};

const timeToMinutes = (time: string): number => {
  if (typeof time !== 'string' || !time.includes(':')) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// --- Internal Components ---

interface EditPopoverProps {
  anchor: HTMLElement | null;
  initialTemp: number;
  startTime: string;
  endTime: string;
  onSave: (newTemp: number, newStartTime: string, newEndTime: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const EditPopover: React.FC<EditPopoverProps> = ({ anchor, initialTemp, startTime, endTime, onSave, onCancel, onDelete }) => {
  const [temp, setTemp] = useState(initialTemp);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchor },
    placement: 'top',
    middleware: [offset(10), shift()],
  });

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="bg-slate-800 text-white p-4 rounded-lg shadow-2xl z-20 border border-slate-700">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Start Time</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500" />
          
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">End Time</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500" />
          
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Target Temp</label>
          <div className="flex items-center gap-2">
            <input type="number" value={temp} step="0.5" onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-700 rounded p-1 text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500" />
            <span className="text-xs font-bold text-slate-400">°C</span>
          </div>
        </div>
        <div className="flex justify-between gap-2 border-t border-slate-700 pt-4">
          <button onClick={onDelete} className="px-3 py-1 bg-red-900/50 text-red-200 rounded text-xs font-bold hover:bg-red-800 transition-colors">Delete</button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1 bg-slate-700 rounded text-xs hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={() => onSave(temp, start, end)} className="px-3 py-1 bg-indigo-600 rounded text-xs font-bold hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/20">Apply</button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
};

// --- Main Component ---

type ViewMode = 'zone' | 'day';
type EditMode = 'resize' | 'split';

export const Scheduler: React.FC = () => {
  const { schedules, zones, setSchedules, isDirty } = useHeatingStore();
  const { fetchAllSchedules, saveAllSchedules } = useHeatingApi();
  
  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [editMode, setEditMode] = useState<EditMode>('resize');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  const [editingSlot, setEditingSlot] = useState<{ day: string; element: HTMLElement; zoneId: string } | null>(null);

  useEffect(() => {
    if (viewMode === 'zone' && !selectedZoneId && zones.length > 0) {
      setSelectedZoneId(zones[0].zoneId);
    }
  }, [zones, selectedZoneId, viewMode]);

  const handleSlotDoubleClick = (day: string, zoneId: string, element: HTMLElement) => {
    if (editMode === 'split') {
      const startTime = element.dataset.startTime!;
      const endTime = element.dataset.endTime!;
      const temp = parseFloat(element.dataset.temp!);
      const startMins = timeToMinutes(startTime);
      const endMins = timeToMinutes(endTime);
      const midMins = Math.round((startMins + endMins) / 2 / TIME_RESOLUTION_MINUTES) * TIME_RESOLUTION_MINUTES;
      
      if (midMins <= startMins || midMins >= endMins) return;

      setSchedules(produce(schedules, draft => {
        const sched = draft[zoneId]?.schedule.find(s => s.dayOfWeek === day);
        if (sched) {
          sched.switchpoints.push({ timeOfDay: minutesToTime(midMins), heatSetpoint: temp });
          sched.switchpoints.sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
        }
      }));
    } else {
      setEditingSlot({ day, zoneId, element });
    }
  };

  const handleUpdate = (newTemp: number, newStart: string, newEnd: string) => {
    if (!editingSlot) return;
    const { day, zoneId, element } = editingSlot;
    const oldStart = element.dataset.startTime!;
    const oldEnd = element.dataset.endTime!;

    setSchedules(produce(schedules, draft => {
      const sched = draft[zoneId]?.schedule.find(s => s.dayOfWeek === day);
      if (!sched) return;

      // Filter out old points and add new ones
      sched.switchpoints = sched.switchpoints.filter(sp => sp.timeOfDay !== oldStart && sp.timeOfDay !== oldEnd);
      if (newStart !== "00:00") sched.switchpoints.push({ timeOfDay: newStart, heatSetpoint: newTemp });
      if (newEnd !== "24:00") sched.switchpoints.push({ timeOfDay: newEnd, heatSetpoint: parseFloat(element.dataset.temp!) });

      // Handle midnight temp case
      if (newStart === "00:00" || oldStart === "00:00") {
        const sorted = [...sched.switchpoints].sort((a,b) => a.timeOfDay.localeCompare(b.timeOfDay));
        const lastSp = sorted[sorted.length - 1];
        if (lastSp) lastSp.heatSetpoint = newTemp;
      }

      sched.switchpoints.sort((a,b) => a.timeOfDay.localeCompare(b.timeOfDay));
    }));
    setEditingSlot(null);
  };

  const handleDelete = () => {
    if (!editingSlot) return;
    const start = editingSlot.element.dataset.startTime!;
    if (start === "00:00") return setEditingSlot(null);

    setSchedules(produce(schedules, draft => {
      const sched = draft[editingSlot.zoneId]?.schedule.find(sp => sp.dayOfWeek === editingSlot.day);
      if (sched) sched.switchpoints = sched.switchpoints.filter(sp => sp.timeOfDay !== start);
    }));
    setEditingSlot(null);
  };

  const renderRow = (label: string, dayName: string, zoneId: string) => {
    const daySchedule = schedules[zoneId]?.schedule.find(s => s.dayOfWeek === dayName);
    const sps = daySchedule ? [...daySchedule.switchpoints].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)) : [];
    
    const slots: React.ReactNode[] = [];
    let lastMins = 0;
    let lastTemp = sps.length > 0 ? sps[sps.length - 1].heatSetpoint : 20;

    sps.forEach((sp, i) => {
      const currentMins = timeToMinutes(sp.timeOfDay);
      const width = ((currentMins - lastMins) / TOTAL_DAY_MINUTES) * 100;
      if (width > 0) {
        slots.push(
          <div key={i} style={{ width: `${width}%`, backgroundColor: getTempColor(lastTemp) }}
            className="h-full border-r border-white/10 flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:brightness-110 transition-all select-none"
            onDoubleClick={(e) => handleSlotDoubleClick(dayName, zoneId, e.currentTarget)}
            data-start-time={minutesToTime(lastMins)} data-end-time={minutesToTime(currentMins)} data-temp={lastTemp}>
            {lastTemp}°
          </div>
        );
      }
      lastMins = currentMins;
      lastTemp = sp.heatSetpoint;
    });

    const finalWidth = ((TOTAL_DAY_MINUTES - lastMins) / TOTAL_DAY_MINUTES) * 100;
    if (finalWidth > 0) {
      slots.push(
        <div key="last" style={{ width: `${finalWidth}%`, backgroundColor: getTempColor(lastTemp) }}
          className="h-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:brightness-110 select-none"
          onDoubleClick={(e) => handleSlotDoubleClick(dayName, zoneId, e.currentTarget)}
          data-start-time={minutesToTime(lastMins)} data-end-time="24:00" data-temp={lastTemp}>
          {lastTemp}°
        </div>
      );
    }

    return (
      <div key={`${zoneId}-${dayName}`} className="flex items-center group">
        <div className="w-24 pr-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
        <div className="flex-1 h-10 bg-slate-50 rounded-xl overflow-hidden flex shadow-inner border border-slate-100">
          {slots.length > 0 ? slots : <div className="w-full bg-slate-50" />}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-xl text-white shadow-lg shadow-indigo-200">
            <Activity size={24} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Schedule Manager</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('zone')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'zone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><User size={16}/>Zones</button>
            <button onClick={() => setViewMode('day')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-700'}`}><Calendar size={16}/>Days</button>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setEditMode('resize')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'resize' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-700'}`}><Move size={16}/>Edit Slots</button>
            <button onClick={() => setEditMode('split')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-700'}`}><Scissors size={16}/>Split Slots</button>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
          <button onClick={() => fetchAllSchedules()} disabled={!isDirty} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 hover:bg-slate-200 disabled:opacity-50 transition-all"><X size={18}/>Cancel</button>
          <button onClick={() => saveAllSchedules(schedules)} disabled={!isDirty} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all"><Save size={18}/>Save</button>
        </div>
      </div>

      <div className="mb-8">
        {viewMode === 'zone' ? (
          <ZoneSelector selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />
        ) : (
          <div className="max-w-xs">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 ml-1">Select Active Day</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none">
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {viewMode === 'zone' && selectedZoneId ? (
          DAYS.map(day => renderRow(day, day, selectedZoneId))
        ) : (
          zones.map(zone => renderRow(zone.name, selectedDay, zone.zoneId))
        )}
      </div>

      {editingSlot && (
        <EditPopover
          anchor={editingSlot.element}
          initialTemp={parseFloat(editingSlot.element.dataset.temp!)}
          startTime={editingSlot.element.dataset.startTime!}
          endTime={editingSlot.element.dataset.endTime!}
          onSave={handleUpdate}
          onCancel={() => setEditingSlot(null)}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
};
