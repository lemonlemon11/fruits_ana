import type { Grade } from '../utils/grades'

export type { Grade }

export interface AuthUser {
  id: number
  displayName: string
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

export type RegisterPayload = LoginPayload

export interface AnalyticsFilters {
  startDate?: string
  endDate?: string
  merchantNo?: string
  includeAllSettlements?: boolean
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

export interface SettlementComparisonItem extends MetricTotal {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  containerNo: string
  vehicleNo: string
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
  series: string
  containerNo: string
  vehicleNo: string
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

export interface SettlementListData {
  dateRange: SettlementDateRange | null
  settlements: SettlementListItem[]
}

export interface SettlementRecordsData {
  merchantNo: string
  merchantNoNormalized: string
  orderNo: string
  orderNoNormalized: string
  containerNo: string
  vehicleNo: string
  records: SettlementRecord[]
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
}
