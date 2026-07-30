import React, { useRef, useEffect, useCallback } from 'react';
import { WindowChrome } from './WindowChrome';

interface VirtualWindowProps {
  id: string;
  type: 'system' | 'tool';
  appId: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  active: boolean;
  colorActiveBorder?: boolean;
  headerLeft?: React.ReactNode;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onUpdateBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  desktopAreas?: { x: number; y: number; width: number; height: number }[];
  children: React.ReactNode;
}

function VirtualWindow({
  id,
  type,
  appId,
  title,
  icon: IconComponent,
  initialX,
  initialY,
  initialWidth,
  initialHeight,
  isMinimized,
  isMaximized,
  zIndex,
  active,
  colorActiveBorder = true,
  headerLeft,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onUpdateBounds,
  desktopAreas,
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
  const restoreBoundsRef = useRef({
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
      const centerX = initialX + initialWidth / 2;
      const centerY = initialY + initialHeight / 2;
      const targetArea = desktopAreas?.find(area =>
        centerX >= area.x && centerX < area.x + area.width &&
        centerY >= area.y && centerY < area.y + area.height
      ) || desktopAreas?.[0];
      windowRef.current.style.transform = `translate3d(${targetArea?.x || 0}px, ${targetArea?.y || 0}px, 0px)`;
      windowRef.current.style.width = targetArea ? `${targetArea.width}px` : '100%';
      windowRef.current.style.height = targetArea ? `${targetArea.height}px` : '100%';
    } else {
      windowRef.current.style.transform = `translate3d(${initialX}px, ${initialY}px, 0px)`;
      windowRef.current.style.width = `${initialWidth}px`;
      windowRef.current.style.height = `${initialHeight}px`;
    }
  }, [initialX, initialY, initialWidth, initialHeight, isMaximized, isMinimized, desktopAreas]);

  useEffect(() => {
    const keepVisible = () => {
      if (isMaximized || isMinimized) return;
      const desktopWidth = window.innerWidth;
      const desktopHeight = Math.max(400, window.innerHeight - 56);
      const current = boundsRef.current;
      const next = {
        width: Math.min(Math.max(current.width, 500), desktopWidth),
        height: Math.min(Math.max(current.height, 400), desktopHeight),
        x: 0,
        y: 0
      };
      next.x = Math.max(-next.width + 120, Math.min(desktopWidth - 120, current.x));
      next.y = Math.max(0, Math.min(desktopHeight - 40, current.y));
      if (next.x === current.x && next.y === current.y && next.width === current.width && next.height === current.height) return;
      boundsRef.current = next;
      if (windowRef.current) {
        windowRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0px)`;
        windowRef.current.style.width = `${next.width}px`;
        windowRef.current.style.height = `${next.height}px`;
      }
      onUpdateBounds(id, next);
    };
    window.addEventListener('resize', keepVisible);
    return () => window.removeEventListener('resize', keepVisible);
  }, [id, isMaximized, isMinimized, onUpdateBounds]);

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

  const handleMaximizeDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"], .no-drag')) return;
    onMaximize(id);
  }, [onMaximize, id]);

  const snapPreviewRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only drag with left click

    // Don't drag if clicking interactive controls (buttons, menus, inputs)
    const target = e.target as HTMLElement;
    if (
      target.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"], .no-drag')
    ) {
      return;
    }

    e.preventDefault();

    let startX = e.clientX;
    let startY = e.clientY;
    let startPosX = boundsRef.current.x;
    let startPosY = boundsRef.current.y;
    const desktopHeight = Math.max(400, window.innerHeight - 56);
    const snappedWidth = Math.floor(window.innerWidth / 2);
    const isLeftSnapped = boundsRef.current.width === snappedWidth && boundsRef.current.height === desktopHeight && boundsRef.current.x === 0;
    const isRightSnapped = boundsRef.current.width === snappedWidth && boundsRef.current.height === desktopHeight && boundsRef.current.x === snappedWidth;

    if (!isMaximized && !isLeftSnapped && !isRightSnapped) {
      restoreBoundsRef.current = { ...boundsRef.current };
    }

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
    if (isLeftSnapped || isRightSnapped) {
      const normalWidth = Math.min(restoreBoundsRef.current.width, window.innerWidth);
      const normalHeight = Math.min(restoreBoundsRef.current.height, desktopHeight);
      
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
      newY = Math.max(0, Math.min(desktopHeight - minVisibleHeight, newY));

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
      window.removeEventListener('blur', handleMouseUp);
      
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
        const snappedHeight = desktopHeight;
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
        const snappedHeight = desktopHeight;
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
    window.addEventListener('blur', handleMouseUp);
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
        const availableWidth = Math.max(500, window.innerWidth - Math.max(0, startPosX));
        newWidth = Math.max(500, Math.min(availableWidth, startWidth + dx));
      } else if (direction.includes('w')) {
        const deltaX = Math.min(dx, startWidth - 500);
        newWidth = startWidth - deltaX;
        newX = startPosX + deltaX;
      }

      if (direction.includes('s')) {
        const availableHeight = Math.max(400, window.innerHeight - 56 - Math.max(0, startPosY));
        newHeight = Math.max(400, Math.min(availableHeight, startHeight + dy));
      } else if (direction.includes('n')) {
        let deltaY = Math.min(dy, startHeight - 400);
        deltaY = Math.max(deltaY, -startPosY);
        newHeight = startHeight - deltaY;
        newY = startPosY + deltaY;
      }

      boundsRef.current = {
        x: Math.max(-newWidth + 120, Math.min(window.innerWidth - 120, newX)),
        y: Math.max(0, Math.min(window.innerHeight - 96, newY)),
        width: Math.min(newWidth, window.innerWidth),
        height: Math.min(newHeight, Math.max(400, window.innerHeight - 56))
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
      window.removeEventListener('blur', handleMouseUp);

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
    window.addEventListener('blur', handleMouseUp);
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
        className={`window-frame tool-window-${appId} absolute border border-white/10 shadow-2xl flex flex-col overflow-hidden glass-strong ${
          isMaximized ? 'rounded-none border-none' : 'rounded-2xl'
        } ${
          active
            ? colorActiveBorder
              ? 'active-window border-accent/40 ring-1 ring-accent/25'
              : 'active-window border-white/15'
            : 'inactive-window opacity-95'
        } ${isMinimized ? 'minimized' : ''}`}
        style={{
          zIndex,
          top: 0,
          left: 0
        }}
      >
        <WindowChrome
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
          onDragStart={handleDragStart}
          onDoubleClick={handleMaximizeDoubleClick}
          isMaximized={isMaximized}
          leftContent={headerLeft}
        />

        {/* Content wrapper */}
        <div className="tool-window-content flex-1 min-h-0 relative z-0">
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
