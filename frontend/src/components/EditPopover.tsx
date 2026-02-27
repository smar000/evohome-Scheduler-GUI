import React, { useState } from 'react';
import { useFloating, FloatingPortal, offset, shift } from '@floating-ui/react';

interface EditPopoverProps {
  anchor: HTMLElement | null;
  initialTemp: number;
  startTime: string;
  endTime: string;
  onSave: (newTemp: number, newStartTime: string, newEndTime: string) => void;
  onCancel: () => void;
}

export const EditPopover: React.FC<EditPopoverProps> = ({ anchor, initialTemp, startTime, endTime, onSave, onCancel }) => {
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
      <div ref={refs.setFloating} style={floatingStyles} className="bg-slate-800 text-white p-4 rounded-lg shadow-2xl z-20">
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="popover-start-time" className="font-bold text-sm justify-self-end">Start:</label>
          <input id="popover-start-time" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-slate-700 rounded-md p-1 text-sm w-28" />

          <label htmlFor="popover-end-time" className="font-bold text-sm justify-self-end">End:</label>
          <input id="popover-end-time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-slate-700 rounded-md p-1 text-sm w-28" />
          
          <label htmlFor="popover-temp" className="font-bold text-sm justify-self-end">Temp:</label>
          <input id="popover-temp" type="number" value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="bg-slate-700 rounded-md p-1 text-sm w-16" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1 bg-slate-600 rounded-md text-sm hover:bg-slate-500">Cancel</button>
          <button onClick={() => onSave(temp, start, end)} className="px-3 py-1 bg-indigo-600 rounded-md text-sm font-bold hover:bg-indigo-500">OK</button>
        </div>
      </div>
    </FloatingPortal>
  );
};
