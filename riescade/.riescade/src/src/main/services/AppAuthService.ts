import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'

const API_BASE_URL = 'https://www.riescade.com.br'
const AUTH_PROTOCOL = 'riescade'

interface StoredAppSession {
  accessToken: string
  expiresAt: string
  user: {
    id: string
    email?: string
    name?: string | null
  }
}

interface PendingAuthorization {
  state: string
  verifier: string
  createdAt: number
}

export interface AppSubscription {
  status: string
  plan_name?: string | null
  amount?: number | null
  currency?: string | null
  interval?: string | null
  interval_count?: number | null
  cancel_at_period_end?: boolean
  price_id: string | null
  start_date: string | null
  end_date: string | null
  trial_end: string | null
  updated_at: string | null
}

function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'app-session.bin')
}

async function readApiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : `Falha no login (${response.status})`
}

export class AppAuthService {
  private pending: PendingAuthorization | null = null
  private session: StoredAppSession | null = null

  loadStoredSession(): void {
    const path = sessionFilePath()
    if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return
    try {
      const encrypted = readFileSync(path)
      const session = JSON.parse(safeStorage.decryptString(encrypted)) as StoredAppSession
      if (
        typeof session.accessToken === 'string' &&
        session.accessToken.startsWith('ries_') &&
        Date.parse(session.expiresAt) > Date.now()
      ) {
        this.session = session
      } else {
        unlinkSync(path)
      }
    } catch {
      this.clearLocalSession()
    }
  }

  getSession(): Omit<StoredAppSession, 'accessToken'> | null {
    if (!this.session || Date.parse(this.session.expiresAt) <= Date.now()) {
      this.clearLocalSession()
      return null
    }
    return { expiresAt: this.session.expiresAt, user: this.session.user }
  }

  getAccessToken(): string {
    if (!this.session || Date.parse(this.session.expiresAt) <= Date.now()) {
      this.clearLocalSession()
      throw new Error('Entre com sua conta Google para acessar os downloads.')
    }
    return this.session.accessToken
  }

  async beginLogin(): Promise<void> {
    const verifier = randomUrlSafe(48)
    const state = randomUrlSafe(32)
    const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url')
    this.pending = { state, verifier, createdAt: Date.now() }

    const url = new URL('/app-login', API_BASE_URL)
    url.searchParams.set('state', state)
    url.searchParams.set('challenge', challenge)
    await shell.openExternal(url.toString())
  }

  async handleProtocolUrl(value: string, window: BrowserWindow | null): Promise<void> {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return
    }
    if (
      url.protocol !== `${AUTH_PROTOCOL}:` ||
      url.hostname !== 'auth' ||
      url.pathname !== '/callback'
    ) {
      return
    }

    const pending = this.pending
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    if (
      !pending ||
      Date.now() - pending.createdAt > 5 * 60_000 ||
      state !== pending.state ||
      !code ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(code)
    ) {
      this.pending = null
      window?.webContents.send('app-auth-error', 'O retorno do login é inválido ou expirou.')
      return
    }

    this.pending = null
    try {
      const response = await fetch(`${API_BASE_URL}/api/app/auth/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RIESCADE-App'
        },
        body: JSON.stringify({ code, state, verifier: pending.verifier }),
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) throw new Error(await readApiError(response))
      const payload = (await response.json()) as StoredAppSession
      if (
        typeof payload.accessToken !== 'string' ||
        !payload.accessToken.startsWith('ries_') ||
        !payload.user?.id ||
        Date.parse(payload.expiresAt) <= Date.now()
      ) {
        throw new Error('O servidor retornou uma sessão inválida.')
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('A criptografia segura do Windows não está disponível.')
      }
      this.session = payload
      writeFileSync(
        sessionFilePath(),
        safeStorage.encryptString(JSON.stringify(payload)),
        { mode: 0o600 }
      )
      window?.webContents.send('app-auth-changed', this.getSession())
      window?.show()
      window?.focus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir o login.'
      window?.webContents.send('app-auth-error', message)
    }
  }

  async logout(): Promise<void> {
    const token = this.session?.accessToken
    this.clearLocalSession()
    if (!token) return
    await fetch(`${API_BASE_URL}/api/app/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined)
  }

  async getSubscription(): Promise<AppSubscription | null> {
    const response = await fetch(`${API_BASE_URL}/api/app/subscription`, {
      headers: {
        Authorization: `Bearer ${this.getAccessToken()}`,
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = (await response.json()) as { subscription?: AppSubscription | null }
    return payload.subscription ?? null
  }

  async openSubscriptionPortal(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/app/subscription/portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getAccessToken()}`,
        'User-Agent': 'RIESCADE-App'
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(await readApiError(response))
    const payload = (await response.json()) as { url?: string }
    const url = new URL(payload.url || '')
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.stripe.com')) {
      throw new Error('O servidor retornou um endereço de gerenciamento inválido.')
    }
    void shell.openExternal(url.toString()).catch(error => {
      console.error('Não foi possível abrir o portal da assinatura:', error)
    })
  }

  private clearLocalSession(): void {
    this.session = null
    const path = sessionFilePath()
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        // The expired token remains unusable server-side and will be overwritten later.
      }
    }
  }
}

export function registerRiescadeProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL)
  }
}

export function findProtocolUrl(args: string[]): string | null {
  return args.find(value => value.startsWith(`${AUTH_PROTOCOL}://`)) ?? null
}

export function registerAppAuthIpc(service: AppAuthService): void {
  ipcMain.handle('app-auth-get-session', () => service.getSession())
  ipcMain.handle('app-auth-login', () => service.beginLogin())
  ipcMain.handle('app-auth-logout', () => service.logout())
  ipcMain.handle('app-subscription-get', () => service.getSubscription())
  ipcMain.handle('app-subscription-manage', () => service.openSubscriptionPortal())
}
