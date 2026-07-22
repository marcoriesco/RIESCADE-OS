import React, { useRef, useEffect, useCallback } from 'react';
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
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onUpdateBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  children: React.ReactNode;
}

function VirtualWindow({
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

  const handleMouseDown = useCallback(() => {
    if (!active) {
      onFocus(id);
    }
  }, [active, onFocus, id]);

  const handleMinimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMinimize(id);
  }, [onMinimize, id]);

  const handleMaximize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMaximize(id);
  }, [onMaximize, id]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(id);
  }, [onClose, id]);

  const handleMaximizeDoubleClick = useCallback(() => {
    onMaximize(id);
  }, [onMaximize, id]);

  const snapPreviewRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.MouseEvent) => {
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

    let startX = e.clientX;
    let startY = e.clientY;
    let startPosX = boundsRef.current.x;
    let startPosY = boundsRef.current.y;

    const el = windowRef.current;
    if (el) {
      el.classList.add('dragging');
    }

    // Drag-to-unmaximize if dragging maximized window
    if (isMaximized) {
      const ratio = e.clientX / window.innerWidth;
      const normalWidth = initialWidth;
      const normalHeight = initialHeight;
      
      let newX = e.clientX - normalWidth * ratio;
      newX = Math.max(0, Math.min(window.innerWidth - normalWidth, newX));
      let newY = 0; // Align with top of screen

      boundsRef.current = {
        x: newX,
        y: newY,
        width: normalWidth,
        height: normalHeight
      };

      if (el) {
        el.style.width = `${normalWidth}px`;
        el.style.height = `${normalHeight}px`;
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
      }

      startPosX = newX;
      startPosY = newY;
      onMaximize(id); // Notify parent to set isMaximized: false
    }

    // Drag-to-unsnap if dragging a snapped window
    const isLeftSnapped = boundsRef.current.width === Math.floor(window.innerWidth / 2) && boundsRef.current.height === window.innerHeight - 56 && boundsRef.current.x === 0;
    const isRightSnapped = boundsRef.current.width === Math.floor(window.innerWidth / 2) && boundsRef.current.height === window.innerHeight - 56 && boundsRef.current.x === Math.floor(window.innerWidth / 2);

    if (isLeftSnapped || isRightSnapped) {
      const normalWidth = initialWidth;
      const normalHeight = initialHeight;
      
      let newX = e.clientX - normalWidth / 2;
      newX = Math.max(0, Math.min(window.innerWidth - normalWidth, newX));
      let newY = Math.max(0, e.clientY - 15);

      boundsRef.current = {
        x: newX,
        y: newY,
        width: normalWidth,
        height: normalHeight
      };

      if (el) {
        el.style.width = `${normalWidth}px`;
        el.style.height = `${normalHeight}px`;
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
      }

      startPosX = newX;
      startPosY = newY;
    }

    let currentSnapType: 'left' | 'right' | 'maximize' | null = null;
    let rafId: number | null = null;
    let lastMoveEvent: MouseEvent | null = null;

    const applyDragPosition = () => {
      rafId = null;
      if (!lastMoveEvent) return;
      const moveEvent = lastMoveEvent;

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

      // Aero Snap Preview check
      if (moveEvent.clientY <= 5) {
        currentSnapType = 'maximize';
      } else if (moveEvent.clientX <= 5) {
        currentSnapType = 'left';
      } else if (moveEvent.clientX >= window.innerWidth - 5) {
        currentSnapType = 'right';
      } else {
        currentSnapType = null;
      }

      const snapPreview = snapPreviewRef.current;
      if (snapPreview) {
        if (currentSnapType === 'left') {
          snapPreview.style.left = '0px';
          snapPreview.style.top = '0px';
          snapPreview.style.width = '50%';
          snapPreview.style.height = 'calc(100vh - 56px)';
          snapPreview.style.opacity = '1';
        } else if (currentSnapType === 'right') {
          snapPreview.style.left = '50%';
          snapPreview.style.top = '0px';
          snapPreview.style.width = '50%';
          snapPreview.style.height = 'calc(100vh - 56px)';
          snapPreview.style.opacity = '1';
        } else if (currentSnapType === 'maximize') {
          snapPreview.style.left = '0px';
          snapPreview.style.top = '0px';
          snapPreview.style.width = '100%';
          snapPreview.style.height = 'calc(100vh - 56px)';
          snapPreview.style.opacity = '1';
        } else {
          snapPreview.style.opacity = '0';
        }
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      lastMoveEvent = moveEvent;
      if (!rafId) {
        rafId = requestAnimationFrame(applyDragPosition);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (el) {
        el.classList.remove('dragging');
      }

      const snapPreview = snapPreviewRef.current;
      if (snapPreview) {
        snapPreview.style.opacity = '0';
      }

      if (currentSnapType === 'maximize') {
        onMaximize(id);
      } else if (currentSnapType === 'left') {
        const snappedWidth = Math.floor(window.innerWidth / 2);
        const snappedHeight = window.innerHeight - 56;
        boundsRef.current = {
          x: 0,
          y: 0,
          width: snappedWidth,
          height: snappedHeight
        };
        if (el) {
          el.style.width = `${snappedWidth}px`;
          el.style.height = `${snappedHeight}px`;
          el.style.transform = `translate3d(0px, 0px, 0px)`;
        }
        onUpdateBounds(id, boundsRef.current);
      } else if (currentSnapType === 'right') {
        const snappedWidth = Math.floor(window.innerWidth / 2);
        const snappedHeight = window.innerHeight - 56;
        const snappedX = Math.floor(window.innerWidth / 2);
        boundsRef.current = {
          x: snappedX,
          y: 0,
          width: snappedWidth,
          height: snappedHeight
        };
        if (el) {
          el.style.width = `${snappedWidth}px`;
          el.style.height = `${snappedHeight}px`;
          el.style.transform = `translate3d(${snappedX}px, 0px, 0px)`;
        }
        onUpdateBounds(id, boundsRef.current);
      } else {
        onUpdateBounds(id, {
          x: boundsRef.current.x,
          y: boundsRef.current.y,
          width: boundsRef.current.width,
          height: boundsRef.current.height
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (
    e: React.MouseEvent,
    direction: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  ) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = boundsRef.current.width;
    const startHeight = boundsRef.current.height;
    const startPosX = boundsRef.current.x;
    const startPosY = boundsRef.current.y;

    const el = windowRef.current;
    if (el) {
      el.classList.add('dragging', 'resizing');
    }

    let rafId: number | null = null;
    let lastMoveEvent: MouseEvent | null = null;

    const applyResizePosition = () => {
      rafId = null;
      if (!lastMoveEvent) return;
      const moveEvent = lastMoveEvent;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPosX;
      let newY = startPosY;

      if (direction.includes('e')) {
        newWidth = Math.max(500, startWidth + dx);
      } else if (direction.includes('w')) {
        const deltaX = Math.min(dx, startWidth - 500);
        newWidth = startWidth - deltaX;
        newX = startPosX + deltaX;
      }

      if (direction.includes('s')) {
        newHeight = Math.max(400, startHeight + dy);
      } else if (direction.includes('n')) {
        let deltaY = Math.min(dy, startHeight - 400);
        deltaY = Math.max(deltaY, -startPosY);
        newHeight = startHeight - deltaY;
        newY = startPosY + deltaY;
      }

      boundsRef.current = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      };

      if (el) {
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
        el.style.width = `${newWidth}px`;
        el.style.height = `${newHeight}px`;
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      lastMoveEvent = moveEvent;
      if (!rafId) {
        rafId = requestAnimationFrame(applyResizePosition);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (el) {
        el.classList.remove('dragging', 'resizing');
      }

      onUpdateBounds(id, {
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
    <>
      {/* Snap Preview Overlay */}
      <div
        ref={snapPreviewRef}
        className="fixed snap-preview opacity-0"
      />

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
          onDoubleClick={handleMaximizeDoubleClick}
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
              onClick={handleMinimize}
              className="win-control-btn w-7 h-7 hover:bg-white/10 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition cursor-pointer"
              title="Minimizar"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="win-control-btn w-7 h-7 hover:bg-white/10 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition cursor-pointer"
              title={isMaximized ? "Restaurar" : "Maximizar"}
            >
              <Square className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={handleClose}
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
            {/* Borders */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'n')}
              className="absolute top-0 left-1 right-1 h-1.5 cursor-ns-resize z-50 hover:bg-accent/10 transition-colors"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 's')}
              className="absolute bottom-0 left-1 right-1 h-1.5 cursor-ns-resize z-50 hover:bg-accent/10 transition-colors"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 'e')}
              className="absolute right-0 top-1 bottom-1 w-1.5 cursor-ew-resize z-50 hover:bg-accent/10 transition-colors"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 'w')}
              className="absolute left-0 top-1 bottom-1 w-1.5 cursor-ew-resize z-50 hover:bg-accent/10 transition-colors"
            />

            {/* Corners */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'nw')}
              className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-[51]"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 'ne')}
              className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-[51]"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 'sw')}
              className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-[51]"
            />
            <div
              onMouseDown={(e) => handleResizeStart(e, 'se')}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[51] bg-transparent flex items-end justify-end p-0.5"
            >
              <div className="w-1.5 h-1.5 border-r border-b border-white/30 rounded-br-sm hover:border-accent" />
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default React.memo(VirtualWindow);
