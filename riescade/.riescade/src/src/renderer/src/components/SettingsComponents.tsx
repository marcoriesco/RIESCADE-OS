import React from "react";
import { SettingsCtx } from "../types";
import { ChevronDown, Check } from "lucide-react";
import * as Select from "@radix-ui/react-select";

export const SettingGroup = ({ label }: { label: string }) => (
  <div className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mt-6 mb-2.5 first:mt-0 select-none">
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
      className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition duration-200 cursor-pointer select-none"
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
          checked ? "bg-accent" : "bg-white/10"
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
};

export const SettingSelect = ({ label, name, options, desc, type = "string", ctx }: {
  label: string; name: string; options: { label: string; value: string }[]; desc?: string;
  type?: "string" | "int"; ctx: SettingsCtx;
}) => {
  const value = ctx.getSetting(name) || "auto";

  return (
    <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
      </div>
      <div className="relative max-w-[220px] shrink-0">
        <Select.Root value={value} onValueChange={(val) => ctx.saveSetting(name, val, type)}>
          <Select.Trigger className="flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-white/90 hover:bg-white/10 hover:border-accent focus:border-accent transition cursor-pointer focus:outline-none min-w-[140px] text-left">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </Select.Icon>
          </Select.Trigger>
          
          <Select.Portal>
            <Select.Content className="bg-[#121620] border border-white/10 rounded-md shadow-2xl overflow-hidden z-[9999] animate-in fade-in duration-100 min-w-[var(--radix-select-trigger-width)]">
              <Select.Viewport className="p-1">
                {options.map(opt => (
                  <Select.Item
                    key={opt.value}
                    value={opt.value}
                    className="relative flex items-center justify-between pl-8 pr-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/5 rounded-md outline-none cursor-pointer select-none data-[state=checked]:text-white data-[state=checked]:bg-white/5"
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
  const val = parseFloat(ctx.getSetting(name, String(Math.floor((min + max) / 2))));
  return (
    <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
        <span className="font-medium text-white/90">{label}</span>
        {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
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
        />
        <span className="text-white/60 font-mono text-[10px] w-12 text-right bg-white/5 border border-white/5 rounded-md px-1.5 py-0.5 select-none">
          {val}{suffix}
        </span>
      </div>
    </div>
  );
};

export const SettingInput = ({ label, name, desc, isPassword = false, ctx }: {
  label: string; name: string; desc?: string; isPassword?: boolean; ctx: SettingsCtx;
}) => (
  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-medium text-white/90">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
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
  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-md px-4 py-3 text-xs select-none">
    <span className="font-medium text-white/90">{label}</span>
    <span className="text-white/50 font-mono text-[10px] bg-white/5 border border-white/5 rounded-md px-2.5 py-0.5">
      {value}
    </span>
  </div>
);
