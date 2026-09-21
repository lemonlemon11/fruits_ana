import type { Grade } from '../utils/grades'

export type { Grade }

/** 侧边导航条目：名称与图标由管理端「菜单管理」维护。 */
export interface AuthMenu {
  routePath: string
  name: string
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
  includeAllSettlements?: boolean
}

/** 结算单列表支持分页；页码参数只对 `/settlements` 生效。 */
export interface SettlementListFilters extends AnalyticsFilters {
  page?: number
  pageSize?: number
}

export interface MetricTotal {
  salesQuantity: number
  salesAmount: number
  weightedAvgPrice: number | null
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

export interface GradeBreakdownData {
  grades: GradeMetric[]
  records: SettlementRecord[]
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
  gradeRaw: string
  grade: Grade | null
  specRaw: string
  headCount: string
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
  gradeDetails: GradeDetailData
}

/** 细分等级（号别）阶梯的一行；区间如 `B6/7` 原样保留（ADR-013 方案 A）。 */
export interface GradeDetailBucket {
  label: string
  grade: Grade
  fruitType: string
  salesQuantity: number
  salesAmount: number
  weightedAvgPrice: number | null
  quantityShare: number | null
  amountShare: number | null
  recordCount: number
  qualityMarks: string[]
}

export interface GradeDetailData {
  buckets: GradeDetailBucket[]
  unrecognized: {
    label: string
    recordCount: number
    salesQuantity: number
  }
  total: MetricTotal
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
  /** 归一后的规格文本，支持区间写法（`3/4`、`9/10`）。 */
  headCount: string
  specKg: string
  salesQuantity: number
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
