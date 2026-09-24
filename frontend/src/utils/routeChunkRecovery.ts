const ROUTE_RELOAD_MARKER = 'fruit-ana:route-chunk-reload'
const ROUTE_RELOAD_PARAM = '_route_reload'

export type RouteChunkRecoveryResult = 'ignored' | 'reload' | 'pending' | 'exhausted'

interface RouteChunkRecoveryOptions {
  storage: Storage
  origin: string
  replace: (url: string) => void
  now?: () => number
}

const ROUTE_CHUNK_ERROR_PATTERN = [
  /Failed to fetch dynamically imported module/i,
  /Unable to preload CSS/i,
  /Importing a module script failed/i,
]

export function isRouteChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return ROUTE_CHUNK_ERROR_PATTERN.some((pattern) => pattern.test(message))
}

export function createRouteChunkRecovery(options: RouteChunkRecoveryOptions) {
  const exhausted = Boolean(options.storage.getItem(ROUTE_RELOAD_MARKER))
  const now = options.now ?? Date.now
  let reloadPending = false

  function handle(error: unknown, targetPath: string): RouteChunkRecoveryResult {
    if (!isRouteChunkLoadError(error)) return 'ignored'
    if (exhausted) return 'exhausted'
    if (reloadPending) return 'pending'

    reloadPending = true
    options.storage.setItem(ROUTE_RELOAD_MARKER, '1')
    const url = new URL(targetPath, options.origin)
    url.searchParams.set(ROUTE_RELOAD_PARAM, String(now()))
    options.replace(url.toString())
    return 'reload'
  }

  function clear(): void {
    options.storage.removeItem(ROUTE_RELOAD_MARKER)
  }

  return { handle, clear }
}
