import {
  asArray,
  buildAnalyticsQuery,
  normalizeAskResult,
  normalizeImportBatch,
  normalizeImportConfirmResult,
  normalizeImportIssues,
  normalizeImportJob,
  normalizeImportReviewDraft,
  normalizeEntryFieldOptions,
  normalizeEntryRead,
  normalizeOverview,
  normalizeSettlementComparison,
  normalizeSettlementDetail,
  normalizeSettlementList,
  normalizeSettlementRecordsData,
  normalizeSeriesAnalysis,
  normalizeSeriesComparison,
  normalizeTrend,
  unwrap,
} from './normalize.ts'
import type {
  AppNotification,
  AnalyticsFilters,
  AskHistoryMessage,
  AskResult,
  AuthUser,
  EntryFieldOption,
  EntryPayload,
  EntryRead,
  ImportBatch,
  ImportConfirmResult,
  ImportIssue,
  ImportJob,
  ImportReviewDraft,
  LoginPayload,
  NotificationListData,
  OverviewData,
  RegisterPayload,
  SettlementComparisonItem,
  SettlementDetail,
  SettlementListData,
  SettlementListFilters,
  SettlementRecordsData,
  SeriesAnalysisResult,
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
    remember_me: payload.rememberMe === true,
  })))
}

export async function getCurrentUser(): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/me`))
}

export async function logout(): Promise<void> {
  await request(`${API_ROOT}/auth/logout`, { method: 'POST' })
}

export async function getNotifications(limit = 20): Promise<NotificationListData> {
  const body = await request(`${API_ROOT}/notifications?limit=${limit}`) as NotificationListData
  return {
    items: Array.isArray(body.items) ? body.items : [],
    unread_count: Number(body.unread_count ?? 0),
  }
}

export async function markNotificationRead(notificationId: number | string): Promise<AppNotification> {
  return await request(`${API_ROOT}/notifications/${encodeURIComponent(String(notificationId))}/read`, { method: 'POST' }) as AppNotification
}

export async function markAllNotificationsRead(): Promise<number> {
  const body = await request(`${API_ROOT}/notifications/read-all`, { method: 'POST' }) as { unread_count?: number }
  return Number(body.unread_count ?? 0)
}

/** 顺仔问答：只发问题与最近几条历史，取数口径全部由后端决定。 */
export async function askQuestion(payload: {
  question: string
  history: AskHistoryMessage[]
}): Promise<AskResult> {
  return normalizeAskResult(await request(`${API_ROOT}/ask`, jsonRequest(payload)))
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

export async function getSettlements(filters: SettlementListFilters = {}): Promise<SettlementListData> {
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

/** 按勾选的结算单生成 AI 分析结论；相同条件会直接返回后端缓存。 */
export async function generateSeriesAnalysis(
  merchantNos: string[],
  filters: AnalyticsFilters = {},
  options: { refresh?: boolean } = {},
): Promise<SeriesAnalysisResult> {
  const body = {
    merchant_no: merchantNos,
    start_date: filters.startDate || null,
    end_date: filters.endDate || null,
    refresh: options.refresh === true,
  }
  const path = `${API_ROOT}/analytics/series-comparison/analysis`
  return normalizeSeriesAnalysis(await request(path, jsonRequest(body)))
}

/** 按勾选的结算单生成「等级细分」AI 小结；相同条件会直接返回后端缓存。 */
export async function generateGradeDetailAnalysis(
  merchantNos: string[],
  filters: AnalyticsFilters = {},
  options: { refresh?: boolean } = {},
): Promise<SeriesAnalysisResult> {
  const body = {
    merchant_no: merchantNos,
    start_date: filters.startDate || null,
    end_date: filters.endDate || null,
    refresh: options.refresh === true,
  }
  const path = `${API_ROOT}/analytics/grade-detail/analysis`
  return normalizeSeriesAnalysis(await request(path, jsonRequest(body)))
}

/** 生成当前结算单与同品牌其他结算单的对比分析；相同条件会返回缓存。 */
export async function generateSettlementAnalysis(
  merchantNo: string,
  filters: AnalyticsFilters = {},
  options: { refresh?: boolean } = {},
): Promise<SeriesAnalysisResult> {
  const body = {
    start_date: filters.startDate || null,
    end_date: filters.endDate || null,
    refresh: options.refresh === true,
  }
  const path = `${API_ROOT}/analytics/settlements/${encodeURIComponent(merchantNo)}/analysis`
  return normalizeSeriesAnalysis(await request(path, jsonRequest(body)))
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

/** 新模板多文件上传：只生成草稿，不直接入库。 */
export async function previewImports(files: File[]): Promise<ImportJob> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  return normalizeImportJob(await request(`${API_ROOT}/imports/preview`, { method: 'POST', body: form }))
}

export async function getImportJob(jobToken: string): Promise<ImportJob> {
  return normalizeImportJob(await request(`${API_ROOT}/imports/jobs/${encodeURIComponent(jobToken)}`))
}

export async function getImportDraft(jobToken: string, draftToken: string): Promise<ImportReviewDraft> {
  const path = `${API_ROOT}/imports/jobs/${encodeURIComponent(jobToken)}/drafts/${encodeURIComponent(draftToken)}`
  return normalizeImportReviewDraft(await request(path))
}

export async function updateImportDraft(
  jobToken: string,
  draftToken: string,
  payload: EntryPayload,
): Promise<ImportReviewDraft> {
  const path = `${API_ROOT}/imports/jobs/${encodeURIComponent(jobToken)}/drafts/${encodeURIComponent(draftToken)}`
  return normalizeImportReviewDraft(await request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entryPayloadBody(payload, false)),
  }))
}

export async function confirmImportJob(jobToken: string, options: { force?: boolean } = {}): Promise<ImportConfirmResult> {
  const path = `${API_ROOT}/imports/jobs/${encodeURIComponent(jobToken)}/confirm`
  return normalizeImportConfirmResult(await request(path, jsonRequest({ force: options.force === true })))
}

export async function discardImportJob(jobToken: string): Promise<ImportJob> {
  const path = `${API_ROOT}/imports/jobs/${encodeURIComponent(jobToken)}/discard`
  return normalizeImportJob(await request(path, { method: 'POST' }))
}

export function issuesCsvUrl(batchId: string | number): string {
  return `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues.csv`
}

export function recordSourceUrl(recordId: string | number): string {
  return `${API_ROOT}/exports/records/${encodeURIComponent(String(recordId))}/source`
}

/** 单张结算单导出：版式与结算单模板一致，手工单与导入件同一入口。 */
export function settlementTemplateExportUrl(merchantNo: string): string {
  return `${API_ROOT}/exports/settlements/${encodeURIComponent(merchantNo)}/template.xlsx`
}

function entryPayloadBody(payload: EntryPayload, overwrite: boolean): JsonRecord {
  return {
    merchant_no: payload.merchantNo,
    order_no: payload.orderNo || null,
    container_no: payload.containerNo || null,
    vehicle_no: payload.vehicleNo || null,
    market: payload.market || null,
    arrival_date: payload.arrivalDate || null,
    arrival_quantity: payload.arrivalQuantity,
    sales: payload.sales.map((item) => ({
      source_row: item.sourceRow ?? null,
      sale_date: item.saleDate,
      variety: item.variety,
      head_count: item.headCount,
      spec_kg: item.specKg,
      sales_quantity: item.salesQuantity,
      unit_price: item.unitPrice,
      amount: item.amount,
      remark: item.remark || null,
    })),
    after_sales: payload.afterSales.map((item) => ({
      source_row: item.sourceRow ?? null,
      content: item.content,
      summary: item.summary,
      amount: item.amount,
    })),
    fees: payload.fees.map((item) => ({
      source_row: item.sourceRow ?? null,
      name: item.name,
      amount: item.amount,
      is_custom: item.isCustom,
    })),
    overwrite,
  }
}

export async function getEntryFieldOptions(field: 'market' | 'variety'): Promise<EntryFieldOption[]> {
  return normalizeEntryFieldOptions(await request(`${API_ROOT}/entry/field-options?field=${field}`))
}

export async function getEntry(merchantNo: string): Promise<EntryRead> {
  return normalizeEntryRead(await request(`${API_ROOT}/entry/${encodeURIComponent(merchantNo)}`))
}

export async function saveEntry(payload: EntryPayload, options: { overwrite?: boolean } = {}): Promise<EntryRead> {
  const body = entryPayloadBody(payload, options.overwrite === true)
  return normalizeEntryRead(await request(`${API_ROOT}/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function updateEntry(merchantNo: string, payload: EntryPayload): Promise<EntryRead> {
  const body = entryPayloadBody(payload, true)
  return normalizeEntryRead(await request(`${API_ROOT}/entry/${encodeURIComponent(merchantNo)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export function entryExportUrl(merchantNo: string): string {
  return `${API_ROOT}/entry/${encodeURIComponent(merchantNo)}/export.xlsx`
}

async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options?.headers as Record<string, string> ?? {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as JsonRecord
    const detail = body.detail
    const message = typeof detail === 'string'
      ? detail
      : detail !== undefined
        ? JSON.stringify(detail)
        : body.message
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
    permissions: Array.isArray(user.permissions) ? user.permissions.map(String) : [],
  }
}
