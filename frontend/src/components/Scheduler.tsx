import React, { useState, useEffect } from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { ZoneSelector } from './ZoneSelector';
import { Activity, Scissors, Move, Save, X, Calendar, User } from 'lucide-react';
import { produce } from 'immer';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

// --- (Keep all internal components and types) ---
interface Switchpoint { heatSetpoint: number; timeOfDay: string; }
interface DailySchedule { dayOfWeek: string; switchpoints: Switchpoint[]; }
interface EditPopoverProps { anchor: HTMLElement | null; initialTemp: number; startTime: string; endTime: string; onSave: (newTemp: number, newStartTime: string, newEndTime: string) => void; onCancel: () => void; onDelete: () => void; }

const EditPopover: React.FC<EditPopoverProps> = ({ anchor, initialTemp, startTime, endTime, onSave, onCancel, onDelete }) => {
    const [temp, setTemp] = useState(initialTemp);
    const [start, setStart] = useState(startTime);
    const [end, setEnd] = useState(endTime);
    const { refs, floatingStyles } = useFloating({ elements: { reference: anchor }, placement: 'top', middleware: [offset(10), shift()], });
    return (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className="bg-slate-800 text-white p-4 rounded-lg shadow-2xl z-20">
            <div className="grid grid-cols-2 gap-3">
              <label htmlFor="popover-start-time" className="font-bold text-sm justify-self-end">Start:</label>
              <input id="popover-start-time" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-700 rounded-md p-1 text-sm w-28" />
              <label htmlFor="popover-end-time" className="font-bold text-sm justify-self-end">End:</label>
              <input id="popover-end-time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-700 rounded-md p-1 text-sm w-28" />
              <label htmlFor="popover-temp" className="font-bold text-sm justify-self-end">Temp:</label>
              <input id="popover-temp" type="number" value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-700 rounded-md p-1 text-sm w-16" />
            </div>
            <div className="flex justify-between gap-2 mt-4">
              <button onClick={onDelete} className="px-3 py-1 bg-red-700 rounded-md text-sm font-bold hover:bg-red-600">Delete</button>
              <div>
                <button onClick={onCancel} className="px-3 py-1 bg-slate-600 rounded-md text-sm hover:bg-slate-500 mr-2">Cancel</button>
                <button onClick={() => onSave(temp, start, end)} className="px-3 py-1 bg-indigo-600 rounded-md text-sm font-bold hover:bg-indigo-500">OK</button>
              </div>
            </div>
          </div>
        </FloatingPortal>
      );
};

// --- Main Scheduler Component ---
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TOTAL_DAY_MINUTES = 24 * 60;
const TIME_RESOLUTION_MINUTES = 10;
type ViewMode = 'zone' | 'day';
type EditMode = 'resize' | 'split';

const timeToMinutes = (time: string): number => {
  if (typeof time !== 'string' || !time.includes(':')) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const Scheduler: React.FC = () => {
  const { schedules, zones, setSchedules, isDirty } = useHeatingStore();
  const { fetchAllSchedules, saveAllSchedules } = useHeatingApi();
  
  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  
  const [editingSlot, setEditingSlot] = useState<{ day: string; element: HTMLElement; zoneId?: string } | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('resize');

  useEffect(() => {
    if (viewMode === 'zone' && !selectedZoneId && zones.length > 0) {
      setSelectedZoneId(zones[0].zoneId);
    }
  }, [zones, selectedZoneId, viewMode]);

  const handleSlotDoubleClick = (day: string, element: HTMLElement, zoneIdForDayView?: string) => {
    const zoneId = viewMode === 'zone' ? selectedZoneId : zoneIdForDayView;
    if (!zoneId) return;

    if (editMode === 'split') {
        const startTime = element.dataset.startTime!;
        const endTime = element.dataset.endTime!;
        const temp = parseFloat(element.dataset.temp!);
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        const middleMinutes = Math.round((startMinutes + endMinutes) / 2 / TIME_RESOLUTION_MINUTES) * TIME_RESOLUTION_MINUTES;
        if (middleMinutes <= startMinutes || middleMinutes >= endMinutes) return;
        const newTime = minutesToTime(middleMinutes);
        const newSchedules = produce(schedules, draft => {
            const dayToUpdate = draft[zoneId]?.schedule.find(s => s.dayOfWeek === day);
            if (dayToUpdate) {
                dayToUpdate.switchpoints.push({ timeOfDay: newTime, heatSetpoint: temp });
                dayToUpdate.switchpoints.sort((a,b) => a.timeOfDay.localeCompare(b.timeOfDay));
            }
        });
        setSchedules(newSchedules);
    } else {
        setEditingSlot({ day, element, zoneId: zoneId });
    }
  }

  const handleUpdate = (newTemp: number, newStartTime: string, newEndTime: string) => {
    if (!editingSlot || !editingSlot.zoneId) return;
    const { day, element, zoneId } = editingSlot;
    // ... (logic for update)
    setEditingSlot(null);
  };

  const handleDelete = () => {
    if (!editingSlot || !editingSlot.zoneId) return;
    const { day, element, zoneId } = editingSlot;
    // ... (logic for delete)
    setEditingSlot(null);
  }

  const renderScheduleRow = (label: string, dayName: string, schedule: DailySchedule | undefined, rowId: string) => {
    const sortedSwitchpoints = schedule ? [...schedule.switchpoints].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)) : [];
    const daySlots: React.ReactNode[] = [];
    if (sortedSwitchpoints.length > 0) {
        let lastMinute = 0;
        let lastTemp = sortedSwitchpoints[sortedSwitchpoints.length - 1].heatSetpoint;
        sortedSwitchpoints.forEach((sp, index) => {
            const startMinutes = timeToMinutes(sp.timeOfDay);
            const slotWidth = ((startMinutes - lastMinute) / TOTAL_DAY_MINUTES) * 100;
            if (slotWidth > 0) {
                daySlots.push(
                    <div
                        key={`${rowId}-${index}`}
                        style={{ width: `${slotWidth}%`, backgroundColor: `hsl(200, 50%, ${100 - (lastTemp * 2)}%)` }}
                        className="h-full flex items-center justify-center text-white text-xs font-bold cursor-pointer relative"
                        onDoubleClick={(e) => handleSlotDoubleClick(dayName, e.currentTarget, rowId)}
                        data-start-time={minutesToTime(lastMinute)}
                        data-end-time={minutesToTime(startMinutes)}
                        data-temp={lastTemp}
                    >
                        {lastTemp}°
                    </div>
                );
            }
            lastMinute = startMinutes;
            lastTemp = sp.heatSetpoint;
        });
        const finalSlotWidth = ((TOTAL_DAY_MINUTES - lastMinute) / TOTAL_DAY_MINUTES) * 100;
        if (finalSlotWidth > 0) {
            daySlots.push(
                <div
                    key={`${rowId}-last`}
                    style={{ width: `${finalSlotWidth}%`, backgroundColor: `hsl(200, 50%, ${100 - (lastTemp * 2)}%)` }}
                    className="h-full flex items-center justify-center text-white text-xs font-bold cursor-pointer"
                    onDoubleClick={(e) => handleSlotDoubleClick(dayName, e.currentTarget, rowId)}
                    data-start-time={minutesToTime(lastMinute)}
                    data-end-time={"24:00"}
                    data-temp={lastTemp}
                >
                    {lastTemp}°
                </div>
            );
        }
    } else {
        daySlots.push(<div key={`${rowId}-empty`} className="h-full w-full bg-slate-200" />);
    }
    return (
        <div key={label} className="flex items-center">
            <div className="w-24 pr-4 text-right font-bold text-slate-600 shrink-0">{label}</div>
            <div className="flex-1 h-10 bg-slate-100 rounded-md overflow-hidden flex relative w-full">
                {daySlots}
            </div>
        </div>
    );
  };

  return (
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity size={24} className="text-indigo-500" />
                Heating Scheduler
            </h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setViewMode('zone')} className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm transition-colors ${viewMode === 'zone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <User size={14} /> Zone View
                    </button>
                    <button onClick={() => setViewMode('day')} className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm transition-colors ${viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <Calendar size={14} /> Day View
                    </button>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setEditMode('resize')} className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm transition-colors ${editMode === 'resize' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <Move size={14} /> Edit Slots
                    </button>
                    <button onClick={() => setEditMode('split')} className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm transition-colors ${editMode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <Scissors size={14} /> Split Slots
                    </button>
                </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => fetchAllSchedules()} disabled={!isDirty} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                        <X size={16} /> Cancel
                    </button>
                    <button onClick={() => saveAllSchedules(schedules)} disabled={!isDirty} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Save size={16} /> Save Changes
                    </button>
                 </div>
            </div>
        </div>

        {viewMode === 'zone' ? (
            <ZoneSelector selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />
        ) : (
            <div className="mb-4">
                <label htmlFor="day-select" className="block text-sm font-medium text-slate-700 mb-1">Select Day</label>
                <select id="day-select" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                    {DAYS.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
            </div>
        )}

        <div className="mt-6 space-y-1">
          {viewMode === 'zone' && selectedZoneId && schedules[selectedZoneId]
            ? DAYS.map((day) => {
                const daySchedule = schedules[selectedZoneId]!.schedule.find(s => s.dayOfWeek === day);
                return renderScheduleRow(day, day, daySchedule, selectedZoneId);
              })
            : null
          }

          {viewMode === 'day' &&
            zones.map((zone) => {
              const daySchedule = schedules[zone.zoneId]?.schedule.find(s => s.dayOfWeek === selectedDay);
              return renderScheduleRow(zone.name, selectedDay, daySchedule, zone.zoneId);
            })
          }
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
