import React, { useState, useEffect } from "react";
import { SettingsCtx } from "../types";
import { ChevronRight } from "lucide-react";

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
      className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-white/5 transition duration-200 cursor-pointer select-none"
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
}) => (
  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-medium text-white/90">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
    </div>
    <div className="relative max-w-[220px] shrink-0">
      <select
        value={ctx.getSetting(name)}
        onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, type); }}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-[#121212] text-white/90">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-white/40">
        <ChevronRight className="w-3.5 h-3.5 rotate-90" />
      </div>
    </div>
  </div>
);

export const SettingSlider = ({ label, name, min, max, step, suffix = "", desc, type = "int", ctx }: {
  label: string; name: string; min: number; max: number; step: number; suffix?: string; desc?: string;
  type?: "int" | "float"; ctx: SettingsCtx;
}) => {
  const val = parseFloat(ctx.getSetting(name, String(Math.floor((min + max) / 2))));
  return (
    <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
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
          className="w-28 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-range transition focus:outline-none"
        />
        <span className="text-white/60 font-mono text-[10px] w-12 text-right bg-white/5 border border-white/5 rounded px-1.5 py-0.5 select-none">
          {val}{suffix}
        </span>
      </div>
    </div>
  );
};

export const SettingInput = ({ label, name, desc, isPassword = false, ctx }: {
  label: string; name: string; desc?: string; isPassword?: boolean; ctx: SettingsCtx;
}) => (
  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs hover:bg-white/5 transition duration-200">
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
      <span className="font-medium text-white/90">{label}</span>
      {desc && <span className="text-[10px] text-white/40 leading-relaxed font-sans">{desc}</span>}
    </div>
    <input
      type={isPassword ? "password" : "text"}
      value={ctx.getSetting(name)}
      onChange={e => { e.stopPropagation(); ctx.saveSetting(name, e.target.value, "string"); }}
      onBlur={e => ctx.saveSetting(name, e.target.value, "string")}
      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-8 text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus-border-accent hover:bg-white/10 transition appearance-none cursor-pointer font-sans"
      placeholder="Digite aqui..."
    />
  </div>
);

export const SettingInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between bg-black/15 border border-white/5 rounded-xl px-4 py-3 text-xs select-none">
    <span className="font-medium text-white/90">{label}</span>
    <span className="text-white/50 font-mono text-[10px] bg-white/5 border border-white/5 rounded px-2.5 py-0.5">
      {value}
    </span>
  </div>
);
