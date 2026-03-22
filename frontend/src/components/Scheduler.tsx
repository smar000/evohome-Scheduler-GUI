import React, { useState, useEffect } from 'react';
import { useHeatingStore } from '../store/useHeatingStore';
import { useHeatingApi } from '../api/useHeatingApi';
import { ZoneSelector } from './ZoneSelector';
import { Plus, Pencil, Save, X, Calendar, User, Copy, ClipboardCheck, ClipboardPaste, Clock, RefreshCw, Cloud, Cpu, Trash2 } from 'lucide-react';
import { produce } from 'immer';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

// --- Constants ---
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TOTAL_DAY_MINUTES = 24 * 60;

// --- Color & Style Helpers ---
const DEFAULT_TEMP_COLORS: { maxTemp?: number; color: string }[] = [
  { maxTemp: 5,  color: '#94a3b8' },
  { maxTemp: 14, color: '#2563eb' },
  { maxTemp: 16, color: '#0891b2' },
  { maxTemp: 18, color: '#0d9488' },
  { maxTemp: 20, color: '#059669' },
  { maxTemp: 22, color: '#d97706' },
  { maxTemp: 23, color: '#ea580c' },
  { maxTemp: 25, color: '#dc2626' },
  {              color: '#9f1239' },
];

const getTempColor = (temp: number, palette?: { maxTemp?: number; color: string }[]): string => {
  const colors = palette ?? DEFAULT_TEMP_COLORS;
  for (const entry of colors) {
    if (entry.maxTemp === undefined || temp <= entry.maxTemp) return entry.color;
  }
  return colors[colors.length - 1]?.color ?? '#94a3b8';
};

// Returns black or white depending on which contrasts better against the given hex background colour.
const getContrastColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#334155' : '#ffffff';
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
    // For DHW: if all blocks are uniformly ON, no value changes occur so sps is empty.
    // An empty switchpoints list means "all OFF" to the system, so emit an explicit
    // 00:00 → On entry to preserve a full-day ON state.
    if (isDhw && sps.length === 0 && blocks.length > 0 && blocks[0] === 1) {
        sps.push({ timeOfDay: '00:00', state: 'On' });
    }
    return sps;
};

// --- Internal Components ---

interface EditPopoverProps {
  anchor: HTMLElement | null;
  initialTemp: number;
  startTime: string;
  endTime: string;
  isDhw?: boolean;
  isNewSlot?: boolean;
  onSave: (newTemp: number, newStartTime: string, newEndTime: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onAddSlot: (newStart: string, newEnd: string, newTemp: number) => void;
}

const EditPopover: React.FC<EditPopoverProps> = ({ anchor, initialTemp, startTime, endTime, isDhw, isNewSlot, onSave, onCancel, onDelete, onAddSlot }) => {
  const [temp, setTemp] = useState(isDhw && (isNewSlot || (initialTemp !== 0 && initialTemp !== 1)) ? 1 : initialTemp);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);
  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchor },
    placement: 'top',
    middleware: [offset(10), shift()],
  });

  const norm = (t: string) => t === '24:00' ? '23:59' : t;
  const timesChanged = start !== startTime || norm(end) !== norm(endTime);
  const hasValidTimes = timeToMinutes(start) < timeToMinutes(end);
  const tempChanged = isDhw || temp !== initialTemp;
  const canApply = !isNewSlot;
  const canAddSlot = hasValidTimes && (isNewSlot || timesChanged) && (isNewSlot || tempChanged);
  const showTempHint = isNewSlot && !isDhw && timesChanged && !tempChanged;

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-4 rounded-2xl shadow-2xl z-50 border border-slate-100 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Start Time</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-100 dark:bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200" />

          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">End Time</label>
          <input type="time" value={end === '24:00' ? '23:59' : end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-100 dark:bg-slate-700 rounded p-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200" />

          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{isDhw ? 'State' : 'Target Temp'}</label>
          {isDhw ? (
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded p-1">
              <button
                onClick={() => setTemp(1)}
                className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${temp === 1 ? 'bg-indigo-600 text-white' : 'text-slate-400 dark:text-slate-500'}`}
              >
                ON
              </button>
              <button
                onClick={() => setTemp(0)}
                className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-colors ${temp === 0 ? 'bg-slate-400 dark:bg-slate-500 text-white' : 'text-slate-400 dark:text-slate-500'}`}
              >
                OFF
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" value={temp} step="0.5" onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-100 dark:bg-slate-700 rounded p-1 text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200" />
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">°C</span>
            </div>
          )}
        </div>
        {showTempHint && (
          <p className="text-[10px] text-amber-500 font-bold mb-3 -mt-1">Change temperature to create a distinct new slot</p>
        )}
        <div className="flex justify-between gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="flex gap-2">
            {!isNewSlot && <button onClick={onDelete} className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1">
                <Trash2 size={12}/> Delete
            </button>}
            <button onClick={() => onAddSlot(start, end, temp)} disabled={!canAddSlot} className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 ${canAddSlot ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50' : 'bg-slate-50 dark:bg-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}>
                <Plus size={12}/> Add slot
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-xs hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={() => onSave(temp, start, end)} disabled={!canApply} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${canApply ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}>Apply</button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
};

const EditBottomSheet: React.FC<EditPopoverProps> = ({ initialTemp, startTime, endTime, isDhw, isNewSlot, onSave, onCancel, onDelete, onAddSlot }) => {
  const [temp, setTemp] = useState(isDhw && (isNewSlot || (initialTemp !== 0 && initialTemp !== 1)) ? 1 : initialTemp);
  const [start, setStart] = useState(startTime);
  const [end, setEnd] = useState(endTime);

  const norm = (t: string) => t === '24:00' ? '23:59' : t;
  const timesChanged = start !== startTime || norm(end) !== norm(endTime);
  const hasValidTimes = timeToMinutes(start) < timeToMinutes(end);
  const tempChanged = isDhw || temp !== initialTemp;
  const canApply = !isNewSlot;
  const canAddSlot = hasValidTimes && (isNewSlot || timesChanged) && (isNewSlot || tempChanged);
  const showTempHint = isNewSlot && !isDhw && timesChanged && !tempChanged;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-600 rounded-full mx-auto mb-6" />
        <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mb-5">{isNewSlot ? 'Add New Slot' : 'Edit Slot'}</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <label className="text-sm font-bold text-slate-500 dark:text-slate-400 self-center">Start Time</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-3 text-base outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-bold" />

          <label className="text-sm font-bold text-slate-500 dark:text-slate-400 self-center">End Time</label>
          <input type="time" value={end === '24:00' ? '23:59' : end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-3 text-base outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-bold" />

          <label className="text-sm font-bold text-slate-500 dark:text-slate-400 self-center">{isDhw ? 'State' : 'Target Temp'}</label>
          {isDhw ? (
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
              <button onClick={() => setTemp(1)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${temp === 1 ? 'bg-indigo-600 text-white' : 'text-slate-400 dark:text-slate-500'}`}>ON</button>
              <button onClick={() => setTemp(0)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${temp === 0 ? 'bg-slate-600 text-white' : 'text-slate-400 dark:text-slate-500'}`}>OFF</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" value={temp} step="0.5" onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-3 text-base w-full outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-bold" />
              <span className="text-sm font-bold text-slate-400 dark:text-slate-500">°C</span>
            </div>
          )}
        </div>
        {showTempHint && (
          <p className="text-xs text-amber-500 font-bold mb-4">Change temperature to create a distinct new slot</p>
        )}
        <div className="flex gap-3">
          <div className="flex gap-2">
            {!isNewSlot && <button onClick={onDelete} className="px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2">
              <Trash2 size={16} /> Delete
            </button>}
            <button onClick={() => onAddSlot(start, end, temp)} disabled={!canAddSlot} className={`px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${canAddSlot ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50' : 'bg-slate-50 dark:bg-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}>
              <Plus size={16} /> Add slot
            </button>
          </div>
          <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Cancel</button>
          <button onClick={() => onSave(temp, start, end)} disabled={!canApply} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${canApply ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}>Apply</button>
        </div>
      </div>
    </>
  );
};

type ViewMode = 'zone' | 'day';

export const Scheduler: React.FC = () => {
  const { schedules, zones, dhw, setSchedules, isDirty, loading, selectedZoneId, setSelectedZoneId, provider, failedSchedules, uiConfig } = useHeatingStore();
  const { saveAllSchedules, fetchScheduleForZone, fetchAllSchedulesSequentially, selectProvider } = useHeatingApi();
  
  const resolution = uiConfig?.timeResolution || 10;
  const totalBlocks = TOTAL_DAY_MINUTES / resolution;

  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  const [editingSlot, setEditingSlot] = useState<{ day: string; element: HTMLElement; zoneId: string } | null>(null);
  const [clipboard, setClipboard] = useState<any[] | null>(null);
  const [clipboardSource, setClipboardSource] = useState<string | null>(null);
  const [showProviderPopup, setShowProviderPopup] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<any | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Record<string, number>>({});
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [zoomLevel, setZoomLevel] = useState(() => window.innerWidth < 640 ? 2 : 1);
  const [selectedSlot, setSelectedSlot] = useState<{
    key: string; day: string; zoneId: string; element: HTMLElement; relX: number;
    startTime: string; endTime: string; val: number;
  } | null>(null);
  const [, setTick] = useState(0);


  const handleZoneRefresh = async (zoneId: string) => {
    const now = Date.now();
    const lastTime = lastRefreshTime[zoneId] || 0;
    const isForce = (now - lastTime) < 20000;
    
    await fetchScheduleForZone(zoneId, false, isForce);
    setLastRefreshTime(prev => ({ ...prev, [zoneId]: now }));
  };

  useEffect(() => {
    if (viewMode === 'zone' && zones.length > 0 && !selectedZoneId) {
        const savedId = localStorage.getItem('evoWeb:lastZoneId');
        const restored = savedId ? zones.find(z => z.zoneId === savedId) : null;
        setSelectedZoneId((restored ?? zones[0]).zoneId);
    }
  }, [viewMode, zones, selectedZoneId, setSelectedZoneId]);

  useEffect(() => {
    if (selectedZoneId && zones.length > 0 && !loading && !failedSchedules.has(selectedZoneId)) {
        const hasSchedule = !!schedules[selectedZoneId];
        const fetchedAt = schedules[selectedZoneId]?.fetchedAt;
        const thresholdMs = (uiConfig?.scheduleStaleThresholdDays ?? 7) * 24 * 60 * 60 * 1000;
        // Only auto-refresh if we know the age and it exceeds the threshold.
        // No fetchedAt means data came from retained MQTT messages — treat as present but unaged,
        // so no radio request is made unless the user explicitly requests a refresh.
        const isStale = !!fetchedAt && (Date.now() - new Date(fetchedAt).getTime()) > thresholdMs;
        if (!hasSchedule || isStale) {
            fetchScheduleForZone(selectedZoneId, !hasSchedule, isStale && hasSchedule);
        }
    }
  }, [selectedZoneId, zones, schedules, loading, fetchScheduleForZone, failedSchedules, uiConfig]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedSlot(null); setEditingSlot(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const { refs, floatingStyles } = useFloating({
    open: showProviderPopup,
    onOpenChange: setShowProviderPopup,
    placement: 'bottom-start',
    middleware: [offset(10), shift()],
  });

  const { refs: toolbarRefs, floatingStyles: toolbarFloatingStyles } = useFloating({
    placement: 'top',
    middleware: [offset(-12), shift({ padding: 4 })],
  });

  useEffect(() => {
    toolbarRefs.setReference(selectedSlot?.element ?? null);
  }, [selectedSlot]);

  useEffect(() => {
    if (!selectedSlot) return;
    const handler = (e: MouseEvent) => {
      if (!toolbarRefs.floating.current?.contains(e.target as Node)) {
        setSelectedSlot(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedSlot, toolbarRefs.floating]);

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
    setSelectedSlot(null);
    setEditingSlot({ day, zoneId, element });
  };

  const handleSplitDirect = (day: string, zoneId: string, element: HTMLElement, relX: number) => {
    const startMins = timeToMinutes(element.dataset.startTime!);
    const endMins = timeToMinutes(element.dataset.endTime!);
    const rangeMins = endMins - startMins;
    if (rangeMins < resolution * 2) return;
    const rawSplit = startMins + rangeMins * relX;
    const splitMins = Math.round(rawSplit / resolution) * resolution;
    const clampedSplit = Math.max(startMins + resolution, Math.min(endMins - resolution, splitMins));
    if (clampedSplit <= startMins || clampedSplit >= endMins) return;
    const isDhwZone = zoneId === dhw?.dhwId;
    updateScheduleBlocks(day, zoneId, (blocks) => {
      const splitBlock = clampedSplit / resolution;
      const endBlock = endMins / resolution;
      const originalTemp = blocks[splitBlock - 1];
      let newTemp: number;
      if (isDhwZone) {
        // DHW: flip state — OFF→ON adds a heating period, ON→OFF carves one out
        newTemp = originalTemp === 1 ? 0 : 1;
      } else {
        const defaultTemp = uiConfig?.defaultTemp ?? 20;
        newTemp = originalTemp !== defaultTemp ? defaultTemp : Math.max(0, defaultTemp - 0.5);
      }
      for (let i = splitBlock; i < endBlock; i++) blocks[i] = newTemp;
    });
    setSelectedSlot(null);
  };

  const handleDeleteDirect = (day: string, zoneId: string, element: HTMLElement) => {
    const startMins = timeToMinutes(element.dataset.startTime!);
    const endMins = timeToMinutes(element.dataset.endTime!);
    updateScheduleBlocks(day, zoneId, (blocks) => {
      const startBlock = startMins / resolution;
      const endBlock = endMins / resolution;
      const fillerTemp = startBlock > 0 ? blocks[startBlock - 1] : blocks[totalBlocks - 1];
      for (let i = startBlock; i < endBlock; i++) blocks[i] = fillerTemp;
    });
    setSelectedSlot(null);
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
        const startBlock = Math.round(newStartMins / resolution);
        const endBlock = Math.round(newEndMins / resolution);
        for (let i = startBlock; i < endBlock; i++) {
            blocks[i % totalBlocks] = newTemp;
        }
    });
    setEditingSlot(null);
    setSelectedSlot(null);
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
    setSelectedSlot(null);
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
        <div className="w-10 sm:w-24 pr-1 sm:pr-2 text-right opacity-0">Time</div>
        <div className="flex-1 h-6 relative w-full flex items-end">
          {markers.map((hour) => {
            const left = (hour / 24) * 100;
            return (
              <div key={hour} style={{ left: `${left}%` }} className="absolute flex flex-col items-center -translate-x-1/2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-600">{hour.toString().padStart(2, '0')}:00</span>
                <div className="h-1 w-[1px] bg-slate-200 dark:bg-slate-700 mt-1" />
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block w-16 opacity-0" />
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
            const color = isDhw ? (seg.val === 1 ? (uiConfig?.dhwColors?.on ?? '#6366f1') : (uiConfig?.dhwColors?.off ?? '#e2e8f0')) : getTempColor(seg.val, uiConfig?.tempColors);
            const labelText = isDhw ? (seg.val === 1 ? 'ON' : 'OFF') : `${seg.val.toFixed(1)}°`;

            const slotKey = `${dayName}-${zoneId}-${i}`;
            const isSelected = selectedSlot?.key === slotKey;
            const textColor = getContrastColor(color);
            slots.push(
                <div
                    key={i}
                    style={{ width: `${width}%`, backgroundColor: color, color: textColor }}
                    className={`h-full border-r border-white/10 flex flex-col items-center justify-center font-bold cursor-pointer hover:brightness-90 transition-all select-none relative group/slot flex-shrink-0 ${isSelected ? 'ring-2 ring-inset brightness-90 z-10' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const relX = (e.clientX - rect.left) / rect.width;
                        setSelectedSlot({ key: slotKey, day: dayName, zoneId, element: e.currentTarget, relX, startTime: startTimeText, endTime: endTimeText, val: seg.val });
                    }}
                    onDoubleClick={(e) => { e.stopPropagation(); handleSlotDoubleClick(dayName, zoneId, e.currentTarget); }}
                    title={`${rangeText} | ${isDhw ? (seg.val === 1 ? 'ON' : 'OFF') : seg.val + '°C'}`}
                    data-start-time={startTimeText}
                    data-end-time={endTimeText}
                    data-val={seg.val}
                >
                    <span className="text-[10px]">{labelText}</span>
                    {width > 8 && (
                        <span className="absolute top-0.5 left-1 text-[7px] opacity-40 group-hover/slot:opacity-80 transition-opacity uppercase tracking-tighter">
                            {startTimeText}
                        </span>
                    )}
                </div>
            );
        });
    }

    const isSource = clipboardSource === label;

    return (
      <div key={`${zoneId}-${dayName}`} className="flex items-center group gap-1 sm:gap-2 mb-1 last:mb-0">
        <div className="w-10 sm:w-24 pr-1 sm:pr-2 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-tight">{label}</div>
        <div className="flex-1 h-10 bg-slate-50 dark:bg-slate-900/50 rounded-xl overflow-hidden flex shadow-inner border border-slate-100 dark:border-slate-700 relative" onClick={() => setSelectedSlot(null)}>
          {hasData ? slots : (
              <div
                  className="flex-1 flex items-center justify-center gap-2 text-slate-300 dark:text-slate-600 hover:text-indigo-400 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 cursor-pointer transition-colors"
                  title="Click to add first slot"
                  onClick={(e) => {
                      e.stopPropagation();
                      const defaultTemp = uiConfig?.defaultTemp ?? 20;
                      setSchedules(produce(schedules, draft => {
                          if (!draft[zoneId]) {
                              const zoneName = zones.find(z => z.zoneId === zoneId)?.name || zoneId;
                              draft[zoneId] = { name: zoneName, schedule: DAYS.map(d => ({ dayOfWeek: d, switchpoints: [] })) } as any;
                          }
                          const daySched = draft[zoneId]?.schedule.find((s: any) => s.dayOfWeek === dayName);
                          if (daySched) {
                              daySched.switchpoints = [isDhw ? { timeOfDay: '00:00', state: 'On' } : { timeOfDay: '00:00', heatSetpoint: defaultTemp }] as any;
                          }
                      }));
                  }}
              >
                  <Plus size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Add first slot</span>
              </div>
          )}
        </div>
        <div className="flex w-16 items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity pr-2">
            {hasData && (
                <>
                    <button onClick={() => handleCopy(dayName, zoneId, label)} className={`p-2 lg:p-1.5 rounded-lg transition-colors ${isSource ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}><Copy size={16} className="lg:w-[14px] lg:h-[14px]" /></button>
                    {clipboard && (isSource ?
                        <button onClick={handlePasteToAll} className="p-2 lg:p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-sm"><ClipboardPaste size={16} className="lg:w-[14px] lg:h-[14px]" /></button> :
                        <button onClick={() => handlePaste(dayName, zoneId)} className="p-2 lg:p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-700 dark:hover:text-indigo-300"><ClipboardCheck size={16} className="lg:w-[14px] lg:h-[14px]" /></button>
                    )}
                </>
            )}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col min-h-[600px] p-2 md:p-8">
      <header className="mb-4 flex items-center gap-2 sm:gap-3">
        <div
          ref={refs.setReference}
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md cursor-pointer transition-colors flex-shrink-0 ${(['online', 'authenticated'].includes((provider?.gatewayStatus ?? '').toLowerCase())) ? 'bg-emerald-500 shadow-emerald-200 hover:bg-emerald-400' : 'bg-rose-500 shadow-rose-200 hover:bg-rose-400'}`}
        >
          {provider?.name === 'MQTT' ? <Cpu size={18}/> : <Cloud size={18}/>}
        </div>

        {showProviderPopup && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-1 rounded-2xl shadow-2xl z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 px-3 py-2 mb-1 tracking-widest border-b border-slate-50 dark:border-slate-700">Select Provider</div>
              <button onClick={() => selectProvider('honeywell')} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">
                <Cloud size={16} className="text-sky-500" /> Cloud (Honeywell)
              </button>
              <button onClick={() => selectProvider('mqtt')} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">
                <Cpu size={16} className="text-emerald-500" /> Local (MQTT)
              </button>
            </div>
          </FloatingPortal>
        )}

        {viewMode === 'zone' && <div className="hidden sm:block w-px h-6 bg-slate-100 dark:bg-slate-700 flex-shrink-0" />}

        {viewMode === 'zone' && (
          <div className="w-28 sm:w-48 flex-shrink-0">
            <ZoneSelector selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} compact />
          </div>
        )}

        {viewMode === 'zone' && selectedZoneId && (() => {
          const zoneStatus = zones.find(z => z.zoneId === selectedZoneId);
          if (!zoneStatus) return null;
          const modeNorm = zoneStatus.setpointMode.toLowerCase().replace(/[\s_]/g, '');
          const isOverride = !modeNorm.startsWith('follow') && modeNorm !== 'unknown' && modeNorm !== '';
          const modeLabel = isOverride
            ? `Override${zoneStatus.until ? ` until ${new Date(zoneStatus.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
            : 'Schedule';
          return (
            <div className="hidden sm:flex items-end gap-2 flex-shrink-0">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Current</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg tabular-nums">{zoneStatus.temperature != null ? zoneStatus.temperature.toFixed(1) : '--'}°</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Target</span>
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-lg tabular-nums">{zoneStatus.setpoint != null ? zoneStatus.setpoint.toFixed(1) : '--'}°</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Mode</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${isOverride ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30' : 'text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700'}`}>{modeLabel}</span>
              </div>
            </div>
          );
        })()}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {viewMode === 'zone' && selectedZoneId && (() => {
            const fetchedAt = schedules[selectedZoneId]?.fetchedAt;
            const thresholdDays = uiConfig?.scheduleStaleThresholdDays ?? 7;
            if (!fetchedAt) return <span className="text-[10px] font-black uppercase text-slate-300 dark:text-slate-600 hidden sm:block">Schedule: unknown</span>;
            const ageMs = Date.now() - new Date(fetchedAt).getTime();
            const ageHours = ageMs / 3600000;
            const ageDays = ageHours / 24;
            const ageMins = ageMs / 60000;
            const label = ageMins < 1 ? 'Just now' : ageHours < 1 ? `${Math.round(ageMins)}m ago` : ageHours < 24 ? `${Math.round(ageHours)}h ago` : `${Math.round(ageDays)}d ago`;
            const color = ageDays > thresholdDays ? 'text-red-400' : ageDays > 1 ? 'text-amber-400' : 'text-emerald-500';
            return <span className={`text-[10px] font-black uppercase ${color} hidden sm:block`} title={new Date(fetchedAt).toLocaleString()}>Synced: {label}</span>;
          })()}
          {viewMode === 'zone' && selectedZoneId && (
            <button onClick={() => handleZoneRefresh(selectedZoneId)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-black transition-all" title="Refresh zone schedule (click twice within 20s to force from controller)">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
          {viewMode === 'day' && (
            <button onClick={fetchAllSchedulesSequentially} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-black transition-all" title="Reload schedules for all zones from the controller">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh All</span>
            </button>
          )}
          <button onClick={() => saveAllSchedules(schedules)} disabled={!isDirty} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${isDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed'}`} title="Save all pending schedule changes to the controller">
            <Save size={14} /><span className="hidden sm:inline">Save</span>
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
            <button onClick={() => setViewMode('zone')} className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'zone' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><User size={13} className="inline sm:mr-1"/><span className="hidden sm:inline">Zones</span></button>
            <button onClick={() => setViewMode('day')} className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'day' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}><Calendar size={13} className="inline sm:mr-1"/><span className="hidden sm:inline">Days</span></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {viewMode === 'day' && (
          <div className="flex items-center gap-2 mb-4 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-2xl w-fit">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedDay === day ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md shadow-indigo-100 dark:shadow-indigo-900/50' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >{day.substring(0, 3)}</button>
            ))}
          </div>
        )}

        <div className="bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl p-1 md:p-6 border border-slate-100 dark:border-slate-700">
          <div className="overflow-x-auto">
            <div style={{ width: zoomLevel === 1 ? '100%' : `${zoomLevel * 100}%`, minWidth: '100%' }}>
              {renderTimelineHeader()}
              <div className="space-y-1">
                {viewMode === 'zone' ? (
                  selectedZoneId ? DAYS.map(day => renderRow(day.substring(0, 3), day, selectedZoneId)) : <div className="py-20 text-center text-slate-400 dark:text-slate-500 font-bold">Select a zone to view schedule</div>
                ) : (
                  [...zones, ...(dhw ? [{ zoneId: dhw.dhwId, name: 'Hot Water' }] : [])].map(z => renderRow(z.name, selectedDay, z.zoneId))
                )}
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'zone' && selectedZoneId && (() => {
          const zoneStatus = zones.find(z => z.zoneId === selectedZoneId);
          if (!zoneStatus) return null;
          const modeNorm = zoneStatus.setpointMode.toLowerCase().replace(/[\s_]/g, '');
          const isOverride = !modeNorm.startsWith('follow') && modeNorm !== 'unknown' && modeNorm !== '';
          const modeLabel = isOverride
            ? `Override${zoneStatus.until ? ` until ${new Date(zoneStatus.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
            : 'Schedule';
          return (
            <div className="sm:hidden flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Current</span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg tabular-nums">{zoneStatus.temperature != null ? zoneStatus.temperature.toFixed(1) : '--'}°</span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">→</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Target</span>
              <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-lg tabular-nums">{zoneStatus.setpoint != null ? zoneStatus.setpoint.toFixed(1) : '--'}°</span>
              <span className="text-slate-200 dark:text-slate-700 mx-0.5">·</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Mode</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${isOverride ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30' : 'text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700'}`}>{modeLabel}</span>
            </div>
          );
        })()}

        {clipboard && (
            <div className="mt-8 flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-2xl text-indigo-600 dark:text-indigo-300 animate-in slide-in-from-bottom-2 duration-300">
                <ClipboardCheck size={18} />
                <span className="text-xs font-bold">Day schedule copied from <span className="font-black underline">{clipboardSource}</span>. Ready to paste!</span>
                <button onClick={() => setClipboard(null)} className="ml-auto text-indigo-300 dark:text-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400"><X size={16}/></button>
            </div>
        )}
      </main>

      <footer className="mt-3 md:mt-8 pt-3 md:pt-6 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-4">
          <div className="flex sm:hidden items-center gap-2">
            <Clock size={14}/>
            <span className="text-[10px] font-black uppercase tracking-widest">Resolution: {resolution} mins</span>
          </div>
          <div className="flex sm:hidden items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel(l => Math.max(1, l - 1))}
              disabled={zoomLevel === 1}
              className="w-6 h-6 flex items-center justify-center rounded text-xs font-black text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Zoom out"
            >−</button>
            <span className="text-[10px] font-black uppercase tracking-widest px-1 min-w-[2rem] text-center">{zoomLevel}×</span>
            <button
              onClick={() => setZoomLevel(l => Math.min(4, l + 1))}
              disabled={zoomLevel === 4}
              className="w-6 h-6 flex items-center justify-center rounded text-xs font-black text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-600 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Zoom in"
            >+</button>
          </div>
        </div>
      </footer>

      {editingSlot && (() => {
        const isDhwSlot = editingSlot.zoneId === dhw?.dhwId;
        const editingDaySched = schedules[editingSlot.zoneId]?.schedule.find(s => s.dayOfWeek === editingSlot.day);
        // isNewSlot: DHW day with no ON periods (empty, or only Off switchpoints)
        const isNewSlot = isDhwSlot && (!editingDaySched || editingDaySched.switchpoints.every((sp: any) => sp.state !== 'On'));
        const sharedProps = {
          anchor: editingSlot.element,
          initialTemp: parseFloat(editingSlot.element.dataset.val || '20'),
          startTime: editingSlot.element.dataset.startTime!,
          endTime: editingSlot.element.dataset.endTime!,
          isDhw: isDhwSlot,
          isNewSlot,
          onSave: handleUpdate,
          onCancel: () => { setEditingSlot(null); setSelectedSlot(null); },
          onDelete: handleDelete,
          onAddSlot: (newStart: string, newEnd: string, newTemp: number) => {
            const { day, zoneId } = editingSlot;
            updateScheduleBlocks(day, zoneId, (blocks) => {
              const s = Math.round(timeToMinutes(newStart) / resolution);
              const e = Math.round(timeToMinutes(newEnd) / resolution) || totalBlocks;
              for (let i = s; i < e; i++) blocks[i % totalBlocks] = newTemp;
            });
            setEditingSlot(null);
          },
        };
        return isMobile ? <EditBottomSheet {...sharedProps} /> : <EditPopover {...sharedProps} />;
      })()}

      {selectedSlot && (
        <FloatingPortal>
          <div
            ref={toolbarRefs.setFloating}
            style={toolbarFloatingStyles}
            className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-1.5 z-50"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedSlot) { setEditingSlot({ day: selectedSlot.day, zoneId: selectedSlot.zoneId, element: selectedSlot.element }); setSelectedSlot(null); }
              }}
              className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl transition-colors"
              title="Edit slot"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedSlot) handleSplitDirect(selectedSlot.day, selectedSlot.zoneId, selectedSlot.element, selectedSlot.relX);
              }}
              className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors"
              title="Add new slot here"
            >
              <Plus size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedSlot) handleDeleteDirect(selectedSlot.day, selectedSlot.zoneId, selectedSlot.element);
              }}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl transition-colors"
              title="Delete slot"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </FloatingPortal>
      )}
    </section>
  );
};
