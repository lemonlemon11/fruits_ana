import {
  asArray,
  buildAnalyticsQuery,
  normalizeContainerComparison,
  normalizeContainerDetail,
  normalizeImportBatch,
  normalizeImportIssues,
  normalizeOverview,
  normalizeTrend,
  unwrap,
} from './normalize.ts'
import type {
  AnalyticsFilters,
  ContainerComparisonItem,
  ContainerDetail,
  ImportBatch,
  ImportIssue,
  OverviewData,
  TrendPoint,
} from './types.ts'

export * from './normalize.ts'
export type * from './types.ts'

type JsonRecord = Record<string, unknown>
const API_ROOT = '/api'

export async function getOverview(filters: AnalyticsFilters = {}): Promise<OverviewData> {
  return normalizeOverview(await request(`${API_ROOT}/analytics/overview${buildAnalyticsQuery(filters)}`))
}

export async function getTrend(filters: AnalyticsFilters = {}): Promise<TrendPoint[]> {
  return normalizeTrend(await request(`${API_ROOT}/analytics/trend${buildAnalyticsQuery(filters)}`))
}

export async function getContainerComparison(filters: AnalyticsFilters = {}): Promise<ContainerComparisonItem[]> {
  return normalizeContainerComparison(await request(`${API_ROOT}/analytics/container-comparison${buildAnalyticsQuery(filters)}`))
}

export async function getContainerDetail(id: string, filters: AnalyticsFilters = {}): Promise<ContainerDetail> {
  const path = `${API_ROOT}/analytics/containers/${encodeURIComponent(id)}`
  return normalizeContainerDetail(await request(`${path}${buildAnalyticsQuery(filters)}`), id)
}

export async function getImports(): Promise<ImportBatch[]> {
  const body = unwrap(await request(`${API_ROOT}/imports`))
  return asArray(Array.isArray(body) ? body : body.imports ?? body.items).map(normalizeImportBatch)
}

export async function getImportIssues(batchId: string | number): Promise<ImportIssue[]> {
  const path = `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues`
  return normalizeImportIssues(await request(path))
}

export async function uploadImports(files: File[]): Promise<ImportBatch[]> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const body = unwrap(await request(`${API_ROOT}/imports`, { method: 'POST', body: form }))
  return asArray(Array.isArray(body) ? body : body.imports ?? body.items).map(normalizeImportBatch)
}

export function issuesCsvUrl(batchId: string | number): string {
  return `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues.csv`
}

export function recordSourceUrl(recordId: string | number): string {
  return `${API_ROOT}/exports/records/${encodeURIComponent(String(recordId))}/source`
}

async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as JsonRecord
    const message = typeof body.detail === 'string' ? body.detail : body.message
    throw new Error(typeof message === 'string' ? message : `请求失败（${response.status}）`)
  }
  if (response.status === 204) return {}
  return response.json()
}
