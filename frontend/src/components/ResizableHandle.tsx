import React from 'react';
import { useDraggable } from '@dnd-kit/core';

interface ResizableHandleProps {
  id: string;
}

export const ResizableHandle: React.FC<ResizableHandleProps> = ({ id }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute top-0 bottom-0 -right-1 w-2 cursor-col-resize z-10"
      onDoubleClick={(e) => e.stopPropagation()} // Prevent double-click on the handle
    />
  );
};
