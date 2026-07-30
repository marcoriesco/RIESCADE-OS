import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AppButton } from "./AppButton";

type AppDialogSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AppDialogSize, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[560px]",
  lg: "max-w-[760px]",
  xl: "max-w-[960px]"
};

export interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: AppDialogSize;
  closeLabel?: string;
  contentClassName?: string;
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  closeLabel = "Fechar",
  contentClassName = ""
}: AppDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className={`app-dialog-content fixed left-1/2 top-1/2 z-[10001] flex max-h-[min(86vh,900px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121214]/95 text-white shadow-2xl outline-none backdrop-blur-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 ${sizeClasses[size]} ${contentClassName}`}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-5 py-4">
            {icon && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-accent drop-shadow-[0_0_10px_var(--accent-color)] [&>svg]:h-5 [&>svg]:w-5">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-base font-bold text-white">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs leading-relaxed text-white/45">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <AppButton
                variant="ghost"
                size="icon"
                aria-label={closeLabel}
                title={closeLabel}
                className="-mr-1 -mt-1 text-white/50 hover:text-white"
              >
                <X className="h-4 w-4" />
              </AppButton>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
