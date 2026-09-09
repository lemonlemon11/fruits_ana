export type Grade = 'A' | 'B' | 'C'

export interface AnalyticsFilters {
  startDate?: string
  endDate?: string
  containerId?: string
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
  containerId: string
  metric: number | null
  baseline: number | null
}

export interface OverviewData {
  total: MetricTotal
  grades: GradeMetric[]
  issueCounts: IssueCounts
  operatingAnomalies: OperatingAnomaly[]
}

export interface ContainerComparisonItem extends MetricTotal {
  containerId: string
  containerName: string
  grades: GradeMetric[]
  startDate: string
  endDate: string
}

export interface SettlementSummary {
  afterSalesAmount: number | null
  feeAmount: number | null
  customsTax: number | null
  payableAmount: number | null
}

export interface ContainerRecord {
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

export interface ContainerDetail extends OverviewData {
  containerId: string
  containerName: string
  startDate: string
  endDate: string
  settlement: SettlementSummary
  records: ContainerRecord[]
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
