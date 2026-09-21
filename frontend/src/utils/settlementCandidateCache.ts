import {
  getSettlementComparison,
  getSettlements,
  type AnalyticsFilters,
  type SettlementComparisonItem,
  type SettlementListData,
} from '../api/client'

const CACHE_TTL_MS = 30_000

interface CacheEntry<T> {
  expiresAt: number
  promise: Promise<T>
}

export interface SettlementCandidateRequestOptions {
  signal?: AbortSignal
}

const settlementListCache = new Map<string, CacheEntry<SettlementListData>>()
const comparisonCache = new Map<string, CacheEntry<SettlementComparisonItem[]>>()

function cacheKey(filters: object): string {
  return JSON.stringify(filters)
}

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return Boolean(entry && entry.expiresAt > Date.now())
}

function abortError(): Error {
  const error = new Error('请求已取消')
  error.name = 'AbortError'
  return error
}

/** 只取消调用方看到的 Promise，不影响缓存里正在飞行的共享请求。 */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** 短时缓存全量结算单候选；页面首屏重复请求时复用同一个 Promise。 */
export function getCachedSettlements(
  filters: AnalyticsFilters = {},
  options: SettlementCandidateRequestOptions = {},
): Promise<SettlementListData> {
  const key = cacheKey(filters)
  const cached = settlementListCache.get(key)
  if (isFresh(cached)) return withAbort(cached.promise, options.signal)
  const promise = getSettlements(filters).catch((error) => {
    settlementListCache.delete(key)
    throw error
  })
  settlementListCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, promise })
  return withAbort(promise, options.signal)
}

/** 短时缓存全量结算单对比候选，避免详情页与看板重复拉全量。 */
export function getCachedSettlementComparison(
  filters: AnalyticsFilters = {},
  options: SettlementCandidateRequestOptions = {},
): Promise<SettlementComparisonItem[]> {
  const key = cacheKey(filters)
  const cached = comparisonCache.get(key)
  if (isFresh(cached)) return withAbort(cached.promise, options.signal)
  const promise = getSettlementComparison(filters).catch((error) => {
    comparisonCache.delete(key)
    throw error
  })
  comparisonCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, promise })
  return withAbort(promise, options.signal)
}

/** 结算单被删除后清空候选缓存，避免 30 秒内重新查询仍看到旧单。 */
export function invalidateSettlementCandidateCache(): void {
  settlementListCache.clear()
  comparisonCache.clear()
}
