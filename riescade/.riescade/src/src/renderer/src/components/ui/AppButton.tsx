import React from "react";

export type AppButtonVariant = "primary" | "secondary" | "ghost";
export type AppButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<AppButtonVariant, string> = {
  primary:
    "border border-accent bg-accent text-white shadow-[0_8px_24px_-10px_var(--accent-color)] hover:bg-accent-hover",
  secondary:
    "border border-accent/45 bg-accent-light text-white hover:border-accent hover:bg-accent/25",
  ghost:
    "border border-transparent bg-transparent text-accent hover:border-accent/20 hover:bg-accent-light hover:text-white"
};

const sizeClasses: Record<AppButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-xs",
  lg: "min-h-11 px-5 py-2.5 text-sm",
  icon: "h-9 w-9 p-0"
};

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  function AppButton(
    {
      variant = "primary",
      size = "md",
      type = "button",
      className = "",
      children,
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-lg font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] disabled:cursor-not-allowed disabled:opacity-45 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

