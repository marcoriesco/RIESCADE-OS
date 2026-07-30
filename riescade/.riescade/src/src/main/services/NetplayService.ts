import { existsSync } from 'fs'
import { join } from 'path'
import { net } from 'electron'
import { Game, NetplayEligibility, NetplayLaunchOptions, System } from '../../shared/types'
import { SettingsParser } from '../parsers/SettingsParser'
import { getEmulatorsPath } from '../utils/paths'

function clean(value: unknown): string {
  return String(value || '').trim()
}

export class NetplayService {
  private readonly settings = new SettingsParser()
  private cachedRooms: any[] = []
  private roomRequest: Promise<any[]> | null = null
  private localGameIndex: Array<{ game: Game; system: System; crc: string; name: string; core: string }> = []
  private localGamesByCrc = new Map<string, (typeof this.localGameIndex)[number]>()
  private localGamesByName = new Map<string, (typeof this.localGameIndex)[number]>()
  private localGameIndexAt = 0

  resolveEmulator(game: Game, system: System): { emulator: string; core: string } {
    let emulator = clean(game.emulator)
    if (!emulator || emulator === 'auto') {
      emulator = clean(this.settings.getSetting(`${system.name}.emulator`, 'string'))
      if (!emulator || emulator === 'auto') emulator = clean(system.emulators?.[0]?.name)
    }
    if (emulator === 'retroarch') emulator = 'libretro'

    let core = clean(game.core)
    if (!core || core === 'auto') {
      core = clean(this.settings.getSetting(`${system.name}.core`, 'string'))
      if (!core || core === 'auto') {
        core = clean(system.emulators?.find(item => item.name === emulator)?.cores?.[0])
      }
    }
    return { emulator: emulator || 'libretro', core }
  }

  async getEligibility(game: Game, system: System): Promise<NetplayEligibility> {
    const { emulator, core } = this.resolveEmulator(game, system)
    if (emulator.toLowerCase() !== 'libretro') {
      return {
        eligible: false,
        reason: 'Este jogo não está configurado para usar o RetroArch.',
        emulator,
        core,
        coreInstalled: false,
        contentCrc: null
      }
    }
    if (!core) {
      return {
        eligible: false,
        reason: 'Nenhum core do RetroArch foi definido para este jogo.',
        emulator,
        core,
        coreInstalled: false,
        contentCrc: null
      }
    }

    const normalizedCore = core.replace(/_libretro(?:\.dll)?$/i, '')
    const corePath = join(getEmulatorsPath(), 'retroarch', 'cores', `${normalizedCore}_libretro.dll`)
    const coreInstalled = existsSync(corePath)
    const rawCrc = clean(game.crc32).replace(/^0x/i, '').toUpperCase()
    const contentCrc = rawCrc && rawCrc !== '00000000' ? rawCrc : null

    return {
      eligible: coreInstalled,
      reason: coreInstalled ? undefined : `O core ${normalizedCore} não está instalado.`,
      emulator,
      core: normalizedCore,
      coreInstalled,
      contentCrc
    }
  }

  validateLaunchOptions(options: NetplayLaunchOptions): NetplayLaunchOptions {
    const port = Number(options.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('A porta da sala deve estar entre 1 e 65535.')
    }
    const nickname = clean(options.nickname).slice(0, 32)
    if (!nickname) throw new Error('Informe um apelido para jogar online.')
    const safeText = (value?: string, max = 128) => clean(value).replace(/[\r\n"]/g, '').slice(0, max) || undefined
    if (options.mode !== 'host' && !safeText(options.host)) {
      throw new Error('O endereço da sala não foi informado.')
    }
    return {
      mode: options.mode,
      port,
      nickname,
      host: safeText(options.host, 255),
      session: safeText(options.session),
      password: safeText(options.password, 64),
      spectatorPassword: safeText(options.spectatorPassword, 64),
      announce: Boolean(options.announce),
      useRelay: Boolean(options.useRelay)
    }
  }

  async listRooms(systems: System[], gamesForSystem: (systemName: string) => Game[]): Promise<any[]> {
    if (this.roomRequest) return this.roomRequest
    this.roomRequest = this.fetchRooms(systems, gamesForSystem)
      .then(rooms => {
        this.cachedRooms = rooms
        return rooms
      })
      .catch(error => {
        const isExpectedNetworkFailure = error?.name === 'TimeoutError'
          || error?.name === 'AbortError'
          || String(error?.message || error).toLowerCase().includes('fetch')
        if (!isExpectedNetworkFailure) {
          console.warn('[NetplayService] Lobby unavailable:', error)
        }
        return this.cachedRooms
      })
      .finally(() => {
        this.roomRequest = null
      })
    return this.roomRequest
  }

  private async fetchRooms(systems: System[], gamesForSystem: (systemName: string) => Game[]): Promise<any[]> {
    const response = await net.fetch('http://lobby.libretro.com/list/', {
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) throw new Error(`O lobby do RetroArch respondeu com status ${response.status}.`)
    const payload = await response.json()
    if (!Array.isArray(payload)) return []

    const normalize = (value: unknown) => clean(value).toLowerCase().replace(/_libretro(?:\.dll)?$/i, '').replace(/[^a-z0-9]/g, '')
    if (Date.now() - this.localGameIndexAt > 5 * 60_000 || this.localGameIndex.length === 0) {
      const nextIndex: typeof this.localGameIndex = []
      let processed = 0
      for (const system of systems) {
        if (system.path.startsWith('virtual://')) continue
        for (const game of gamesForSystem(system.name)) {
          const crc = clean(game.crc32).replace(/^0x/i, '').toUpperCase()
          const { emulator, core } = this.resolveEmulator(game, system)
          if (emulator.toLowerCase() === 'libretro') {
            nextIndex.push({ game, system, crc, name: normalize(game.name), core: normalize(core) })
          }
          processed += 1
          if (processed % 1000 === 0) {
            await new Promise<void>(resolveYield => setImmediate(resolveYield))
          }
        }
      }
      this.localGameIndex = nextIndex
      this.localGamesByCrc = new Map(nextIndex.filter(item => item.crc && item.crc !== '00000000').map(item => [item.crc, item]))
      this.localGamesByName = new Map(nextIndex.map(item => [item.name, item]))
      this.localGameIndexAt = Date.now()
    }

    return payload.flatMap((entry: any, index: number) => {
      const fields = entry?.fields
      if (!fields || typeof fields !== 'object') return []
      const roomCrc = clean(fields.game_crc).toUpperCase()
      const roomName = normalize(fields.game_name)
      const roomCore = normalize(fields.core_name)
      const match = roomCrc && roomCrc !== '00000000'
        ? this.localGamesByCrc.get(roomCrc)
        : this.localGamesByName.get(roomName)
      if (!match) return []

      const normalizedCore = clean(fields.core_name).replace(/_libretro(?:\.dll)?$/i, '').toLowerCase().replace(/\s+/g, '_')
      const coreInstalled = existsSync(join(getEmulatorsPath(), 'retroarch', 'cores', `${normalizedCore}_libretro.dll`))
      const identicalCore = match.core === roomCore
      if (!identicalCore && !coreInstalled) return []

      const host = clean(fields.mitm_ip || fields.ip)
      const port = Number(fields.mitm_port || fields.port || 55435)
      if (!host || !Number.isInteger(port)) return []

      return [{
        id: clean(entry.pk || fields.id || `${host}:${port}:${index}`),
        nickname: clean(fields.username) || 'Jogador',
        gameName: clean(fields.game_name) || match.game.name,
        systemName: match.system.fullname,
        core: clean(fields.core_name) || normalizedCore,
        players: Number(fields.players || 1),
        maxPlayers: Number(fields.max_players || 2),
        compatibility: identicalCore && roomCrc && match.crc === roomCrc ? 'identical' : 'compatible',
        game: { ...match.game, emulator: 'libretro', core: normalizedCore },
        system: match.system,
        connection: {
          mode: 'client',
          host,
          port,
          session: clean(fields.mitm_session) || undefined,
          hasPassword: Boolean(fields.has_password)
        }
      }]
    })
  }
}
