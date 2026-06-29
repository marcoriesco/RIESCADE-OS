import React, { useRef, useEffect } from 'react';
import { X, Minus, Square } from 'lucide-react';

interface VirtualWindowProps {
  id: string;
  type: 'system' | 'tool';
  appId: string;
  title: string;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  active: boolean;
  headerLeft?: React.ReactNode;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onUpdateBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  children: React.ReactNode;
}

export default function VirtualWindow({
  id,
  type,
  appId,
  title,
  initialX,
  initialY,
  initialWidth,
  initialHeight,
  isMinimized,
  isMaximized,
  zIndex,
  active,
  headerLeft,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onUpdateBounds,
  children
}: VirtualWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  
  // Local ref tracking window bounds to prevent react renders during drag/resize
  const boundsRef = useRef({
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight
  });

  // Keep DOM styles updated when props change from the parent state (maximize toggling or settings load)
  useEffect(() => {
    if (!windowRef.current) return;

    boundsRef.current = {
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight
    };

    if (isMinimized) {
      const targetX = window.innerWidth / 2 - initialWidth / 2;
      windowRef.current.style.transform = `translate3d(${targetX}px, ${window.innerHeight}px, 0px) scale(0.05)`;
      windowRef.current.style.opacity = '0';
      windowRef.current.style.pointerEvents = 'none';
      return;
    }

    windowRef.current.style.opacity = '1';
    windowRef.current.style.pointerEvents = 'auto';

    if (isMaximized) {
      windowRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
      windowRef.current.style.width = '100%';
      windowRef.current.style.height = '100%';
    } else {
      windowRef.current.style.transform = `translate3d(${initialX}px, ${initialY}px, 0px)`;
      windowRef.current.style.width = `${initialWidth}px`;
      windowRef.current.style.height = `${initialHeight}px`;
    }
  }, [initialX, initialY, initialWidth, initialHeight, isMaximized, isMinimized]);

  const handleMouseDown = () => {
    if (!active) {
      onFocus();
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return; // Disallow dragging if maximized
    if (e.button !== 0) return; // Only drag with left click

    // Don't drag if clicking interactive controls (buttons, menus, inputs)
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('.no-drag')
    ) {
      return;
    }

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = boundsRef.current.x;
    const startPosY = boundsRef.current.y;

    const el = windowRef.current;
    if (el) {
      el.classList.add('dragging');
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newX = startPosX + dx;
      let newY = startPosY + dy;

      // Restrict boundary: keep header in view so the window is never lost
      const minVisibleWidth = 120;
      const minVisibleHeight = 40;
      newX = Math.max(-boundsRef.current.width + minVisibleWidth, Math.min(window.innerWidth - minVisibleWidth, newX));
      newY = Math.max(0, Math.min(window.innerHeight - minVisibleHeight, newY));

      boundsRef.current.x = newX;
      boundsRef.current.y = newY;

      if (el) {
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (el) {
        el.classList.remove('dragging');
      }

      // Propagate final coordinate values to the parent React state exactly once
      onUpdateBounds({
        x: boundsRef.current.x,
        y: boundsRef.current.y,
        width: boundsRef.current.width,
        height: boundsRef.current.height
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent, direction: 'r' | 'b' | 'se') => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = boundsRef.current.width;
    const startHeight = boundsRef.current.height;

    const el = windowRef.current;
    if (el) {
      el.classList.add('dragging');
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction === 'r' || direction === 'se') {
        newWidth = Math.max(500, startWidth + dx);
      }
      if (direction === 'b' || direction === 'se') {
        newHeight = Math.max(400, startHeight + dy);
      }

      boundsRef.current.width = newWidth;
      boundsRef.current.height = newHeight;

      if (el) {
        if (direction === 'r' || direction === 'se') {
          el.style.width = `${newWidth}px`;
        }
        if (direction === 'b' || direction === 'se') {
          el.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (el) {
        el.classList.remove('dragging');
      }

      onUpdateBounds({
        x: boundsRef.current.x,
        y: boundsRef.current.y,
        width: boundsRef.current.width,
        height: boundsRef.current.height
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={windowRef}
      onMouseDown={handleMouseDown}
      className={`window-frame absolute border border-white/10 shadow-2xl flex flex-col overflow-hidden glass-strong ${
        isMaximized ? 'rounded-none border-none' : 'rounded-2xl'
      } ${
        active ? 'active-window border-accent/40 ring-1 ring-accent/25' : 'inactive-window opacity-95'
      } ${isMinimized ? 'minimized' : ''}`}
      style={{
        zIndex,
        top: 0,
        left: 0
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleDragStart}
        onDoubleClick={onMaximize}
        className="h-10 px-4 bg-black/40 border-b border-white/5 flex items-center justify-between select-none shrink-0 cursor-move"
      >
        <div className="flex items-center gap-2 w-full min-w-0 pr-4">
          {headerLeft || (
            <span className="text-xs font-bold text-white/95 truncate tracking-wide">{title}</span>
          )}
        </div>

        {/* Window control buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="win-control-btn w-7 h-7 hover:bg-white/10 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            className="win-control-btn w-7 h-7 hover:bg-white/10 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition cursor-pointer"
            title={isMaximized ? "Restaurar" : "Maximizar"}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="win-control-btn w-7 h-7 hover:bg-red-500/80 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 min-h-0 relative z-0">
        {children}
      </div>

      {/* Resize Handles */}
      {!isMaximized && (
        <>
          <div
            onMouseDown={(e) => handleResizeStart(e, 'r')}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-50 hover:bg-accent/10 transition-colors"
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'b')}
            className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize z-50 hover:bg-accent/10 transition-colors"
          />
          <div
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize z-50 bg-transparent flex items-end justify-end p-0.5"
          >
            <div className="w-1.5 h-1.5 border-r border-b border-white/30 rounded-br-sm hover:border-accent" />
          </div>
        </>
      )}
    </div>
  );
}
