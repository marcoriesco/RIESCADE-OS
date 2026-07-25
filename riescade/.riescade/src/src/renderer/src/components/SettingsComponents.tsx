import React from "react";
import { SettingsCtx } from "../types";
import { ChevronDown, Check } from "lucide-react";
import * as Select from "@radix-ui/react-select";

export type UnderlineTab = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

export const UnderlineTabs = ({
  tabs,
  value,
  onValueChange,
  equalWidth = false,
  className = ""
}: {
  tabs: UnderlineTab[];
  value: string;
  onValueChange: (value: string) => void;
  equalWidth?: boolean;
  className?: string;
}) => (
  <div
    role="tablist"
    className={`flex items-end gap-6 border-b border-white/[0.08] overflow-x-auto scrollbar-none select-none ${className}`}
  >
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const active = value === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onValueChange(tab.id)}
          className={`relative flex min-h-10 items-center justify-center gap-2 px-0.5 pb-3 pt-2 text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
            equalWidth ? "flex-1" : "shrink-0"
          } ${
            active
              ? "text-white after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-accent"
              : "text-white/45 hover:text-white/75"
          }`}
        >
          {Icon && <Icon className={`h-4 w-4 ${active ? "text-accent" : "opacity-70"}`} />}
          <span>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

export const SettingGroup = ({ label }: { label: string }) => (
  <div className="settings-section-title mt-8 mb-3 first:mt-0 select-none">
    {label}
  </div>
);

export const SettingToggle = ({ label, name, desc, ctx }: {
  label: string; name: string; desc?: string; ctx: SettingsCtx;
}) => {
  const checked = ctx.isBoolOn(name);
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    ctx.saveSetting(name, checked ? "false" : "true", "bool");
  };

  return (
    <div
      onClick={handleToggle}
      className="settings-row cursor-pointer select-none"
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-xs text-white/40 leading-relaxed font-sans">{desc}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
          checked ? "bg-accent" : "bg-white/10"
        }`}
      >
        <span
          className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
};

export const SettingSelect = ({ label, name, options, desc, type = "string", defaultValue, onValueChange, ctx }: {
  label: string; name: string; options: { label: string; value: string }[]; desc?: string;
  type?: "string" | "int"; defaultValue?: string; onValueChange?: (value: string) => void | Promise<void>; ctx: SettingsCtx;
}) => {
  const rawVal = ctx.getSetting(name);
  const value = (rawVal !== null && rawVal !== undefined) ? String(rawVal) : (defaultValue !== undefined ? defaultValue : "auto");

  return (
    <div className="settings-row">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-xs text-white/40 leading-relaxed font-sans">{desc}</span>}
      </div>
      <div className="relative max-w-[220px] shrink-0">
        <Select.Root value={value} onValueChange={(val) => {
          if (onValueChange) void onValueChange(val);
          else ctx.saveSetting(name, val, type);
        }}>
          <Select.Trigger className="settings-select-trigger min-w-[180px]">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </Select.Icon>
          </Select.Trigger>
          
          <Select.Portal>
            <Select.Content className="settings-select-content min-w-[var(--radix-select-trigger-width)]">
              <Select.Viewport className="p-1">
                {options.map(opt => (
                  <Select.Item
                    key={opt.value}
                    value={opt.value}
                    className="settings-select-item"
                  >
                    <Select.ItemText>{opt.label}</Select.ItemText>
                    <Select.ItemIndicator className="absolute left-2 flex items-center justify-center">
                      <Check className="w-3 h-3 text-accent" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  );
};

export const SettingSlider = ({ label, name, min, max, step, suffix = "", desc, type = "int", ctx }: {
  label: string; name: string; min: number; max: number; step: number; suffix?: string; desc?: string;
  type?: "int" | "float"; ctx: SettingsCtx;
}) => {
  const parsed = parseFloat(ctx.getSetting(name, String(Math.floor((min + max) / 2))));
  const val = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : min;
  const progress = max === min ? 0 : ((val - min) / (max - min)) * 100;
  return (
    <div className="settings-row">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-xs text-white/40 leading-relaxed font-sans">{desc}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range"
          min={min} 
          max={max} 
          step={step}
          value={val}
          onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, type); }}
          className="w-28 h-1 bg-white/10 rounded-md appearance-none cursor-pointer accent-range transition focus:outline-none"
          style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
          aria-label={label}
        />
        <span className="text-accent font-mono text-[10px] w-12 text-right bg-accent-light border border-accent-focus rounded-md px-1.5 py-0.5 select-none">
          {val}{suffix}
        </span>
      </div>
    </div>
  );
};

export const SettingInput = ({ label, name, desc, isPassword = false, ctx }: {
  label: string; name: string; desc?: string; isPassword?: boolean; ctx: SettingsCtx;
}) => (
    <div className="settings-row">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-medium text-white/90">{label}</span>
      {desc && <span className="text-[12px] text-white/40 leading-relaxed font-sans">{desc}</span>}
    </div>
    <input
      type={isPassword ? "password" : "text"}
      value={ctx.getSetting(name)}
      onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, "string"); }}
      onBlur={e => ctx.saveSetting(name, e.target.value, "string")}
      className="bg-white/5 border border-white/10 rounded-md px-3 py-2 pr-8 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent hover:border-accent hover:bg-white/10 transition appearance-none cursor-pointer font-sans"
      placeholder="Digite aqui..."
    />
  </div>
);

export const SettingInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="settings-row select-none">
    <span className="font-medium text-white/90">{label}</span>
    <span className="text-white/50 font-mono text-xs bg-white/5 border border-white/5 rounded-md px-2.5 py-0.5">
      {value}
    </span>
  </div>
);
