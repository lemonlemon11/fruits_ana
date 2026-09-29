import type { Grade } from '../utils/grades'

export type { Grade }

/** 侧边导航条目：directory 为一级分组，名称/图标/层级由管理端「菜单管理」维护。 */
export interface AuthMenu {
  id: number
  /** directory（一级菜单）没有路由，叶子菜单必有路由。 */
  routePath: string | null
  name: string
  parentId: number | null
  menuType: string
  icon: string | null
  permissionCode: string | null
  sortOrder: number
  isActive: boolean
}

export interface AuthUser {
  id: number
  displayName: string
  email?: string
  permissions: string[]
  menus: AuthMenu[]
}

export interface AppNotification {
  id: number
  title: string
  content: string
  notification_type: 'announcement' | 'task' | 'system'
  priority: 'normal' | 'important' | 'urgent'
  publish_at: string | null
  is_read: boolean
  read_at: string | null
}

export interface NotificationListData {
  items: AppNotification[]
  unread_count: number
}

export interface LoginPayload {
  displayName: string
  password: string
  rememberMe?: boolean
}

export interface RegisterPayload extends LoginPayload {
  email: string
  verificationCode: string
}

export interface AnalyticsFilters {
  startDate?: string
  endDate?: string
  merchantNo?: string
  country?: string
  market?: string
  includeAllSettlements?: boolean
}

/** 筛选条选项：品牌/国家/市场为窗口内有销售的结算单计数；年度/月度为有销售记录的期间（降序）。 */
export interface FilterOptionCount {
  name: string
  settlementCount: number
}

export interface FilterOptionsData {
  brands: FilterOptionCount[]
  countries: FilterOptionCount[]
  markets: FilterOptionCount[]
  years: number[]
  months: string[]
}

/** 结算单列表支持分页；页码参数只对 `/settlements` 生效。 */
export interface SettlementListFilters extends AnalyticsFilters {
  page?: number
  pageSize?: number
  brand?: string
  sortBy?: SettlementSortBy
  sortOrder?: SettlementSortOrder
}

export type SettlementSortBy =
  | 'arrival_date'
  | 'total_quantity'
  | 'grade_a'
  | 'grade_b'
  | 'sales_amount'
  | 'average_price'
  | 'confirmed_at'

export type SettlementSortOrder = 'asc' | 'desc'

export interface MetricTotal {
  salesQuantity: number
  salesAmount: number
  weightedAvgPrice: number | null
  /** 总柜数口径 = 结算单数（import_batch_id 去重，一柜两单不去重柜号），仅 overview total 下发。 */
  containerCount?: number
}

export interface GradeMetric extends MetricTotal {
  grade: Grade
  quantityShare: number | null
}

export interface TrendPoint extends MetricTotal {
  date: string
  grades: GradeMetric[]
}

export interface IssueCounts {
  total: number
  [key: string]: number
}

export interface OperatingAnomaly {
  type: string
  reason: string
  merchantNo: string
  merchantNoNormalized?: string
  metric: number | null
  baseline: number | null
}

export interface OverviewData {
  total: MetricTotal
  grades: GradeMetric[]
  issueCounts: IssueCounts
  operatingAnomalies: OperatingAnomaly[]
}

/** 各市场×品牌柜数（口径：结算单/商号数，柜号有一柜两单不可用），供「卖得怎么样」市场销售分析。 */
export interface BrandMarketContainerStat {
  market: string
  brand: string
  containerCount: number
}

export interface GradeBreakdownData {
  grades: GradeMetric[]
  records: SettlementRecord[]
  marketBrandContainers: BrandMarketContainerStat[]
}

export interface SettlementComparisonItem extends MetricTotal {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  containerNo: string
  vehicleNo: string
  /** 品牌（单号中文前缀），后端 series_name 的同一口径。 */
  series: string
  grades: GradeMetric[]
  startDate: string
  endDate: string
  rank?: { salesQuantity?: number; salesAmount?: number; weightedAvgPrice?: number }
  salesQuantityShare?: number | null
  salesAmountShare?: number | null
  gradeContribution?: Record<Grade, number | null>
}

export interface SettlementSummary {
  afterSalesAmount: number | null
  goodsAmount: number | null
  feeAmount: number | null
  customsTax: number | null
  payableAmount: number | null
}

export interface SettlementRecord {
  id: number | string
  sourceFileId: number | string | null
  saleDate: string
  fruitType: string
  brand: string
  gradeRaw: string
  grade: Grade | null
  specRaw: string
  headCount: string
  specKg: string
  quantity: number
  unitPrice: number
  amount: number
  remark: string
  salesRegion: string
}

export interface SettlementDetail extends OverviewData {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  country: string
  /** 品牌口径与列表筛选一致：brand 列优先，回退单号中文前缀；供规格表品牌列使用。 */
  brand: string
  containerNo: string
  vehicleNo: string
  sourceType: 'import' | 'manual'
  market: string
  arrivalDate: string
  arrivalQuantity: number | null
  startDate: string
  endDate: string
  settlement: SettlementSummary
  records: SettlementRecord[]
}

export interface SettlementListItem {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  brand: string
  fruitType: string
  series: string
  containerNo: string
  vehicleNo: string
  arrivalDate: string
  saleDateStart: string
  saleDateEnd: string
  salesAmount: number
  totalQuantity: number
  averagePrice: number | null
  confirmedAt: string
  gradeQuantities: Record<Grade, number>
  recordCount: number
}

export interface SettlementDateRange {
  startDate: string
  endDate: string
  isDefault: boolean
}

export interface SettlementPagination {
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface SettlementListData {
  dateRange: SettlementDateRange | null
  settlements: SettlementListItem[]
  pagination: SettlementPagination | null
  brandTotals: BrandTotal[]
}

export interface BrandTotal {
  brand: string
  totalQuantity: number
  settlementCount: number
}

export interface SeriesAggregate {
  total: MetricTotal
  grades: GradeMetric[]
  gradeAmountShares: Record<Grade, number | null>
}

export interface SeriesComparisonItem extends SeriesAggregate {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  series: string
  containerNo: string
  vehicleNo: string
  startDate: string
  endDate: string
}

export interface SeriesComparisonGroup extends SeriesAggregate {
  name: string
  merchantNos: string[]
  settlementCount: number
}

export interface SeriesComparisonData {
  settlements: SeriesComparisonItem[]
  series: SeriesComparisonGroup[]
  total: SeriesAggregate
}

export interface SeriesAnalysisResult {
  content: string
  model: string
  generatedAt: string
  cached: boolean
}

export interface AskHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AskStep {
  tool: string
  args: Record<string, unknown>
  summary: string
}

export interface AskResult {
  answer: string
  steps: AskStep[]
  model: string
}

export interface EntrySaleItem {
  sourceRow?: number | null
  saleDate: string
  variety: string
  grade: string
  /** 归一后的规格文本，支持区间写法（`3/4`、`9/10`）。 */
  headCount: string
  specKg: string
  salesQuantity: number | ''
  unitPrice: number
  /** 导入复核时保留文件原值；手工录单不填，由系统按数量×单价计算。 */
  amount?: number
  remark: string
}

export interface EntryAfterSaleItem {
  sourceRow?: number | null
  content: string
  summary: string
  amount: number
}

export interface EntryFeeItem {
  sourceRow?: number | null
  name: string
  amount: number
  isCustom: boolean
}

export interface EntryPayload {
  merchantNo: string
  orderNo: string
  containerNo: string
  vehicleNo: string
  country: string
  market: string
  arrivalDate: string
  arrivalQuantity: number | null
  sales: EntrySaleItem[]
  afterSales: EntryAfterSaleItem[]
  fees: EntryFeeItem[]
  overwrite?: boolean
}

export interface EntryRead extends Omit<EntryPayload, 'overwrite'> {
  sourceType: 'import' | 'manual'
}

export interface EntryDraft {
  updatedAt: string
  editing: boolean
  merchantNo: string
  orderNo: string
  salesCount: number
  payload: EntryPayload
}

export interface EntryFieldOption {
  field: 'market' | 'variety'
  value: string
  sortOrder: number
}

export interface ImportBatch {
  id: number | string
  fileName: string
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  importedAt: string
  status: string
  successCount: number
  warningCount: number
  failureCount: number
  errorSummary: string
}

export interface ImportIssue {
  id: number | string
  rowNumber: number | null
  issueType: string
  severity: string
  fieldName: string
  message: string
  rawValue: string
  resolved?: boolean
  resolvedAt?: string | null
}

export interface ImportDraftSummary {
  token: string
  fileName: string
  merchantNo: string
  orderNo: string
  issueCount: number
  hasError: boolean
  version: number
  status?: string
}

export interface ImportPreviewFailure {
  fileName: string
  error: string
}

export interface ImportJob {
  token: string
  status: string
  fileCount: number
  draftCount: number
  confirmedCount: number
  createdAt: string
  drafts: ImportDraftSummary[]
  failures: ImportPreviewFailure[]
}

export interface ImportReviewIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  section?: string
  row?: number | null
  field?: string
  rawValue?: string
}

export interface ImportReviewPayload extends EntryPayload {
  fileSummary: Record<string, string>
  computedSummary: Record<string, string>
  issues: ImportReviewIssue[]
}

export interface ImportReviewDraft {
  jobToken: string
  jobStatus: string
  draftToken: string
  version: number
  fileName: string
  payload: ImportReviewPayload
  originalPayload: ImportReviewPayload
}

export interface ImportConfirmItem {
  draftToken: string
  fileName: string
  merchantNo: string
  batchId: number | string
  status: string
  errorCount: number
  warningCount: number
}

export interface ImportConfirmResult {
  jobToken: string
  status: string
  confirmed: ImportConfirmItem[]
}
