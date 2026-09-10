export type Grade = 'A' | 'B' | 'C'

export interface AuthUser {
  id: number
  displayName: string
}

export interface LoginPayload {
  displayName: string
  password: string
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
  orderNo: string
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
  gradeRaw: string
  grade: Grade | null
  specRaw: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface SettlementDetail extends OverviewData {
  merchantNo: string
  orderNo: string
  containerNo: string
  vehicleNo: string
  startDate: string
  endDate: string
  settlement: SettlementSummary
  records: SettlementRecord[]
}

export interface SettlementListItem {
  merchantNo: string
  orderNo: string
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
  orderNo: string
  containerNo: string
  vehicleNo: string
  records: SettlementRecord[]
}

export interface PriceSpread {
  aMinusB: number | null
  bMinusC: number | null
  bDiscountVsA: number | null
  gradePrices: Record<Grade, number | null>
}

export interface SeriesAggregate {
  total: MetricTotal
  grades: GradeMetric[]
  gradeAmountShares: Record<Grade, number | null>
  spread: PriceSpread
}

export interface SeriesComparisonItem extends SeriesAggregate {
  merchantNo: string
  orderNo: string
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

export interface ImportBatch {
  id: number | string
  fileName: string
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
