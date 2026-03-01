import React, { useState, useEffect } from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { ZoneSelector } from './ZoneSelector';
import { Scissors, Move, Save, X, Calendar, User, Copy, ClipboardCheck, ClipboardPaste, Clock, RefreshCw, Cloud, Cpu, Trash2 } from 'lucide-react';
import { produce } from 'immer';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

// --- Constants ---
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TOTAL_DAY_MINUTES = 24 * 60;

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

// --- Logic Helpers ---

const switchpointsToBlocks = (sps: { timeOfDay: string, heatSetpoint?: number, state?: string }[], resolution: number, isDhw?: boolean): number[] => {
    const totalBlocks = TOTAL_DAY_MINUTES / resolution;
    const blocks = new Array(totalBlocks).fill(isDhw ? 0 : 20);
    if (!sps || sps.length === 0) return blocks;

    const sorted = [...sps].sort((a,b) => a.timeOfDay.localeCompare(b.timeOfDay));

    const getVal = (sp: any) => {
        if (isDhw) return sp.state === 'On' ? 1 : 0;
        return sp.heatSetpoint ?? 20;
    };

    let currentVal = getVal(sorted[sorted.length - 1]);
    let spIndex = 0;

    for (let i = 0; i < totalBlocks; i++) {
        const currentMins = i * resolution;
        if (spIndex < sorted.length && timeToMinutes(sorted[spIndex].timeOfDay) <= currentMins) {
            currentVal = getVal(sorted[spIndex]);
            spIndex++;
        }
        blocks[i] = currentVal;
    }
    return blocks;
};

const blocksToSwitchpoints = (blocks: number[], resolution: number, isDhw?: boolean): { timeOfDay: string, heatSetpoint?: number, state?: string }[] => {
    const sps: { timeOfDay: string, heatSetpoint?: number, state?: string }[] = [];
    if (!blocks || blocks.length === 0) return sps;

    let lastVal = blocks[blocks.length - 1];
    blocks.forEach((val, i) => {
        if (val !== lastVal) {
            const sp: any = { timeOfDay: minutesToTime(i * resolution) };
            if (isDhw) sp.state = val === 1 ? 'On' : 'Off';
            else sp.heatSetpoint = val;
            sps.push(sp);
            lastVal = val;
        }
    });
    return sps;
};

// --- Internal Components ---

interface EditPopoverProps {
  anchor: HTMLElement | null;
  initialTemp: number;
  startTime: string;
  endTime: string;
  isDhw?: boolean;
  onSave: (newTemp: number, newStartTime: string, newEndTime: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const EditPopover: React.FC<EditPopoverProps> = ({ anchor, initialTemp, startTime, endTime, isDhw, onSave, onCancel, onDelete }) => {
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
      <div ref={refs.setFloating} style={floatingStyles} className="bg-slate-800 text-white p-4 rounded-lg shadow-2xl z-50 border border-slate-700">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Start Time</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 text-white" />
          
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">End Time</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 text-white" />
          
          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{isDhw ? 'State' : 'Target Temp'}</label>
          {isDhw ? (
            <div className="flex bg-slate-700 rounded p-1">
              <button 
                onClick={() => setTemp(1)} 
                className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${temp === 1 ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                ON
              </button>
              <button 
                onClick={() => setTemp(0)} 
                className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${temp === 0 ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
              >
                OFF
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" value={temp} step="0.5" onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-700 rounded p-1 text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500 text-white" />
              <span className="text-xs font-bold text-slate-400">°C</span>
            </div>
          )}
        </div>
        <div className="flex justify-between gap-2 border-t border-slate-700 pt-4">
          <button onClick={onDelete} className="px-3 py-1 bg-red-900/50 text-red-200 rounded text-xs font-bold hover:bg-red-800 transition-colors flex items-center gap-1">
              <Trash2 size={12}/> Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1 bg-slate-700 rounded text-xs hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={() => onSave(temp, start, end)} className="px-3 py-1 bg-indigo-600 border border-indigo-500 rounded text-xs font-bold hover:bg-indigo-500 transition-colors">Apply</button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
};

type ViewMode = 'zone' | 'day';
type EditMode = 'resize' | 'split';

export const Scheduler: React.FC = () => {
  const { schedules, zones, dhw, setSchedules, isDirty, loading, selectedZoneId, setSelectedZoneId, provider, failedSchedules, uiConfig } = useHeatingStore();
  const { saveAllSchedules, fetchScheduleForZone, fetchAllSchedulesSequentially, selectProvider } = useHeatingApi();
  
  const resolution = uiConfig?.timeResolution || 10;
  const totalBlocks = TOTAL_DAY_MINUTES / resolution;

  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [editMode, setEditMode] = useState<EditMode>('resize');
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  const [editingSlot, setEditingSlot] = useState<{ day: string; element: HTMLElement; zoneId: string } | null>(null);
  const [clipboard, setClipboard] = useState<any[] | null>(null);
  const [clipboardSource, setClipboardSource] = useState<string | null>(null);
  const [showProviderPopup, setShowProviderPopup] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<any | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Record<string, number>>({});

  const queryParams = new URLSearchParams(window.location.search);
  const isEmbedded = queryParams.get('embed') === 'true';

  const handleZoneRefresh = async (zoneId: string) => {
    const now = Date.now();
    const lastTime = lastRefreshTime[zoneId] || 0;
    const isForce = (now - lastTime) < 20000;
    
    await fetchScheduleForZone(zoneId, false, isForce);
    setLastRefreshTime(prev => ({ ...prev, [zoneId]: now }));
  };

  useEffect(() => {
    if (viewMode === 'zone' && !selectedZoneId && zones.length > 0) {
        setSelectedZoneId(zones[0].zoneId);
    }
  }, [viewMode, zones, selectedZoneId, setSelectedZoneId]);

  useEffect(() => {
    if (selectedZoneId && !schedules[selectedZoneId] && !loading && !failedSchedules.has(selectedZoneId)) {
        fetchScheduleForZone(selectedZoneId, true);
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
    }, uiConfig?.longPressMs || 600);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const updateScheduleBlocks = (day: string, zoneId: string, transform: (blocks: number[]) => void) => {
    const isDhw = zoneId === dhw?.dhwId;
    setSchedules(produce(schedules, draft => {
        const daySched = draft[zoneId]?.schedule.find(s => s.dayOfWeek === day);
        if (daySched) {
            const blocks = switchpointsToBlocks(daySched.switchpoints, resolution, isDhw);
            transform(blocks);
            daySched.switchpoints = blocksToSwitchpoints(blocks, resolution, isDhw) as any;
        }
    }));
  };

  const handleSlotDoubleClick = (day: string, zoneId: string, element: HTMLElement) => {
    if (editMode === 'split') {
      const startMins = timeToMinutes(element.dataset.startTime!);
      const endMins = timeToMinutes(element.dataset.endTime!);
      const midMins = Math.round((startMins + endMins) / 2 / resolution) * resolution;
      if (midMins <= startMins || midMins >= endMins) return;

      updateScheduleBlocks(day, zoneId, (blocks) => {
          const midBlock = midMins / resolution;
          if (blocks[midBlock] === blocks[midBlock - 1]) {
              blocks[midBlock] = (blocks[midBlock] > 0) ? blocks[midBlock] - 0.1 : blocks[midBlock] + 0.1;
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
        const fillerTemp = oldStartMins > 0 ? blocks[(oldStartMins / resolution) - 1] : blocks[totalBlocks - 1];
        for (let i = oldStartMins / resolution; i < oldEndMins / resolution; i++) {
            blocks[i] = fillerTemp;
        }
        const startBlock = newStartMins / resolution;
        const endBlock = newEndMins / resolution;
        for (let i = startBlock; i < endBlock; i++) {
            blocks[i % totalBlocks] = newTemp;
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
        const startBlock = startMins / resolution;
        const endBlock = endMins / resolution;
        const fillerTemp = startBlock > 0 ? blocks[startBlock - 1] : blocks[totalBlocks - 1];
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
    const isDhw = zoneId === dhw?.dhwId;
    const zoneSchedule = schedules[zoneId];
    const hasData = zoneSchedule && zoneSchedule.schedule && zoneSchedule.schedule.length > 0;
    const daySchedule = hasData ? zoneSchedule.schedule.find(s => s.dayOfWeek === dayName) : null;
    
    const slots: React.ReactNode[] = [];
    
    if (hasData) {
        const blocks = switchpointsToBlocks(daySchedule?.switchpoints || [], resolution, isDhw);
        const segments: { val: number, start: number, length: number }[] = [];
        
        if (blocks.length > 0) {
            let currentVal = blocks[0];
            let start = 0;
            blocks.forEach((val, i) => {
                if (val !== currentVal) {
                    segments.push({ val: currentVal, start, length: i - start });
                    currentVal = val;
                    start = i;
                }
            });
            segments.push({ val: currentVal, start, length: blocks.length - start });
        }

        segments.forEach((seg, i) => {
            const width = (seg.length / totalBlocks) * 100;
            const startTimeText = minutesToTime(seg.start * resolution);
            const endTimeText = minutesToTime((seg.start + seg.length) * resolution);
            const rangeText = `${startTimeText} - ${endTimeText}`;
            const color = isDhw ? (seg.val === 1 ? '#6366f1' : '#94a3b8') : getTempColor(seg.val);
            const labelText = isDhw ? (seg.val === 1 ? 'ON' : 'OFF') : `${seg.val.toFixed(1)}°`;

            slots.push(
                <div 
                    key={i} 
                    style={{ width: `${width}%`, backgroundColor: color }}
                    className="h-full border-r border-white/10 flex flex-col items-center justify-center text-white font-bold cursor-pointer hover:brightness-110 transition-all select-none relative group/slot flex-shrink-0"
                    onDoubleClick={(e) => handleSlotDoubleClick(dayName, zoneId, e.currentTarget)}
                    title={`${rangeText} | ${isDhw ? (seg.val === 1 ? 'ON' : 'OFF') : seg.val + '°C'}`}
                    data-start-time={startTimeText} 
                    data-end-time={endTimeText} 
                    data-val={seg.val}
                >
                    <span className="text-[10px]">{labelText}</span>
                    {width > 8 && (
                        <span className="absolute top-0.5 left-1 text-[7px] text-white/40 group-hover/slot:text-white/80 transition-colors uppercase tracking-tighter">
                            {startTimeText}
                        </span>
                    )}
                </div>
            );
        });
    }

    const isSource = clipboardSource === label;

    return (
      <div key={`${zoneId}-${dayName}`} className="flex items-center group gap-2 mb-1 last:mb-0">
        <div className="w-24 pr-2 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</div>
        <div className="flex-1 h-10 bg-slate-50 rounded-xl overflow-hidden flex shadow-inner border border-slate-100 relative">
          {hasData ? slots : (
              <div className="flex-1 flex items-center justify-center gap-2 text-slate-300">
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
    <section className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col min-h-[600px] p-6 md:p-8">
      <header className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div 
            ref={refs.setReference}
            onMouseDown={handleLongPressStart}
            onMouseUp={handleLongPressEnd}
            onMouseLeave={handleLongPressEnd}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 cursor-pointer hover:bg-indigo-500 transition-colors"
          >
            {provider?.name === 'MQTT' ? <Cpu size={24}/> : <Cloud size={24}/>}
          </div>
          
          {showProviderPopup && (
            <FloatingPortal>
              <div 
                ref={refs.setFloating}
                style={floatingStyles}
                className="bg-white border border-slate-100 p-1 rounded-2xl shadow-2xl z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="text-[10px] font-black uppercase text-slate-400 px-3 py-2 mb-1 tracking-widest border-b border-slate-50">Select Provider</div>
                <button 
                  onClick={() => selectProvider('honeywell')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-700 transition-colors"
                >
                  <Cloud size={16} className="text-sky-500" /> Cloud (Honeywell)
                </button>
                <button 
                  onClick={() => selectProvider('mqtt')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-700 transition-colors"
                >
                  <Cpu size={16} className="text-emerald-500" /> Local (MQTT)
                </button>
              </div>
            </FloatingPortal>
          )}

          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Schedule Manager</h2>
          {isEmbedded && provider?.gatewayStatus && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${(['online', 'authenticated'].includes(provider.gatewayStatus.toLowerCase())) ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-rose-50 text-rose-600 border-rose-100/50'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${(['online', 'authenticated'].includes(provider.gatewayStatus.toLowerCase())) ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {provider.name === 'Honeywell' ? 'TCC' : 'evoGateway'}: {provider.gatewayStatus}
                </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('zone')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'zone' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><User size={16} className="inline mr-2"/>Zones</button>
            <button onClick={() => setViewMode('day')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Calendar size={16} className="inline mr-2"/>Days</button>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block"></div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setEditMode('resize')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'resize' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`} title="Resize and move slots"><Move size={16} className="inline mr-2"/>Edit</button>
            <button onClick={() => setEditMode('split')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${editMode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`} title="Double click to split a slot"><Scissors size={16} className="inline mr-2"/>Split</button>
          </div>

          <button onClick={() => saveAllSchedules(schedules)} disabled={!isDirty} className={`ml-2 px-6 py-2 rounded-xl text-sm font-black transition-all ${isDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}><Save size={18} className="inline mr-2"/>Save</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {viewMode === 'zone' ? (
          <div className="flex-1 flex items-end gap-6 mb-8">
            <div className="max-w-xs w-full">
              <ZoneSelector selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />
            </div>
            {selectedZoneId && (
                <button 
                    onClick={() => handleZoneRefresh(selectedZoneId)}
                    className="p-2.5 bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all"
                    title="Refresh Schedule"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-8 bg-slate-50 p-2 rounded-2xl w-fit">
            {DAYS.map(day => (
              <button 
                key={day} 
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedDay === day ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
              >{day.substring(0, 3)}</button>
            ))}
            <div className="h-6 w-px bg-slate-200 mx-2"></div>
            <button 
                onClick={fetchAllSchedulesSequentially}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
            >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh All
            </button>
          </div>
        )}

        <div className="bg-slate-50/50 rounded-2xl p-4 md:p-6 border border-slate-100">
          {renderTimelineHeader()}

          <div className="space-y-1">
            {viewMode === 'zone' ? (
              selectedZoneId ? DAYS.map(day => renderRow(day.substring(0, 3), day, selectedZoneId)) : <div className="py-20 text-center text-slate-400 font-bold">Select a zone to view schedule</div>
            ) : (
              [...zones, ...(dhw ? [{ zoneId: dhw.dhwId, name: 'Hot Water' }] : [])].map(z => renderRow(z.name, selectedDay, z.zoneId))
            )}
          </div>
        </div>

        {clipboard && (
            <div className="mt-8 flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 animate-in slide-in-from-bottom-2 duration-300">
                <ClipboardCheck size={18} />
                <span className="text-xs font-bold">Day schedule copied from <span className="font-black underline">{clipboardSource}</span>. Ready to paste!</span>
                <button onClick={() => setClipboard(null)} className="ml-auto text-indigo-300 hover:text-indigo-600"><X size={16}/></button>
            </div>
        )}
      </main>

      <footer className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-slate-400">
        <div className="flex items-center gap-2">
          <Clock size={14}/>
          <span className="text-[10px] font-black uppercase tracking-widest">Resolution: {resolution} mins</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Off/Eco</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comfort</span>
            </div>
        </div>
      </footer>

      {editingSlot && (
        <EditPopover 
            anchor={editingSlot.element}
            initialTemp={parseFloat(editingSlot.element.dataset.val || '20')}
            startTime={editingSlot.element.dataset.startTime!}
            endTime={editingSlot.element.dataset.endTime!}
            isDhw={editingSlot.zoneId === dhw?.dhwId}
            onSave={handleUpdate}
            onCancel={() => setEditingSlot(null)}
            onDelete={handleDelete}
        />
      )}
    </section>
  );
};
