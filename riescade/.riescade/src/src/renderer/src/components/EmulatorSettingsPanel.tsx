import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, RotateCcw, Link2, ChevronRight, Monitor, Cpu, Volume2, Settings, Gamepad2, Wrench, Palette, Share2, Cog, X } from 'lucide-react'
import { SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput } from './SettingsComponents'
import type { SettingsCtx } from '../types'
import { useI18n } from '../i18n'

// Schema types matching backend EmulatorSchemaService
interface SchemaOption {
  id: string
  label: string
  description?: string
  type: 'toggle' | 'select' | 'slider' | 'input'
  default?: string
  configKey: string
  inheritsGlobal?: string
  values?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  suffix?: string
}

interface SchemaGroup {
  id: string
  title: string
  icon?: string
  order: number
  options: SchemaOption[]
}

interface EmulatorSchema {
  id: string
  name: string
  description?: string
  icon?: string
  groups: SchemaGroup[]
  globalMappings?: Record<string, { configKey: string; globalKey: string }>
}

// Icon mapping
const ICON_MAP: Record<string, React.ReactNode> = {
  monitor: <Monitor className="w-4 h-4" />,
  cpu: <Cpu className="w-4 h-4" />,
  volume2: <Volume2 className="w-4 h-4" />,
  settings: <Settings className="w-4 h-4" />,
  gamepad2: <Gamepad2 className="w-4 h-4" />,
  wrench: <Wrench className="w-4 h-4" />,
  palette: <Palette className="w-4 h-4" />,
  share2: <Share2 className="w-4 h-4" />,
  cog: <Cog className="w-4 h-4" />,
}

interface EmulatorSettingsPanelProps {
  emulatorId: string
  emulatorSettings: any
  globalSettings?: any
  onSaveEmulatorSetting: (emulator: string, name: string, value: any) => void
  initialGroup?: string
  initialCore?: string
}

export const EmulatorSettingsPanel: React.FC<EmulatorSettingsPanelProps> = ({
  emulatorId,
  emulatorSettings,
  globalSettings,
  onSaveEmulatorSetting,
  initialGroup,
  initialCore
}) => {
  const { t } = useI18n()
  const [schema, setSchema] = useState<EmulatorSchema | null>(null)
  const [resolvedSettings, setResolvedSettings] = useState<Record<string, { value: any; source: string }>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  // Load schema and resolved settings
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSearchQuery('')

    const loadData = async () => {
      try {
        const [schemaData, resolved] = await Promise.all([
          window.api.getEmulatorSchema(emulatorId),
          window.api.getResolvedEmulatorSettings(emulatorId)
        ])

        if (!cancelled) {
          setSchema(schemaData)
          setResolvedSettings(resolved || {})
          if (schemaData?.groups?.length > 0) {
            const targetGroup = initialGroup && schemaData.groups.some((g: any) => g.id === initialGroup)
              ? initialGroup
              : schemaData.groups[0].id
            setActiveGroupId(targetGroup)
          }

          if (initialCore) {
            onSaveEmulatorSetting(emulatorId, 'retroarch_core', initialCore)
          }

          setLoading(false)
        }
      } catch (err) {
        console.error('[EmulatorSettingsPanel] Failed to load schema:', err)
        if (!cancelled) {
          setSchema(null)
          setLoading(false)
        }
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [emulatorId, initialGroup, initialCore])

  // Get the effective value for a config key
  const getEffectiveValue = useCallback((configKey: string, defaultValue?: string): string => {
    // First check emulator-specific settings
    const emuSettings = emulatorSettings?.[emulatorId] || {}
    const emuVal = emuSettings[configKey]
    if (emuVal !== undefined && emuVal !== null && emuVal !== 'auto') {
      return String(emuVal)
    }

    // Then check resolved settings from backend
    const resolved = resolvedSettings[configKey]
    if (resolved && resolved.value !== undefined && resolved.value !== 'auto') {
      return String(resolved.value)
    }

    // Check global settings
    const globalConfig = emulatorSettings?.['global'] || {}
    if (globalConfig[configKey] !== undefined) {
      return String(globalConfig[configKey])
    }

    return defaultValue || 'auto'
  }, [emulatorId, emulatorSettings, resolvedSettings])

  // Determine the source of a value
  const getValueSource = useCallback((configKey: string): 'emulator' | 'global' | 'default' => {
    const emuSettings = emulatorSettings?.[emulatorId] || {}
    const emuVal = emuSettings[configKey]
    if (emuVal !== undefined && emuVal !== null && emuVal !== 'auto') {
      return 'emulator'
    }

    const resolved = resolvedSettings[configKey]
    if (resolved) {
      return resolved.source as any
    }

    return 'default'
  }, [emulatorId, emulatorSettings, resolvedSettings])

  // Count overrides for this emulator
  const overrideCount = useMemo(() => {
    const emuSettings = emulatorSettings?.[emulatorId] || {}
    return Object.entries(emuSettings).filter(([, v]) => v !== undefined && v !== null && v !== 'auto').length
  }, [emulatorId, emulatorSettings])

  // Create a SettingsCtx adapter that works with schemas
  const createSchemaCtx = useCallback((): SettingsCtx => ({
    getSetting: (name: string, fallback?: any) => {
      return getEffectiveValue(name, fallback)
    },
    isBoolOn: (name: string) => {
      const val = getEffectiveValue(name, 'false')
      return val === 'true' || val === '1' || val === 'on'
    },
    saveSetting: (name: string, value: any) => {
      onSaveEmulatorSetting(emulatorId, name, value)
      // Update local resolved settings to reflect the change immediately
      setResolvedSettings(prev => ({
        ...prev,
        [name]: { value, source: 'emulator' }
      }))
    }
  }), [emulatorId, getEffectiveValue, onSaveEmulatorSetting])

  const schemaCtx = createSchemaCtx()

  // Filter options by search
  const filteredGroups = useMemo(() => {
    if (!schema) return []
    if (!searchQuery.trim()) return schema.groups

    const q = searchQuery.toLowerCase()
    return schema.groups
      .map(group => ({
        ...group,
        options: group.options.filter(opt =>
          opt.label.toLowerCase().includes(q) ||
          (opt.description || '').toLowerCase().includes(q) ||
          opt.configKey.toLowerCase().includes(q)
        )
      }))
      .filter(group => group.options.length > 0)
  }, [schema, searchQuery])

  // Handle reset individual setting
  const handleResetSetting = useCallback(async (configKey: string) => {
    try {
      await window.api.resetEmulatorSetting(emulatorId, configKey)
      // Refresh resolved settings
      const resolved = await window.api.getResolvedEmulatorSettings(emulatorId)
      setResolvedSettings(resolved || {})
    } catch (err) {
      console.error('[EmulatorSettingsPanel] Failed to reset setting:', err)
    }
  }, [emulatorId])

  // Handle reset all settings
  const handleResetAll = useCallback(async () => {
    try {
      await window.api.resetAllEmulatorSettings(emulatorId)
      const resolved = await window.api.getResolvedEmulatorSettings(emulatorId)
      setResolvedSettings(resolved || {})
    } catch (err) {
      console.error('[EmulatorSettingsPanel] Failed to reset all settings:', err)
    }
  }, [emulatorId])

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 animate-in fade-in duration-200">
        <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        <span className="text-xs text-white/40 font-medium">{t('loadingSettings')}</span>
      </div>
    )
  }

  // No schema found — fall back to nothing (the existing renderDynamicEmulatorSettings will handle it)
  if (!schema) {
    return null
  }

  const sortedGroups = [...schema.groups].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Search bar */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-accent transition duration-200 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchSetting')}
          className="w-full pl-9 pr-9 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 outline-none focus:border-accent/50 focus:bg-white/[0.07] transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition p-0.5 cursor-pointer"
            title={t('clearSearch')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Group tabs - only show when not searching */}
      {!searchQuery.trim() && sortedGroups.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {sortedGroups.map(group => {
            const isActive = activeGroupId === group.id
            const groupIcon = ICON_MAP[group.icon || 'settings']
            return (
              <button
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/30'
                    : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                {groupIcon}
                {group.title}
              </button>
            )
          })}
        </div>
      )}

      {/* Settings content */}
      {(searchQuery.trim() ? filteredGroups : sortedGroups.filter(g => g.id === activeGroupId)).map(group => {
        const selectedCore = getEffectiveValue('retroarch_core', 'auto').toLowerCase()
        const visibleOptions = group.options.filter(option => {
          if ((option as any).core) {
            if (selectedCore !== 'auto' && selectedCore !== 'all') {
              return (option as any).core === selectedCore
            }
          }
          return true
        })

        return (
          <div key={group.id} className="space-y-2">
            <SettingGroup label={group.title} />
            {visibleOptions.map(option => {
            const source = getValueSource(option.configKey)
            const isInherited = source === 'global' && option.inheritsGlobal
            const isOverridden = source === 'emulator'

            return (
              <div key={option.id} className="relative group/setting">
                {/* Inheritance indicator badge */}
                {option.inheritsGlobal && (
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                    {isInherited && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <Link2 className="w-3 h-3" />
                        {t('global')}
                      </span>
                    )}
                    {isOverridden && (
                      <button
                        onClick={() => handleResetSetting(option.configKey)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all cursor-pointer"
                        title="Resetar para o valor global"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('reset')}
                      </button>
                    )}
                  </div>
                )}

                {/* Render the appropriate control */}
                {option.type === 'select' && option.values && (
                  <SettingSelect
                    label={option.label}
                    name={option.configKey}
                    desc={option.description}
                    options={option.values}
                    ctx={schemaCtx}
                  />
                )}
                {option.type === 'toggle' && (
                  <SettingToggle
                    label={option.label}
                    name={option.configKey}
                    desc={option.description}
                    ctx={schemaCtx}
                  />
                )}
                {option.type === 'slider' && (
                  <SettingSlider
                    label={option.label}
                    name={option.configKey}
                    desc={option.description}
                    min={option.min || 0}
                    max={option.max || 100}
                    step={option.step || 1}
                    ctx={schemaCtx}
                  />
                )}
                {option.type === 'input' && (
                  <SettingInput
                    label={option.label}
                    name={option.configKey}
                    desc={option.description}
                    ctx={schemaCtx}
                  />
                )}
              </div>
            )
          })}
        </div>
      )
    })}

      {/* No results */}
      {searchQuery.trim() && filteredGroups.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-8 h-8 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">Nenhuma configuração encontrada para "{searchQuery}"</p>
        </div>
      )}

      {/* Reset all button */}
      {emulatorId !== 'global' && overrideCount > 0 && (
        <div className="pt-4 border-t border-white/5">
          <button
            onClick={handleResetAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/15 hover:bg-red-500/20 hover:border-red-500/25 transition-all text-sm font-medium w-full justify-center"
          >
            <RotateCcw className="w-4 h-4" />
            {t('resetAll')} ({overrideCount} {overrideCount === 1 ? 'override' : 'overrides'})
          </button>
        </div>
      )}
    </div>
  )
}
