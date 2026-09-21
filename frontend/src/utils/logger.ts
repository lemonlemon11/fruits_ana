export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
const configuredLevel = (meta.env?.VITE_LOG_LEVEL ?? '').trim().toLowerCase() as LogLevel
const defaultLevel: LogLevel = meta.env?.PROD ? 'warn' : 'debug'
const currentLevel: LogLevel = configuredLevel in LEVEL_ORDER ? configuredLevel : defaultLevel

const SENSITIVE_KEYS = /password|passwd|token|secret|authorization|cookie|api[-_]?key/i

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(item, seen),
    ]),
  )
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel]
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export function createLogger(scope: string): Logger {
  function write(level: LogLevel, message: string, args: unknown[]) {
    if (!shouldLog(level)) return
    const safeArgs = args.map((item) => redact(item))
    console[level](`[${scope}] ${message}`, ...safeArgs)
  }

  return {
    debug: (message, ...args) => write('debug', message, args),
    info: (message, ...args) => write('info', message, args),
    warn: (message, ...args) => write('warn', message, args),
    error: (message, ...args) => write('error', message, args),
  }
}

export const logger = createLogger('app')

