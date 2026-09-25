import {
  asArray,
  buildAnalyticsQuery,
  normalizeAskResult,
  normalizeImportBatch,
  normalizeImportConfirmResult,
  normalizeImportIssues,
  normalizeImportJob,
  normalizeImportReviewDraft,
  normalizeEntryDraft,
  normalizeEntryFieldOptions,
  normalizeEntryRead,
  normalizeGradeBreakdown,
  normalizeOverview,
  normalizeSettlementComparison,
  normalizeSettlementDetail,
  normalizeSettlementList,
  normalizeSeriesAnalysis,
  normalizeSeriesComparison,
  normalizeTrend,
  unwrap,
} from './normalize.ts'
import type {
  AppNotification,
  AnalyticsFilters,
  AuthMenu,
  AskHistoryMessage,
  AskResult,
  AuthUser,
  EntryDraft,
  EntryFieldOption,
  EntryPayload,
  EntryRead,
  GradeBreakdownData,
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
  SeriesAnalysisResult,
  SeriesComparisonData,
  TrendPoint,
} from './types.ts'
import { createLogger } from '../utils/logger.ts'
import {
  classifyApiFailure,
  reportAuthExpired,
  reportFatalError,
  type ApiFailureKind,
  type FailureMode,
  type FatalErrorKind,
} from '../utils/errorRecovery.ts'

export * from './normalize.ts'
export type * from './types.ts'

type JsonRecord = Record<string, unknown>
const API_ROOT = '/api'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const logger = createLogger('api')

interface RequestOptions extends RequestInit {
  timeoutMs?: number
  failureMode?: FailureMode
  authFailureMode?: 'redirect' | 'inline'
}

interface FetchApiOptions {
  signal?: AbortSignal
}

export class ApiError extends Error {
  readonly status: number
  readonly requestId: string | null
  readonly method: string
  readonly url: string
  readonly kind: FatalErrorKind | null

  constructor(message: string, status: number, metadata: {
    requestId?: string | null
    method?: string
    url?: string
    kind?: FatalErrorKind | null
  } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.requestId = metadata.requestId ?? null
    this.method = metadata.method ?? 'GET'
    this.url = metadata.url ?? ''
    this.kind = metadata.kind ?? null
  }
}

export async function sendCode(email: string): Promise<void> {
  await request(`${API_ROOT}/auth/send-code`, {
    ...jsonRequest({ email }),
    authFailureMode: 'inline',
  })
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/register`, {
    ...jsonRequest({
      display_name: payload.displayName,
      password: payload.password,
      email: payload.email,
      verification_code: payload.verificationCode,
    }),
    authFailureMode: 'inline',
  }))
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/login`, {
    ...jsonRequest({
      display_name: payload.displayName,
      password: payload.password,
      remember_me: payload.rememberMe === true,
    }),
    authFailureMode: 'inline',
  }))
}

export async function getCurrentUser(): Promise<AuthUser> {
  return normalizeAuthUser(await request(`${API_ROOT}/auth/me`, { authFailureMode: 'inline' }))
}

export async function logout(): Promise<void> {
  await request(`${API_ROOT}/auth/logout`, { method: 'POST' })
}

export async function getNotifications(limit = 20): Promise<NotificationListData> {
  const body = await request(`${API_ROOT}/notifications?limit=${limit}`, { failureMode: 'inline' }) as NotificationListData
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

export async function getOverview(filters: AnalyticsFilters = {}, options: FetchApiOptions = {}): Promise<OverviewData> {
  return normalizeOverview(await request(`${API_ROOT}/analytics/overview${buildAnalyticsQuery(filters)}`, { signal: options.signal }))
}

export async function getGradeBreakdown(filters: AnalyticsFilters = {}, options: FetchApiOptions = {}): Promise<GradeBreakdownData> {
  return normalizeGradeBreakdown(await request(`${API_ROOT}/analytics/grade-breakdown${buildAnalyticsQuery(filters)}`, { signal: options.signal }))
}

export async function getTrend(filters: AnalyticsFilters = {}, options: FetchApiOptions = {}): Promise<TrendPoint[]> {
  return normalizeTrend(await request(`${API_ROOT}/analytics/trend${buildAnalyticsQuery(filters)}`, { signal: options.signal }))
}

export async function getSettlementComparison(filters: AnalyticsFilters = {}, options: FetchApiOptions = {}): Promise<SettlementComparisonItem[]> {
  return normalizeSettlementComparison(await request(`${API_ROOT}/analytics/settlement-comparison${buildAnalyticsQuery(filters)}`, { signal: options.signal }))
}

export async function getSettlementDetail(merchantNo: string, filters: AnalyticsFilters = {}, options: FetchApiOptions = {}): Promise<SettlementDetail> {
  const path = `${API_ROOT}/analytics/settlements/${encodeURIComponent(merchantNo)}`
  return normalizeSettlementDetail(await request(`${path}${buildAnalyticsQuery(filters)}`, { signal: options.signal }), merchantNo)
}

export async function getSettlements(filters: SettlementListFilters = {}, options: FetchApiOptions = {}): Promise<SettlementListData> {
  return normalizeSettlementList(await request(`${API_ROOT}/settlements${buildAnalyticsQuery(filters)}`, { signal: options.signal }))
}

export async function getSettlementReview(merchantNo: string): Promise<ImportReviewDraft> {
  const path = `${API_ROOT}/settlements/${encodeURIComponent(merchantNo)}/review`
  return normalizeImportReviewDraft(await request(path))
}

export async function deleteSettlement(merchantNo: string): Promise<void> {
  await request(`${API_ROOT}/settlements/${encodeURIComponent(merchantNo)}`, {
    method: 'DELETE',
  })
}

export async function getSeriesComparison(
  merchantNos: string[],
  filters: AnalyticsFilters = {},
  options: FetchApiOptions = {},
): Promise<SeriesComparisonData> {
  const params = new URLSearchParams()
  merchantNos.forEach((value) => params.append('merchant_no', value))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  const query = params.toString()
  const path = `${API_ROOT}/analytics/series-comparison${query ? `?${query}` : ''}`
  return normalizeSeriesComparison(await request(path, { signal: options.signal }))
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
  return normalizeImportIssues(await request(path, { failureMode: 'inline' }))
}

export async function resolveImportIssue(batchId: string | number, issueId: string | number): Promise<void> {
  const path = `${API_ROOT}/imports/${encodeURIComponent(String(batchId))}/issues/${encodeURIComponent(String(issueId))}/resolve`
  await request(path, { method: 'POST' })
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

export function settlementTemplatePdfUrl(merchantNo: string): string {
  return `${API_ROOT}/exports/settlements/${encodeURIComponent(merchantNo)}/template.pdf`
}

/** 导出「结算单列表」当前筛选范围，与列表页品牌 / 商号 / 日期筛选一致。 */
export function settlementListExportUrl(filters: SettlementListFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.merchantNo) params.set('merchant_no', filters.merchantNo)
  if (filters.brand) params.set('brand', filters.brand)
  const query = params.toString()
  return `${API_ROOT}/exports/settlements.xlsx${query ? `?${query}` : ''}`
}

function entryPayloadBody(payload: EntryPayload, overwrite: boolean): JsonRecord {
  return {
    merchant_no: payload.merchantNo,
    order_no: payload.orderNo || null,
    container_no: payload.containerNo || null,
    vehicle_no: payload.vehicleNo || null,
    country: payload.country || null,
    market: payload.market || null,
    arrival_date: payload.arrivalDate || null,
    arrival_quantity: payload.arrivalQuantity,
    sales: payload.sales.map((item) => ({
      source_row: item.sourceRow ?? null,
      sale_date: item.saleDate,
      variety: item.variety,
      grade: item.grade,
      head_count: item.headCount,
      spec_kg: item.specKg,
      sales_quantity: item.salesQuantity === '' || item.salesQuantity == null ? null : Number(item.salesQuantity),
      unit_price: Number(item.unitPrice) || 0,
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

export async function getEntryDraft(): Promise<EntryDraft | null> {
  return normalizeEntryDraft(await request(`${API_ROOT}/entry/draft`))
}

export async function saveEntryDraft(payload: EntryPayload, editing: boolean): Promise<EntryDraft> {
  const body = entryPayloadBody(payload, false)
  const draft = normalizeEntryDraft(await request(`${API_ROOT}/entry/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      editing,
      merchant_no: payload.merchantNo,
      order_no: payload.orderNo,
      payload: body,
    }),
  }))
  if (!draft) throw new Error('暂存失败，请稍后重试')
  return draft
}

export async function deleteEntryDraft(): Promise<void> {
  await request(`${API_ROOT}/entry/draft`, { method: 'DELETE' })
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

async function request(url: string, options: RequestOptions = {}): Promise<unknown> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    failureMode = 'auto',
    authFailureMode = 'redirect',
    signal: externalSignal,
    ...fetchOptions
  } = options
  const method = String(fetchOptions.method ?? 'GET').toUpperCase()
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const forwardAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(fetchOptions.headers as Record<string, string> ?? {}) },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as JsonRecord
      logger.error('request failed', {
        url,
        method: fetchOptions.method ?? 'GET',
        status: response.status,
        body,
      })
      const detail = body.detail
      const message = typeof detail === 'string'
        ? detail
        : detail !== undefined
          ? JSON.stringify(detail)
          : body.message
      const requestId = response.headers.get('X-Request-ID')
      const kind = reportApiFailure({
        failureKind: 'http',
        status: response.status,
        method,
        url,
        requestId,
        failureMode,
      })
      if (response.status === 401 && authFailureMode === 'redirect') reportAuthExpired()
      throw new ApiError(
        typeof message === 'string' ? message : `请求失败（${response.status}）`,
        response.status,
        { requestId, method, url, kind },
      )
    }
    if (response.status === 204) return {}
    try {
      return await response.json()
    } catch {
      const kind = reportApiFailure({
        failureKind: 'invalid-response',
        status: response.status,
        method,
        url,
        requestId: response.headers.get('X-Request-ID'),
        failureMode,
      })
      throw new ApiError('服务返回的数据格式异常', response.status, {
        requestId: response.headers.get('X-Request-ID'),
        method,
        url,
        kind,
      })
    }
  } catch (caught) {
    if (timedOut) {
      const kind = reportApiFailure({
        failureKind: 'timeout',
        status: null,
        method,
        url,
        requestId: null,
        failureMode,
      })
      throw new ApiError('请求超时，请稍后重试', 0, { method, url, kind })
    }
    if (controller.signal.aborted) {
      const error = new Error('请求已取消')
      error.name = 'AbortError'
      throw error
    }
    if (!(caught instanceof ApiError)) {
      const kind = reportApiFailure({
        failureKind: 'network',
        status: null,
        method,
        url,
        requestId: null,
        failureMode,
      })
      const error = new ApiError('网络异常，请检查连接后重试', 0, { method, url, kind })
      logger.error('request error', { url, method, error: caught })
      throw error
    }
    logger.error('request error', {
      url,
      method,
      error: caught,
    })
    throw caught
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
  }
}

function reportApiFailure(input: {
  failureKind: ApiFailureKind
  status: number | null
  method: string
  url: string
  requestId: string | null
  failureMode: FailureMode
}): FatalErrorKind | null {
  const kind = classifyApiFailure({
    kind: input.failureKind,
    status: input.status,
    method: input.method,
    url: input.url,
    requestId: input.requestId,
    failureMode: input.failureMode,
  })
  if (kind) {
    reportFatalError({
      kind,
      from: currentLocationPath(),
      status: input.status,
      requestId: input.requestId,
      source: 'api',
    })
  }
  return kind
}

function currentLocationPath(): string | null {
  if (typeof window === 'undefined' || !window.location) return null
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
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
  const source = (body.user && typeof body.user === 'object' ? body.user : body) as JsonRecord
  return {
    id: Number(source.id),
    displayName: String(source.display_name ?? source.displayName ?? ''),
    permissions: Array.isArray(source.permissions) ? source.permissions.map(String) : [],
    menus: normalizeAuthMenus(source.menus),
  }
}

function normalizeAuthMenus(value: unknown): AuthMenu[] {
  return asArray(value)
    .map((entry) => {
      const item = entry as JsonRecord
      const routePath = String(item.route_path ?? item.routePath ?? '').trim()
      if (!routePath) return null
      const icon = item.icon === null || item.icon === undefined ? null : String(item.icon)
      const permissionCode =
        item.permission_code === null || item.permission_code === undefined
          ? null
          : String(item.permission_code)
      const sortOrder = Number(item.sort_order ?? item.sortOrder ?? 0)
      return {
        routePath,
        name: String(item.name ?? ''),
        icon,
        permissionCode,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive: item.is_active === undefined && item.isActive === undefined
          ? true
          : Boolean(item.is_active ?? item.isActive),
      }
    })
    .filter((item): item is AuthMenu => item !== null)
}
