import React, { useState, useEffect } from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { ZoneSelector } from './ZoneSelector';
import { Activity, Scissors, Move, Save, X, Calendar, User, Copy, ClipboardCheck, ClipboardPaste, Clock, RefreshCw, Cloud, Cpu } from 'lucide-react';
import { produce } from 'immer';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

// --- Constants ---
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TOTAL_DAY_MINUTES = 24 * 60;
const TIME_RESOLUTION_MINUTES = 10;
const TOTAL_BLOCKS = TOTAL_DAY_MINUTES / TIME_RESOLUTION_MINUTES;

// --- Color & Style Helpers ---
const getTempColor = (temp: number): string => {
  if (temp <= 5) return '#94a3b8'; // Slate
  if (temp <= 10) return '#3b82f6'; // Blue
  if (temp <= 15) return '#38bdf8'; // Sky
  if (temp <= 17) return '#4ade80'; // Green
  if (temp <= 20) return '#facc15'; // Yellow
  if (temp <= 22) return '#fbbf24'; // Amber
  if (temp <= 24) return '#f97316'; // Orange
  if (temp <= 30) return '#ea580c'; // Deep Orange
  return '#ef4444'; // Red
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

// --- Logic Helpers ---

const switchpointsToBlocks = (sps: { timeOfDay: string, heatSetpoint: number }[]): number[] => {
    const blocks = new Array(TOTAL_BLOCKS).fill(20);
    if (sps.length === 0) return blocks;

    const sorted = [...sps].sort((a,b) => a.timeOfDay.localeCompare(b.timeOfDay));
    let currentTemp = sorted[sorted.length - 1].heatSetpoint;
    let spIndex = 0;

    for (let i = 0; i < TOTAL_BLOCKS; i++) {
        const currentMins = i * TIME_RESOLUTION_MINUTES;
        if (spIndex < sorted.length && timeToMinutes(sorted[spIndex].timeOfDay) <= currentMins) {
            currentTemp = sorted[spIndex].heatSetpoint;
            spIndex++;
        }
        blocks[i] = currentTemp;
    }
    return blocks;
};

const blocksToSwitchpoints = (blocks: number[]): { timeOfDay: string, heatSetpoint: number }[] => {
    const sps: { timeOfDay: string, heatSetpoint: number }[] = [];
    if (blocks.length === 0) return sps;

    let lastTemp = blocks[blocks.length - 1];
    
    blocks.forEach((temp, i) => {
        if (temp !== lastTemp) {
            sps.push({ timeOfDay: minutesToTime(i * TIME_RESOLUTION_MINUTES), heatSetpoint: temp });
            lastTemp = temp;
        }
    });

    return sps;
};

// --- Main Component ---

type ViewMode = 'zone' | 'day';
type EditMode = 'resize' | 'split';

export const Scheduler: React.FC = () => {
  const { schedules, zones, setSchedules, isDirty, loading, selectedZoneId, setSelectedZoneId, provider, failedSchedules } = useHeatingStore();
  const { fetchAllSchedules, saveAllSchedules, fetchScheduleForZone, fetchAllSchedulesSequentially, selectProvider } = useHeatingApi();
  
  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [editMode, setEditMode] = useState<EditMode>('resize');
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  const [editingSlot, setEditingSlot] = useState<{ day: string; element: HTMLElement; zoneId: string } | null>(null);
  const [clipboard, setClipboard] = useState<any[] | null>(null);
  const [clipboardSource, setClipboardSource] = useState<string | null>(null);
  const [showProviderPopup, setShowProviderPopup] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const isInitialMount = React.useRef(true);

  useEffect(() => {
    if (viewMode === 'zone' && !selectedZoneId && zones.length > 0) {
        setSelectedZoneId(zones[0].zoneId);
    }
  }, [viewMode, zones, selectedZoneId, setSelectedZoneId]);

  useEffect(() => {
    if (selectedZoneId && !schedules[selectedZoneId] && !loading && !failedSchedules.has(selectedZoneId)) {
        fetchScheduleForZone(selectedZoneId);
    }
  }, [selectedZoneId, schedules, loading, fetchScheduleForZone, failedSchedules]);

  const { refs, floatingStyles } = useFloating({
    open: showProviderPopup,
    onOpenChange: setShowProviderPopup,
    placement: 'bottom-start',
    middleware: [offset(10), shift()],
  });

  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      setShowProviderPopup(true);
    }, 600); 
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const activeZone = zones.find(z => z.zoneId === selectedZoneId);

  const updateScheduleBlocks = (day: string, zoneId: string, transform: (blocks: number[]) => void) => {
    setSchedules(produce(schedules, draft => {
        const daySched = draft[zoneId]?.schedule.find(s => s.dayOfWeek === day);
        if (daySched) {
            const blocks = switchpointsToBlocks(daySched.switchpoints);
            transform(blocks);
            daySched.switchpoints = blocksToSwitchpoints(blocks);
        }
    }));
  };

  const handleSlotDoubleClick = (day: string, zoneId: string, element: HTMLElement) => {
    if (editMode === 'split') {
      const startMins = timeToMinutes(element.dataset.startTime!);
      const endMins = timeToMinutes(element.dataset.endTime!);
      const midMins = Math.round((startMins + endMins) / 2 / TIME_RESOLUTION_MINUTES) * TIME_RESOLUTION_MINUTES;
      if (midMins <= startMins || midMins >= endMins) return;

      updateScheduleBlocks(day, zoneId, (blocks) => {
          const midBlock = midMins / TIME_RESOLUTION_MINUTES;
          if (blocks[midBlock] === blocks[midBlock - 1]) {
              blocks[midBlock] = blocks[midBlock] + 0.5; 
          }
      });
    } else {
      setEditingSlot({ day, zoneId, element });
    }
  };

  const handleUpdate = (newTemp: number, newStart: string, newEnd: string) => {
    if (!editingSlot) return;
    const { day, zoneId, element } = editingSlot;
    const oldStartMins = timeToMinutes(element.dataset.startTime!);
    const oldEndMins = timeToMinutes(element.dataset.endTime!);
    
    updateScheduleBlocks(day, zoneId, (blocks) => {
        const newStartMins = timeToMinutes(newStart);
        const newEndMins = timeToMinutes(newEnd);
        const fillerTemp = oldStartMins > 0 ? blocks[(oldStartMins / TIME_RESOLUTION_MINUTES) - 1] : blocks[TOTAL_BLOCKS - 1];
        for (let i = oldStartMins / TIME_RESOLUTION_MINUTES; i < oldEndMins / TIME_RESOLUTION_MINUTES; i++) {
            blocks[i] = fillerTemp;
        }
        const startBlock = newStartMins / TIME_RESOLUTION_MINUTES;
        const endBlock = newEndMins / TIME_RESOLUTION_MINUTES;
        for (let i = startBlock; i < endBlock; i++) {
            blocks[i % TOTAL_BLOCKS] = newTemp;
        }
    });
    setEditingSlot(null);
  };

  const handleDelete = () => {
    if (!editingSlot) return;
    const { day, zoneId, element } = editingSlot;
    const startMins = timeToMinutes(element.dataset.startTime!);
    const endMins = timeToMinutes(element.dataset.endTime!);
    
    updateScheduleBlocks(day, zoneId, (blocks) => {
        const startBlock = startMins / TIME_RESOLUTION_MINUTES;
        const endBlock = endMins / TIME_RESOLUTION_MINUTES;
        const fillerTemp = startBlock > 0 ? blocks[startBlock - 1] : blocks[TOTAL_BLOCKS - 1];
        for (let i = startBlock; i < endBlock; i++) {
            blocks[i] = fillerTemp;
        }
    });
    setEditingSlot(null);
  };

  const handleCopy = (dayName: string, zoneId: string, rowLabel: string) => {
    const daySchedule = schedules[zoneId]?.schedule.find(s => s.dayOfWeek === dayName);
    if (daySchedule) {
        setClipboard([...daySchedule.switchpoints]);
        setClipboardSource(rowLabel);
    }
  };

  const handlePaste = (dayName: string, zoneId: string) => {
    if (!clipboard) return;
    setSchedules(produce(schedules, draft => {
        const sched = draft[zoneId]?.schedule.find(s => s.dayOfWeek === dayName);
        if (sched) sched.switchpoints = JSON.parse(JSON.stringify(clipboard));
    }));
  };

  const handlePasteToAll = () => {
    if (!clipboard) return;
    setSchedules(produce(schedules, draft => {
        const points = JSON.parse(JSON.stringify(clipboard));
        if (viewMode === 'zone' && selectedZoneId) {
            draft[selectedZoneId]?.schedule.forEach(day => day.switchpoints = points);
        } else if (viewMode === 'day') {
            Object.values(draft).forEach(zone => {
                const day = zone.schedule.find(s => s.dayOfWeek === selectedDay);
                if (day) day.switchpoints = points;
            });
        }
    }));
  };

  const renderTimelineHeader = () => {
    const markers = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    return (
      <div className="flex items-center mb-2">
        <div className="w-24 pr-2 text-right opacity-0">Time</div>
        <div className="flex-1 h-6 relative w-full flex items-end">
          {markers.map((hour) => {
            const left = (hour / 24) * 100;
            return (
              <div key={hour} style={{ left: `${left}%` }} className="absolute flex flex-col items-center -translate-x-1/2">
                <span className="text-[10px] font-black text-slate-400">{hour.toString().padStart(2, '0')}:00</span>
                <div className="h-1 w-[1px] bg-slate-200 mt-1" />
              </div>
            );
          })}
        </div>
        <div className="w-16 opacity-0" />
      </div>
    );
  };

  const renderRow = (label: string, dayName: string, zoneId: string) => {
    const zoneSchedule = schedules[zoneId];
    const hasData = zoneSchedule && zoneSchedule.schedule && zoneSchedule.schedule.length > 0;
    const daySchedule = hasData ? zoneSchedule.schedule.find(s => s.dayOfWeek === dayName) : null;
    
    const sps = daySchedule ? [...daySchedule.switchpoints].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay)) : [];
    const slots: React.ReactNode[] = [];
    
    if (hasData) {
        let lastMins = 0;
        let lastTemp = sps.length > 0 ? sps[sps.length - 1].heatSetpoint : 20;

        sps.forEach((sp, i) => {
        const currentMins = timeToMinutes(sp.timeOfDay);
        const width = ((currentMins - lastMins) / TOTAL_DAY_MINUTES) * 100;
        if (width > 0) {
            const rangeText = `${minutesToTime(lastMins)} - ${minutesToTime(currentMins)}`;
            slots.push(
            <div key={i} style={{ width: `${width}%`, backgroundColor: getTempColor(lastTemp) }}
                className="h-full border-r border-white/10 flex flex-col items-center justify-center text-white font-bold cursor-pointer hover:brightness-110 transition-all select-none relative group/slot"
                onDoubleClick={(e) => handleSlotDoubleClick(dayName, zoneId, e.currentTarget)}
                title={`${rangeText} | ${lastTemp}°C`}
                data-start-time={minutesToTime(lastMins)} data-end-time={minutesToTime(currentMins)} data-temp={lastTemp}>
                <span className="text-[10px]">{lastTemp}°</span>
                {width > 8 && (
                    <span className="absolute top-0.5 left-1 text-[7px] text-white/40 group-hover/slot:text-white/80 transition-colors uppercase tracking-tighter">
                        {minutesToTime(lastMins)}
                    </span>
                )}
            </div>
            );
        }
        lastMins = currentMins;
        lastTemp = sp.heatSetpoint;
        });

        const finalWidth = ((TOTAL_DAY_MINUTES - lastMins) / TOTAL_DAY_MINUTES) * 100;
        if (finalWidth > 0) {
        const rangeText = `${minutesToTime(lastMins)} - 24:00`;
        slots.push(
            <div key="last" style={{ width: `${finalWidth}%`, backgroundColor: getTempColor(lastTemp) }}
            className="h-full flex flex-col items-center justify-center text-white font-bold cursor-pointer hover:brightness-110 select-none relative group/slot"
            onDoubleClick={(e) => handleSlotDoubleClick(dayName, zoneId, e.currentTarget)}
            title={`${rangeText} | ${lastTemp}°C`}
            data-start-time={minutesToTime(lastMins)} data-end-time="24:00" data-temp={lastTemp}>
            <span className="text-[10px]">{lastTemp}°</span>
            {finalWidth > 8 && (
                    <span className="absolute top-0.5 left-1 text-[7px] text-white/40 group-hover/slot:text-white/80 transition-colors uppercase tracking-tighter">
                        {minutesToTime(lastMins)}
                    </span>
                )}
            </div>
        );
        }
    }

    const isSource = clipboardSource === label;

    return (
      <div key={`${zoneId}-${dayName}`} className="flex items-center group gap-2">
        <div className="w-24 pr-2 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</div>
        <div className="flex-1 h-10 bg-slate-50 rounded-xl overflow-hidden flex shadow-inner border border-slate-100 items-center justify-center relative">
          {hasData ? slots : (
              <div className="flex items-center gap-2 text-slate-300">
                  <Clock size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">No Schedule Data</span>
              </div>
          )}
        </div>
        <div className="w-16 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity pr-2">
            {hasData && (
                <>
                    <button onClick={() => handleCopy(dayName, zoneId, label)} className={`p-2 lg:p-1.5 rounded-lg transition-colors ${isSource ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Copy size={16} className="lg:w-[14px] lg:h-[14px]" /></button>
                    {clipboard && (isSource ? 
                        <button onClick={handlePasteToAll} className="p-2 lg:p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-sm"><ClipboardPaste size={16} className="lg:w-[14px] lg:h-[14px]" /></button> :
                        <button onClick={() => handlePaste(dayName, zoneId)} className="p-2 lg:p-1.5 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"><ClipboardCheck size={16} className="lg:w-[14px] lg:h-[14px]" /></button>
                    )}
                </>
            )}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8">
        <div className="flex items-center gap-3">
          <button 
            ref={refs.setReference}
            onMouseDown={handleLongPressStart}
            onMouseUp={handleLongPressEnd}
            onMouseLeave={handleLongPressEnd}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            title="Long press to change provider"
            className={`${provider?.name === 'MQTT' ? 'bg-emerald-500' : 'bg-slate-400'} p-2 rounded-xl text-white shadow-lg ${provider?.name === 'MQTT' ? 'shadow-emerald-100' : 'shadow-slate-100'} transition-transform active:scale-95 cursor-pointer outline-none border-none`}
          >
            {provider?.name === 'MQTT' ? <Cpu size={24} /> : <Cloud size={24} />}
          </button>

          {showProviderPopup && (
            <FloatingPortal>
              <div 
                ref={refs.setFloating}
                style={floatingStyles}
                className="bg-white border border-slate-200 p-2 rounded-2xl shadow-2xl z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="text-[10px] font-black uppercase text-slate-400 px-3 py-2 mb-1 tracking-widest border-b border-slate-50">Select Provider</div>
                <button 
                  onClick={() => { selectProvider('honeywell'); setShowProviderPopup(false); }}
                  className={`w-full border-none flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${provider?.name === 'Honeywell' ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Cloud size={18} className="text-slate-400" />
                  Cloud (Honeywell)
                </button>
                <button 
                  onClick={() => { selectProvider('mqtt'); setShowProviderPopup(false); }}
                  className={`w-full border-none flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${provider?.name === 'MQTT' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Cpu size={18} className="text-emerald-500" />
                  Local (MQTT)
                </button>
              </div>
            </FloatingPortal>
          )}

          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Schedule Manager</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('zone')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'zone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><User size={16} className="inline mr-2"/>Zones</button>
            <button onClick={() => setViewMode('day')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Calendar size={16} className="inline mr-2"/>Days</button>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setEditMode('resize')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'resize' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Move size={16} className="inline mr-2"/>Edit Slots</button>
            <button onClick={() => setEditMode('split')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Scissors size={16} className="inline mr-2"/>Split Slots</button>
          </div>
          <button onClick={() => fetchAllSchedules(false, true)} disabled={!isDirty} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 hover:bg-slate-200 disabled:opacity-50 transition-all"><X size={18} className="inline mr-2"/>Cancel</button>
          <button onClick={() => saveAllSchedules(schedules)} disabled={!isDirty} className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all"><Save size={18} className="inline mr-2"/>Save</button>
        </div>
      </div>
      <div className="mb-8 flex flex-col md:flex-row items-end gap-4">
        {viewMode === 'zone' ? (
          <div className="flex-1 flex items-end gap-6">
            <div className="max-w-xs w-full">
              <ZoneSelector selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />
            </div>
            
            {activeZone && (
              <div className="hidden lg:flex items-center gap-6 mb-1 text-slate-600 border-l-2 border-slate-100 pl-6 h-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Current</span>
                  <span className="text-xl font-black text-slate-800 leading-none">{activeZone.temperature.toFixed(1)}°</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Target</span>
                  <span className="text-xl font-black text-indigo-600 leading-none">{activeZone.setpoint.toFixed(1)}°</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mode</span>
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none mt-1.5">
                    {activeZone.setpointMode}
                    {activeZone.setpointMode === 'Temporary Override' && activeZone.until && ` until ${new Date(activeZone.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 max-w-xs">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 ml-1">Select Day</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all">{DAYS.map(d => <option key={d} value={d}>{d}</option>)}</select>
          </div>
        )}

        <div className="flex gap-2">
          {viewMode === 'zone' && selectedZoneId && (
            <button 
              onClick={() => fetchScheduleForZone(selectedZoneId)}
              disabled={loading}
              title="Refresh Current Zone"
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border-2 border-indigo-100 rounded-xl text-sm font-bold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-all"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh Zone
            </button>
          )}
          
          <button 
            onClick={fetchAllSchedulesSequentially}
            disabled={loading}
            title="Refresh All Schedules One by One"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50 transition-all"
          >
            <Activity size={16} className={loading ? "animate-pulse" : ""} />
            Refresh All
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {renderTimelineHeader()}
        {viewMode === 'zone' ? (selectedZoneId ? DAYS.map(day => renderRow(day, day, selectedZoneId)) : null) : 
          [...zones].sort((a,b) => a.name.localeCompare(b.name)).map(zone => renderRow(zone.name, selectedDay, zone.zoneId))}
      </div>

      {editingSlot && (
        <EditPopover anchor={editingSlot.element} initialTemp={parseFloat(editingSlot.element.dataset.temp!)} startTime={editingSlot.element.dataset.startTime!} endTime={editingSlot.element.dataset.endTime!} onSave={handleUpdate} onCancel={() => setEditingSlot(null)} onDelete={handleDelete} />
      )}
    </section>
  );
};
