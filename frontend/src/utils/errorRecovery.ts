export type FatalErrorKind =
  | 'server'
  | 'network'
  | 'timeout'
  | 'route'
  | 'runtime'
  | 'not-found'
  | 'forbidden'

export type FatalErrorSource = 'api' | 'router' | 'runtime' | 'auth' | 'navigation'
export type ApiFailureKind = 'http' | 'network' | 'timeout' | 'invalid-response' | 'abort'
export type FailureMode = 'auto' | 'page' | 'inline'

export interface ApiFailureDescriptor {
  kind: ApiFailureKind
  status: number | null
  method: string
  url: string
  requestId?: string | null
  failureMode?: FailureMode
}

export interface FatalErrorState {
  kind: FatalErrorKind
  from: string | null
  status: number | null
  requestId: string | null
  occurredAt: string
  source: FatalErrorSource
}

export interface FatalErrorInput {
  kind: FatalErrorKind
  from?: string | null
  status?: number | null
  requestId?: string | null
  source: FatalErrorSource
}

export const FATAL_ERROR_EVENT = 'fruits-ana:fatal-error'
export const AUTH_EXPIRED_EVENT = 'fruits-ana:auth-expired'
export const ERROR_STATE_TTL_MS = 30 * 60 * 1000

const ERROR_STATE_STORAGE_KEY = 'fruits-ana:fatal-error-state'
const SERVER_STATUSES = new Set([500, 502, 503, 504])
const SAFE_METHODS = new Set(['GET', 'HEAD'])

export function classifyApiFailure(failure: ApiFailureDescriptor): FatalErrorKind | null {
  const mode = failure.failureMode ?? 'auto'
  const method = failure.method.toUpperCase()
  if (mode === 'inline' || failure.kind === 'abort' || !SAFE_METHODS.has(method)) return null
  if (failure.kind === 'network') return 'network'
  if (failure.kind === 'timeout') return 'timeout'
  if (failure.kind === 'invalid-response') return 'server'
  if (failure.status === 403) return 'forbidden'
  if (failure.status === 404 && mode === 'page') return 'not-found'
  return failure.status !== null && SERVER_STATUSES.has(failure.status) ? 'server' : null
}

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  const pathname = value.split(/[?#]/, 1)[0]
  return pathname === '/error' ? null : value
}

export function createFatalErrorState(input: FatalErrorInput, nowMs = Date.now()): FatalErrorState {
  return {
    kind: input.kind,
    from: safeReturnPath(input.from),
    status: Number.isInteger(input.status) ? input.status ?? null : null,
    requestId: safeText(input.requestId),
    occurredAt: new Date(nowMs).toISOString(),
    source: input.source,
  }
}

export function saveFatalError(
  state: FatalErrorState,
  storage: Storage | null = browserSessionStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(ERROR_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 隐私模式或存储配额异常时，本次路由仍可继续进入错误页。
  }
}

export function readFatalError(
  storage: Storage | null = browserSessionStorage(),
  nowMs = Date.now(),
): FatalErrorState | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(ERROR_STATE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FatalErrorState>
    if (!isFatalErrorKind(parsed.kind) || !isFatalErrorSource(parsed.source)) {
      storage.removeItem(ERROR_STATE_STORAGE_KEY)
      return null
    }
    const occurredMs = Date.parse(String(parsed.occurredAt ?? ''))
    if (!Number.isFinite(occurredMs) || nowMs - occurredMs > ERROR_STATE_TTL_MS) {
      storage.removeItem(ERROR_STATE_STORAGE_KEY)
      return null
    }
    return {
      kind: parsed.kind,
      from: safeReturnPath(parsed.from),
      status: Number.isInteger(parsed.status) ? parsed.status ?? null : null,
      requestId: safeText(parsed.requestId),
      occurredAt: new Date(occurredMs).toISOString(),
      source: parsed.source,
    }
  } catch {
    storage.removeItem(ERROR_STATE_STORAGE_KEY)
    return null
  }
}

export function clearFatalError(storage: Storage | null = browserSessionStorage()): void {
  try {
    storage?.removeItem(ERROR_STATE_STORAGE_KEY)
  } catch {
    // 清理失败不阻止用户离开错误页。
  }
}

export function reportFatalError(input: FatalErrorInput): FatalErrorState {
  const state = createFatalErrorState(input)
  saveFatalError(state)
  dispatchBrowserEvent(FATAL_ERROR_EVENT, state)
  return state
}

export function reportAuthExpired(): void {
  dispatchBrowserEvent(AUTH_EXPIRED_EVENT, null)
}

function browserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function dispatchBrowserEvent(name: string, detail: unknown): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, 160) : null
}

function isFatalErrorKind(value: unknown): value is FatalErrorKind {
  return ['server', 'network', 'timeout', 'route', 'runtime', 'not-found', 'forbidden'].includes(String(value))
}

function isFatalErrorSource(value: unknown): value is FatalErrorSource {
  return ['api', 'router', 'runtime', 'auth', 'navigation'].includes(String(value))
}
