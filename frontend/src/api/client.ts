import {
  asArray,
  buildAnalyticsQuery,
  normalizeImportBatch,
  normalizeImportIssues,
  normalizeOverview,
  normalizeSettlementComparison,
  normalizeSettlementDetail,
  normalizeSettlementList,
  normalizeSettlementRecordsData,
  normalizeSeriesComparison,
  normalizeTrend,
  unwrap,
} from './normalize.ts'
import type {
  AnalyticsFilters,
  AuthUser,
  ImportBatch,
  ImportIssue,
  LoginPayload,
  OverviewData,
  RegisterPayload,
  SettlementComparisonItem,
  SettlementDetail,
  SettlementListData,
  SettlementRecordsData,
  SeriesComparisonData,
  TrendPoint,
} from './types.ts'

export * from './normalize.ts'
export type * from './types.ts'

type JsonRecord = Record<string, unknown>
const API_ROOT = '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/register`, jsonRequest({
    display_name: payload.displayName,
    password: payload.password,
  })))
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/login`, jsonRequest({
    display_name: payload.displayName,
    password: payload.password,
  })))
}

export async function getCurrentUser(): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/me`))
}

export async function logout(): Promise<void> {
  await request(`${API_ROOT}/auth/logout`, { method: 'POST' })
}

export async function getOverview(filters: AnalyticsFilters = {}): Promise<OverviewData> {
  return normalizeOverview(await request(`${API_ROOT}/analytics/overview${buildAnalyticsQuery(filters)}`))
}

export async function getTrend(filters: AnalyticsFilters = {}): Promise<TrendPoint[]> {
  return normalizeTrend(await request(`${API_ROOT}/analytics/trend${buildAnalyticsQuery(filters)}`))
}

export async function getSettlementComparison(filters: AnalyticsFilters = {}): Promise<SettlementComparisonItem[]> {
  return normalizeSettlementComparison(await request(`${API_ROOT}/analytics/settlement-comparison${buildAnalyticsQuery(filters)}`))
}

export async function getSettlementDetail(merchantNo: string, filters: AnalyticsFilters = {}): Promise<SettlementDetail> {
  const path = `${API_ROOT}/analytics/settlements/${encodeURIComponent(merchantNo)}`
  return normalizeSettlementDetail(await request(`${path}${buildAnalyticsQuery(filters)}`), merchantNo)
}

export async function getSettlements(filters: AnalyticsFilters = {}): Promise<SettlementListData> {
  return normalizeSettlementList(await request(`${API_ROOT}/settlements${buildAnalyticsQuery(filters)}`))
}

export async function getSettlementRecords(merchantNo: string): Promise<SettlementRecordsData> {
  const path = `${API_ROOT}/settlements/${encodeURIComponent(merchantNo)}/records`
  return normalizeSettlementRecordsData(await request(path))
}

export async function getSeriesComparison(
  merchantNos: string[],
  filters: AnalyticsFilters = {},
): Promise<SeriesComparisonData> {
  const params = new URLSearchParams()
  merchantNos.forEach((value) => params.append('merchant_no', value))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  const query = params.toString()
  const path = `${API_ROOT}/analytics/series-comparison${query ? `?${query}` : ''}`
  return normalizeSeriesComparison(await request(path))
}

export async function getImports(): Promise<ImportBatch[]> {
  const body = unwrap(await request(`${API_ROOT}/imports`))
  return asArray(Array.isArray(body) ? body : body.imports ?? body.items).map(normalizeImportBatch)
}

export async function getImportIssues(batchId: string | number): Promise<ImportIssue[]> {
  const path = `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues`
  return normalizeImportIssues(await request(path))
}

export async function uploadImports(
  files: File[],
  options: { overwrite?: boolean } = {},
): Promise<ImportBatch[]> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const query = options.overwrite ? '?overwrite=true' : ''
  const body = unwrap(await request(`${API_ROOT}/imports${query}`, { method: 'POST', body: form }))
  return asArray(Array.isArray(body) ? body : body.imports ?? body.items).map(normalizeImportBatch)
}

export function issuesCsvUrl(batchId: string | number): string {
  return `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues.csv`
}

export function recordSourceUrl(recordId: string | number): string {
  return `${API_ROOT}/exports/records/${encodeURIComponent(String(recordId))}/source`
}

async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options?.headers as Record<string, string> ?? {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as JsonRecord
    const message = typeof body.detail === 'string' ? body.detail : body.message
    throw new ApiError(typeof message === 'string' ? message : `请求失败（${response.status}）`, response.status)
  }
  if (response.status === 204) return {}
  return response.json()
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function normalizeAuthUser(payload: unknown): AuthUser {
  const body = unwrap(payload)
  const user = (body.user && typeof body.user === 'object' ? body.user : body) as JsonRecord
  return {
    id: Number(user.id),
    displayName: String(user.display_name ?? user.displayName ?? ''),
  }
}
