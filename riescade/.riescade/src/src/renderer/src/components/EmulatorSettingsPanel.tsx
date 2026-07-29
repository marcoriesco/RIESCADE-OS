import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, RotateCcw, Link2, ChevronRight, X } from 'lucide-react'
import { SettingGroup, SettingToggle, SettingSelect, SettingSlider, SettingInput, RadixTabs, RadixTabContent } from './SettingsComponents'
import type { SettingsCtx } from '../types'
import { useI18n } from '../i18n'
import { localizeEmulatorSchemaText } from '../emulatorSchemaI18n'

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
  incompleteValues?: boolean
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
interface EmulatorSettingsPanelProps {
  emulatorId: string
  emulatorSettings: any
  globalSettings?: any
  onSaveEmulatorSetting: (emulator: string, name: string, value: any) => void
  initialGroup?: string
  initialCore?: string
  scope?: 'emulator' | 'system' | 'game'
  scopeContext?: { system: string; emulator: string; core?: string; rom?: string }
  onOverridesChange?: (count: number) => void
}

export const EmulatorSettingsPanel: React.FC<EmulatorSettingsPanelProps> = ({
  emulatorId,
  emulatorSettings,
  globalSettings,
  onSaveEmulatorSetting,
  initialGroup,
  initialCore,
  scope = 'emulator',
  scopeContext,
  onOverridesChange
}) => {
  const { t, resolvedLanguage } = useI18n()
  const [schema, setSchema] = useState<EmulatorSchema | null>(null)
  const [resolvedSettings, setResolvedSettings] = useState<Record<string, { value: any; source: string }>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, any>>({})

  useEffect(() => {
    if (scope !== 'emulator') onOverridesChange?.(Object.keys(scopeOverrides).length)
  }, [scope, scopeOverrides, onOverridesChange])

  // Load schema and resolved settings
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSearchQuery('')

    const loadData = async () => {
      try {
        const scopedPromise = scope === 'emulator'
          ? window.api.getResolvedEmulatorSettings(emulatorId).then(resolved => ({ resolved, entry: null }))
          : window.api.getScopedSettings(scope, scopeContext!)
        const [schemaData, scopedData] = await Promise.all([
          window.api.getEmulatorSchema(emulatorId),
          scopedPromise
        ])

        if (!cancelled) {
          setSchema(schemaData)
          setResolvedSettings(scopedData?.resolved || {})
          setScopeOverrides(scopedData?.entry?.settings || {})
          if (schemaData?.groups?.length > 0) {
            const targetGroup = initialGroup && schemaData.groups.some((g: any) => g.id === initialGroup)
              ? initialGroup
              : schemaData.groups[0].id
            setActiveGroupId(targetGroup)
          }

          if (initialCore && scope === 'emulator') {
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
  }, [emulatorId, initialGroup, initialCore, scope, scopeContext?.system, scopeContext?.rom, scopeContext?.core])

  // Get the effective value for a config key
  const getEffectiveValue = useCallback((configKey: string, defaultValue?: string): string => {
    // First check emulator-specific settings
    const emuSettings = scope === 'emulator' ? (emulatorSettings?.[emulatorId] || {}) : scopeOverrides
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
  }, [emulatorId, emulatorSettings, resolvedSettings, scope, scopeOverrides])

  // Determine the source of a value
  const getValueSource = useCallback((configKey: string): 'game' | 'system' | 'emulator' | 'global' | 'default' => {
    const emuSettings = scope === 'emulator' ? (emulatorSettings?.[emulatorId] || {}) : scopeOverrides
    const emuVal = emuSettings[configKey]
    if (emuVal !== undefined && emuVal !== null && emuVal !== 'auto') {
      return scope
    }

    const resolved = resolvedSettings[configKey]
    if (resolved) {
      return resolved.source as any
    }

    return 'default'
  }, [emulatorId, emulatorSettings, resolvedSettings, scope, scopeOverrides])

  // Count overrides for this emulator
  const overrideCount = useMemo(() => {
    const emuSettings = scope === 'emulator' ? (emulatorSettings?.[emulatorId] || {}) : scopeOverrides
    return Object.entries(emuSettings).filter(([, v]) => v !== undefined && v !== null && v !== 'auto').length
  }, [emulatorId, emulatorSettings, scope, scopeOverrides])

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
      if (scope === 'emulator') {
        onSaveEmulatorSetting(emulatorId, name, value)
      } else if (scopeContext) {
        void window.api.saveScopedSetting(scope, scopeContext, name, value)
        setScopeOverrides(prev => {
          const next = { ...prev }
          if (value === 'auto' || value === undefined || value === null) delete next[name]
          else next[name] = value
          return next
        })
      }
      // Update local resolved settings to reflect the change immediately
      setResolvedSettings(prev => ({
        ...prev,
        [name]: { value, source: scope }
      }))
    }
  }), [emulatorId, getEffectiveValue, onSaveEmulatorSetting, scope, scopeContext])

  const schemaCtx = createSchemaCtx()
  const activeCore = useMemo(() => {
    if (scope !== 'emulator') {
      return String(scopeContext?.core || initialCore || 'auto').toLowerCase()
    }
    return getEffectiveValue('retroarch_core', 'auto').toLowerCase()
  }, [scope, scopeContext?.core, initialCore, getEffectiveValue])

  const isOptionVisibleForContext = useCallback((option: SchemaOption): boolean => {
    if (scope !== 'emulator' && option.configKey === 'retroarch_core') return false
    const optionCore = (option as any).core
    if (!optionCore) return true
    if (activeCore === 'auto' || activeCore === 'all') return scope === 'emulator'
    const normalizedOptionCore = String(optionCore).toLowerCase()
    if (normalizedOptionCore === activeCore) return true
    return normalizedOptionCore === 'mupen64plus'
      && (activeCore === 'mupen64plus_next' || activeCore === 'mupen64plus_next_gles3')
  }, [scope, activeCore])

  const localizedGroups = useMemo(() => {
    if (!schema) return []
    return schema.groups.map(group => ({
      ...group,
      title: localizeEmulatorSchemaText(group.title, resolvedLanguage) || group.title,
      options: group.options.map(option => ({
        ...option,
        label: localizeEmulatorSchemaText(option.label, resolvedLanguage) || option.label,
        description: localizeEmulatorSchemaText(option.description, resolvedLanguage),
        values: option.values?.map(value => ({
          ...value,
          label: localizeEmulatorSchemaText(value.label, resolvedLanguage) || value.label
        }))
      }))
    }))
  }, [schema, resolvedLanguage])

  // Filter options by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return localizedGroups
        .map(group => ({ ...group, options: group.options.filter(isOptionVisibleForContext) }))
        .filter(group => group.options.length > 0)
    }

    const q = searchQuery.toLowerCase()
    return localizedGroups
      .map(group => ({
        ...group,
        options: group.options.filter(opt => isOptionVisibleForContext(opt) && (
          opt.label.toLowerCase().includes(q) ||
          (opt.description || '').toLowerCase().includes(q) ||
          opt.configKey.toLowerCase().includes(q)
        ))
      }))
      .filter(group => group.options.length > 0)
  }, [localizedGroups, searchQuery, isOptionVisibleForContext])

  // Handle reset individual setting
  const handleResetSetting = useCallback(async (configKey: string) => {
    try {
      if (scope === 'emulator') {
        await window.api.resetEmulatorSetting(emulatorId, configKey)
        const resolved = await window.api.getResolvedEmulatorSettings(emulatorId)
        setResolvedSettings(resolved || {})
      } else if (scopeContext) {
        const data = await window.api.resetScopedSetting(scope, scopeContext, configKey)
        setScopeOverrides(data?.entry?.settings || {})
        setResolvedSettings(data?.resolved || {})
      }
    } catch (err) {
      console.error('[EmulatorSettingsPanel] Failed to reset setting:', err)
    }
  }, [emulatorId, scope, scopeContext])

  // Handle reset all settings
  const handleResetAll = useCallback(async () => {
    try {
      if (scope === 'emulator') {
        await window.api.resetAllEmulatorSettings(emulatorId)
        const resolved = await window.api.getResolvedEmulatorSettings(emulatorId)
        setResolvedSettings(resolved || {})
      } else if (scopeContext) {
        const data = await window.api.resetScopedSetting(scope, scopeContext)
        setScopeOverrides({})
        setResolvedSettings(data?.resolved || {})
      }
    } catch (err) {
      console.error('[EmulatorSettingsPanel] Failed to reset all settings:', err)
    }
  }, [emulatorId, scope, scopeContext])

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

  const sortedGroups = localizedGroups
    .map(group => ({ ...group, options: group.options.filter(isOptionVisibleForContext) }))
    .filter(group => group.options.length > 0)
    .sort((a, b) => a.order - b.order)

  const renderGroup = (group: SchemaGroup) => (
    <div className="space-y-2">
      <SettingGroup label={group.title} />
      {group.options.map(option => {
        const source = getValueSource(option.configKey)
        const isInherited = source !== scope && source !== 'default'
        const isOverridden = source === scope

        return (
          <div key={option.id} className="relative group/setting">
            {(option.inheritsGlobal || scope !== 'emulator') && (
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                {isInherited && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
                    <Link2 className="w-3 h-3" />
                    {source === 'system' ? t('system') : source === 'emulator' ? t('emulator') : source === 'game' ? t('game') : t('global')}
                  </span>
                )}
                {isOverridden && (
                  <button
                    onClick={() => handleResetSetting(option.configKey)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all cursor-pointer"
                    title={t('useInheritedSetting')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('reset')}
                  </button>
                )}
              </div>
            )}
            {option.type === 'select' && option.values && !option.incompleteValues && (
              <SettingSelect label={option.label} name={option.configKey} desc={option.description} options={option.values} ctx={schemaCtx} />
            )}
            {option.type === 'select' && option.incompleteValues && (
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                <div className="text-sm font-medium text-white/75">{option.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-amber-200/55">
                  Valores ainda não catalogados para esta versão do core. Ajuste pelo menu interno do RetroArch.
                </div>
              </div>
            )}
            {option.type === 'toggle' && (
              <SettingToggle label={option.label} name={option.configKey} desc={option.description} ctx={schemaCtx} />
            )}
            {option.type === 'slider' && (
              <SettingSlider label={option.label} name={option.configKey} desc={option.description} min={option.min || 0} max={option.max || 100} step={option.step || 1} ctx={schemaCtx} />
            )}
            {option.type === 'input' && (
              <SettingInput label={option.label} name={option.configKey} desc={option.description} ctx={schemaCtx} />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {scope !== 'emulator' && (
        <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-white">
              {scope === 'game' ? t('gameConfiguration') : `${t('systemConfiguration')} ${scopeContext?.system || ''}`}
            </div>
            <div className="text-[10px] text-white/45">
              {t('autoInheritanceHint')}
            </div>
          </div>
          <span className="rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase text-accent">
            {scope === 'game' ? t('game') : t('system')}
          </span>
        </div>
      )}
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
        <RadixTabs
          className="w-full"
          tabs={sortedGroups.map(group => ({
            id: group.id,
            label: group.title
          }))}
          value={activeGroupId || sortedGroups[0]?.id || ''}
          onValueChange={setActiveGroupId}
        >
          {sortedGroups.map(group => (
            <RadixTabContent key={group.id} value={group.id}>
              {renderGroup(group)}
            </RadixTabContent>
          ))}
        </RadixTabs>
      )}

      {/* Search results and schemas that only have one group do not need tab navigation. */}
      {(searchQuery.trim() ? filteredGroups : sortedGroups.length <= 1 ? sortedGroups : []).map(group => {
        const visibleOptions = group.options

        return (
          <div key={group.id} className="space-y-2">
            <SettingGroup label={group.title} />
            {visibleOptions.map(option => {
            const source = getValueSource(option.configKey)
            const isInherited = source !== scope && source !== 'default'
            const isOverridden = source === scope

            return (
              <div key={option.id} className="relative group/setting">
                {/* Inheritance indicator badge */}
                {(option.inheritsGlobal || scope !== 'emulator') && (
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                    {isInherited && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <Link2 className="w-3 h-3" />
                        {source === 'system' ? t('system') : source === 'emulator' ? t('emulator') : source === 'game' ? t('game') : t('global')}
                      </span>
                    )}
                    {isOverridden && (
                      <button
                        onClick={() => handleResetSetting(option.configKey)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all cursor-pointer"
                        title={t('useInheritedSetting')}
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('reset')}
                      </button>
                    )}
                  </div>
                )}

                {/* Render the appropriate control */}
                {option.type === 'select' && option.values && !option.incompleteValues && (
                  <SettingSelect
                    label={option.label}
                    name={option.configKey}
                    desc={option.description}
                    options={option.values}
                    ctx={schemaCtx}
                  />
                )}
                {option.type === 'select' && option.incompleteValues && (
                  <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                    <div className="text-sm font-medium text-white/75">{option.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-amber-200/55">
                      Valores ainda não catalogados para esta versão do core. Ajuste pelo menu interno do RetroArch.
                    </div>
                  </div>
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
          <p className="text-sm text-white/40">{t('noSettingFound')} "{searchQuery}"</p>
        </div>
      )}

      {/* Reset all button */}
      {emulatorId !== 'global' && emulatorId !== '_global' && overrideCount > 0 && (
        <div className="pt-4 border-t border-white/5">
          <button
            onClick={handleResetAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/15 hover:bg-red-500/20 hover:border-red-500/25 transition-all text-sm font-medium w-full justify-center"
          >
            <RotateCcw className="w-4 h-4" />
            {t('resetAll')} ({overrideCount} {overrideCount === 1 ? t('override') : t('overrides')})
          </button>
        </div>
      )}
    </div>
  )
}
