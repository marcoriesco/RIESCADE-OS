import React from "react";
import { Minus, Square, X } from "lucide-react";

export function WindowChrome({
  onMinimize,
  onMaximize,
  onClose,
  onDragStart,
  onDoubleClick,
  isMaximized = false,
  nativeDrag = false,
  leftContent
}: {
  onMinimize: (event: React.MouseEvent) => void;
  onMaximize: (event: React.MouseEvent) => void;
  onClose: (event: React.MouseEvent) => void;
  onDragStart?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  isMaximized?: boolean;
  nativeDrag?: boolean;
  leftContent?: React.ReactNode;
}) {
  return (
    <div
      onMouseDown={onDragStart}
      onDoubleClick={onDoubleClick}
      className="absolute inset-x-0 top-0 z-[60] h-9 select-none"
      style={nativeDrag ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : undefined}
    >
      {leftContent && (
        <div
          className="absolute inset-y-0 left-3 flex min-w-0 w-full pr-38 items-center"
          style={nativeDrag ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
          {leftContent}
        </div>
      )}
      <div
        className="absolute inset-y-0 right-0 flex items-center"
        style={nativeDrag ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
      >
        <button
          type="button"
          onClick={onMinimize}
          className="flex h-full w-11 items-center justify-center text-white/50 transition hover:bg-white/[0.07] hover:text-white"
          title="Minimizar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMaximize}
          className="flex h-full w-11 items-center justify-center text-white/50 transition hover:bg-white/[0.07] hover:text-white"
          title={isMaximized ? "Restaurar" : "Maximizar"}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-full w-11 items-center justify-center text-white/50 transition hover:bg-red-500/75 hover:text-white"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
