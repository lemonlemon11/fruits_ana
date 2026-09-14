import type {
  AnalyticsFilters,
  Grade,
  GradeDetailData,
  GradeMetric,
  ImportBatch,
  ImportIssue,
  IssueCounts,
  MetricTotal,
  OperatingAnomaly,
  OverviewData,
  PriceSpread,
  SeriesAggregate,
  SeriesAnalysisResult,
  SeriesComparisonData,
  SettlementComparisonItem,
  SettlementDetail,
  SettlementListData,
  SettlementListItem,
  SettlementRecord,
  SettlementRecordsData,
  TrendPoint,
} from './types.ts'

type JsonRecord = Record<string, unknown>

const GRADES: Grade[] = ['A', 'B', 'C']

/** 与后端 `series_name` 保持一致：识别不出品牌时使用该名称。 */
export const UNKNOWN_SERIES = '未识别品牌'

function emptyGradeRecord<T>(value: T): Record<Grade, T> {
  return { A: value, B: value, C: value }
}

export function gradeLabel(grade: Grade): string {
  return grade === 'C' ? 'C果（含BC）' : `${grade}果`
}

export function buildAnalyticsQuery(filters: AnalyticsFilters): string {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.merchantNo) params.set('merchant_no', filters.merchantNo)
  if (filters.includeAllSettlements) params.set('include_all_settlements', 'true')
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function normalizeGradeMetrics(input: unknown): GradeMetric[] {
  const rows = asArray(input)
  return GRADES.map((grade) => {
    const matches = rows.filter((row) => normalizeGrade(row.grade) === grade)
    const salesQuantity = sum(matches, 'sales_quantity', 'salesQuantity', 'quantity')
    const salesAmount = sum(matches, 'sales_amount', 'salesAmount', 'amount')
    const explicitPrice = nullableNumber(pick(matches[0], 'weighted_avg_price', 'weightedAvgPrice', 'avg_price'))
    const explicitShare = matches.reduce<number | null>((total, row) => {
      const share = nullableNumber(pick(row, 'quantity_share', 'quantityShare', 'share'))
      return share === null ? total : (total ?? 0) + share
    }, null)
    return {
      grade,
      salesQuantity,
      salesAmount,
      weightedAvgPrice: salesQuantity > 0 ? salesAmount / salesQuantity : explicitPrice,
      quantityShare: explicitShare,
    }
  })
}

export function normalizeOverview(payload: unknown): OverviewData {
  const body = unwrap(payload)
  const grades = normalizeGradeMetrics(body.grades ?? body.grade_summary)
  const explicitTotal = asRecord(body.total ?? body.summary)
  const salesQuantity = numberOr(
    pick(explicitTotal, 'sales_quantity', 'salesQuantity', 'quantity'),
    grades.reduce((total, row) => total + row.salesQuantity, 0),
  )
  const salesAmount = numberOr(
    pick(explicitTotal, 'sales_amount', 'salesAmount', 'amount'),
    grades.reduce((total, row) => total + row.salesAmount, 0),
  )
  return {
    total: {
      salesQuantity,
      salesAmount,
      weightedAvgPrice: nullableNumber(pick(explicitTotal, 'weighted_avg_price', 'weightedAvgPrice'))
        ?? (salesQuantity ? salesAmount / salesQuantity : null),
    },
    grades: grades.map((row) => ({
      ...row,
      quantityShare: row.quantityShare ?? (salesQuantity ? row.salesQuantity / salesQuantity : null),
    })),
    issueCounts: normalizeIssueCounts(body.issue_counts ?? body.issueCounts),
    operatingAnomalies: asArray(body.operating_anomalies ?? body.operatingAnomalies).map(normalizeAnomaly),
  }
}

export function normalizeTrend(payload: unknown): TrendPoint[] {
  const body = unwrap(payload)
  const rows = asArray(Array.isArray(body) ? body : body.trend ?? body.items ?? body.data)
  const dates = new Map<string, JsonRecord[]>()
  rows.forEach((row) => {
    const date = stringOr(pick(row, 'sale_date', 'date', 'day'), '')
    if (date) dates.set(date, [...(dates.get(date) ?? []), row])
  })
  return [...dates.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dateRows]) => {
    const nestedGrades = dateRows.flatMap((row) => asArray(row.grades ?? row.grade_summary))
    const grades = normalizeGradeMetrics(nestedGrades.length ? nestedGrades : dateRows)
    const summary = asRecord(dateRows[0].total ?? dateRows[0].summary ?? dateRows[0])
    const salesQuantity = numberOr(pick(summary, 'sales_quantity', 'salesQuantity', 'quantity'), sumMetric(grades, 'salesQuantity'))
    const salesAmount = numberOr(pick(summary, 'sales_amount', 'salesAmount', 'amount'), sumMetric(grades, 'salesAmount'))
    return {
      date,
      grades,
      salesQuantity,
      salesAmount,
      weightedAvgPrice: nullableNumber(pick(summary, 'weighted_avg_price', 'weightedAvgPrice', 'avg_price'))
        ?? (salesQuantity ? salesAmount / salesQuantity : null),
    }
  })
}

export function normalizeSettlementComparison(payload: unknown): SettlementComparisonItem[] {
  const body = unwrap(payload)
  return asArray(Array.isArray(body) ? body : body.settlements ?? body.items ?? body.comparison).map((row) => {
    const overview = normalizeOverview(row)
    const merchantNo = stringOr(pick(row, 'merchant_no', 'merchantNo'), '未编号')
    return {
      ...overview.total,
      merchantNo,
      merchantNoNormalized: stringOr(pick(row, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
      orderNo: stringOr(pick(row, 'order_no', 'orderNo'), ''),
      orderNoNormalized: stringOr(pick(row, 'order_no_normalized', 'orderNoNormalized'), ''),
      containerNo: stringOr(pick(row, 'container_no', 'containerNo'), ''),
      vehicleNo: stringOr(pick(row, 'vehicle_no', 'vehicleNo'), ''),
      grades: overview.grades,
      startDate: stringOr(pick(row, 'start_date', 'startDate', 'sale_start'), ''),
      endDate: stringOr(pick(row, 'end_date', 'endDate', 'sale_end'), ''),
      rank: normalizeRank(row.rank),
      salesQuantityShare: nullableNumber(pick(row, 'sales_quantity_share', 'salesQuantityShare')),
      salesAmountShare: nullableNumber(pick(row, 'sales_amount_share', 'salesAmountShare')),
      gradeContribution: normalizeGradeContribution(row.grade_contribution ?? row.gradeContribution),
    }
  })
}

function normalizeRank(value: unknown): SettlementComparisonItem['rank'] {
  const record = asRecord(value)
  return {
    salesQuantity: nullableNumber(pick(record, 'sales_quantity', 'salesQuantity')) ?? undefined,
    salesAmount: nullableNumber(pick(record, 'sales_amount', 'salesAmount')) ?? undefined,
    weightedAvgPrice: nullableNumber(pick(record, 'weighted_avg_price', 'weightedAvgPrice')) ?? undefined,
  }
}

function normalizeGradeContribution(value: unknown): SettlementComparisonItem['gradeContribution'] {
  const record = asRecord(value)
  return { A: nullableNumber(record.A), B: nullableNumber(record.B), C: nullableNumber(record.C) }
}

export function normalizeSettlementDetail(payload: unknown, merchantNo: string): SettlementDetail {
  const body = unwrap(payload)
  const overview = normalizeOverview(body)
  const settlement = asRecord(body.settlement ?? body.settlement_summary ?? body.summary_detail)
  const period = asRecord(body.sales_period ?? body.salesPeriod)
  return {
    ...overview,
    merchantNo: stringOr(pick(body, 'merchant_no', 'merchantNo'), merchantNo),
    merchantNoNormalized: stringOr(pick(body, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
    orderNo: stringOr(pick(body, 'order_no', 'orderNo'), ''),
    orderNoNormalized: stringOr(pick(body, 'order_no_normalized', 'orderNoNormalized'), ''),
    containerNo: stringOr(pick(body, 'container_no', 'containerNo'), ''),
    vehicleNo: stringOr(pick(body, 'vehicle_no', 'vehicleNo'), ''),
    startDate: stringOr(pick(period, 'start_date', 'startDate'), ''),
    endDate: stringOr(pick(period, 'end_date', 'endDate'), ''),
    settlement: {
      afterSalesAmount: nullableNumber(pick(settlement, 'after_sales_amount', 'after_sale_amount', 'afterSalesAmount')),
      feeAmount: nullableNumber(pick(settlement, 'fee_amount', 'feeAmount', 'expense_amount', 'expenseAmount', 'total_expense')),
      customsTax: nullableNumber(pick(settlement, 'customs_tax', 'customsTax', 'customs_amount')),
      payableAmount: nullableNumber(pick(settlement, 'payable_amount', 'payableAmount', 'settlement_amount', 'settlementAmount')),
    },
    records: normalizeSettlementRecords(body.records ?? body.sale_records),
  }
}

export function normalizeSettlementRecords(input: unknown): SettlementRecord[] {
  return asArray(input).map((row) => ({
    id: idOrEmpty(pick(row, 'id', 'record_id', 'recordId')),
    sourceFileId: nullableId(pick(row, 'source_file_id', 'sourceFileId')),
    saleDate: stringOr(pick(row, 'sale_date', 'saleDate'), ''),
    fruitType: stringOr(pick(row, 'fruit_type', 'fruitType'), '榴莲'),
    gradeRaw: stringOr(pick(row, 'grade_raw', 'gradeRaw'), ''),
    grade: normalizeGrade(row.grade),
    specRaw: stringOr(pick(row, 'spec_raw', 'specRaw'), ''),
    quantity: numberOr(row.quantity, 0),
    unitPrice: numberOr(pick(row, 'unit_price', 'unitPrice'), 0),
    amount: numberOr(row.amount, 0),
    remark: stringOr(pick(row, 'remark'), ''),
    salesRegion: stringOr(pick(row, 'sales_region', 'salesRegion'), ''),
  }))
}

export function normalizeSettlementList(payload: unknown): SettlementListData {
  const body = unwrap(payload)
  const range = asRecord(body.date_range ?? body.dateRange)
  const startDate = stringOr(pick(range, 'start_date', 'startDate'), '')
  const endDate = stringOr(pick(range, 'end_date', 'endDate'), '')
  return {
    dateRange: startDate && endDate
      ? {
          startDate,
          endDate,
          isDefault: pick(range, 'is_default', 'isDefault') === true,
        }
      : null,
    settlements: asArray(Array.isArray(body) ? body : body.settlements ?? body.items)
      .map(normalizeSettlementListItem),
  }
}

export function normalizeSettlementRecordsData(payload: unknown): SettlementRecordsData {
  const body = unwrap(payload)
  return {
    merchantNo: stringOr(pick(body, 'merchant_no', 'merchantNo'), ''),
    merchantNoNormalized: stringOr(pick(body, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
    orderNo: stringOr(pick(body, 'order_no', 'orderNo'), ''),
    orderNoNormalized: stringOr(pick(body, 'order_no_normalized', 'orderNoNormalized'), ''),
    containerNo: stringOr(pick(body, 'container_no', 'containerNo'), ''),
    vehicleNo: stringOr(pick(body, 'vehicle_no', 'vehicleNo'), ''),
    records: normalizeSettlementRecords(body.records ?? body.sale_records),
  }
}

function normalizeSettlementListItem(row: JsonRecord): SettlementListItem {
  const quantities = asRecord(row.grade_quantities ?? row.gradeQuantities)
  return {
    merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), '未编号'),
    merchantNoNormalized: stringOr(pick(row, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
    orderNo: stringOr(pick(row, 'order_no', 'orderNo'), ''),
    orderNoNormalized: stringOr(pick(row, 'order_no_normalized', 'orderNoNormalized'), ''),
    series: stringOr(pick(row, 'series'), UNKNOWN_SERIES),
    containerNo: stringOr(pick(row, 'container_no', 'containerNo'), ''),
    vehicleNo: stringOr(pick(row, 'vehicle_no', 'vehicleNo'), ''),
    saleDateStart: stringOr(pick(row, 'sale_date_start', 'saleDateStart'), ''),
    saleDateEnd: stringOr(pick(row, 'sale_date_end', 'saleDateEnd'), ''),
    salesAmount: numberOr(pick(row, 'sales_amount', 'salesAmount'), 0),
    totalQuantity: numberOr(pick(row, 'total_quantity', 'totalQuantity'), 0),
    averagePrice: nullableNumber(pick(row, 'average_price', 'averagePrice')),
    gradeQuantities: {
      A: numberOr(pick(quantities, 'A', 'a'), 0),
      B: numberOr(pick(quantities, 'B', 'b'), 0),
      C: numberOr(pick(quantities, 'C', 'c'), 0),
    },
    recordCount: numberOr(pick(row, 'record_count', 'recordCount'), 0),
  }
}

export function normalizeImportBatch(row: JsonRecord): ImportBatch {
  return {
    id: idOrEmpty(pick(row, 'id', 'batch_id', 'batchId')),
    fileName: stringOr(pick(row, 'file_name', 'fileName', 'filename'), '未命名文件'),
    merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), ''),
    merchantNoNormalized: stringOr(pick(row, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
    orderNo: stringOr(pick(row, 'order_no', 'orderNo'), ''),
    orderNoNormalized: stringOr(pick(row, 'order_no_normalized', 'orderNoNormalized'), ''),
    importedAt: stringOr(pick(row, 'imported_at', 'importedAt', 'created_at'), ''),
    status: stringOr(row.status, 'unknown'),
    successCount: numberOr(pick(row, 'success_count', 'successCount'), 0),
    warningCount: numberOr(pick(row, 'warning_count', 'warningCount'), 0),
    failureCount: numberOr(pick(row, 'failure_count', 'failureCount'), 0),
    errorSummary: stringOr(pick(row, 'error_summary', 'errorSummary', 'error'), ''),
  }
}

export function normalizeImportIssues(payload: unknown): ImportIssue[] {
  const body = unwrap(payload)
  return asArray(Array.isArray(body) ? body : body.issues ?? body.items).map((row) => ({
    id: idOrEmpty(pick(row, 'id', 'issue_id', 'issueId')),
    rowNumber: nullableNumber(pick(row, 'row_number', 'rowNumber')),
    issueType: stringOr(pick(row, 'issue_type', 'issueType', 'type'), 'data_issue'),
    severity: stringOr(row.severity, 'warning'),
    fieldName: stringOr(pick(row, 'field_name', 'fieldName'), ''),
    message: stringOr(row.message, '发现数据问题'),
    rawValue: stringOr(pick(row, 'raw_value', 'rawValue'), ''),
  }))
}

export function unwrap(value: unknown): JsonRecord {
  const record = asRecord(value)
  return asRecord(record.data ?? record.result ?? record)
}

export function normalizeSeriesComparison(payload: unknown): SeriesComparisonData {
  const body = unwrap(payload)
  return {
    settlements: asArray(body.settlements).map((row) => ({
      ...normalizeSeriesAggregate(row),
      merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), '未编号'),
      merchantNoNormalized: stringOr(pick(row, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
      orderNo: stringOr(pick(row, 'order_no', 'orderNo'), ''),
      orderNoNormalized: stringOr(pick(row, 'order_no_normalized', 'orderNoNormalized'), ''),
      series: stringOr(pick(row, 'series'), UNKNOWN_SERIES),
      containerNo: stringOr(pick(row, 'container_no', 'containerNo'), ''),
      vehicleNo: stringOr(pick(row, 'vehicle_no', 'vehicleNo'), ''),
      startDate: stringOr(pick(row, 'start_date', 'startDate'), ''),
      endDate: stringOr(pick(row, 'end_date', 'endDate'), ''),
    })),
    series: asArray(body.series).map((row) => ({
      ...normalizeSeriesAggregate(row),
      name: stringOr(pick(row, 'name', 'series'), UNKNOWN_SERIES),
      merchantNos: stringArray(pick(row, 'merchant_nos', 'merchantNos')),
      settlementCount: numberOr(pick(row, 'settlement_count', 'settlementCount'), 0),
    })),
    total: normalizeSeriesAggregate(asRecord(body.total)),
    gradeDetails: normalizeGradeDetails(pick(body, 'grade_details', 'gradeDetails')),
  }
}

/** 细分等级阶梯；后端未返回该字段时给出安全的空结构，页面按空态处理。 */
export function normalizeGradeDetails(value: unknown): GradeDetailData {
  const body = asRecord(value)
  const unrecognized = asRecord(pick(body, 'unrecognized'))
  return {
    buckets: asArray(body.buckets).map((row) => ({
      label: stringOr(pick(row, 'label'), '其他'),
      grade: normalizeGrade(pick(row, 'grade')) ?? 'C',
      fruitType: stringOr(pick(row, 'fruit_type', 'fruitType'), '榴莲'),
      salesQuantity: numberOr(pick(row, 'sales_quantity', 'salesQuantity'), 0),
      salesAmount: numberOr(pick(row, 'sales_amount', 'salesAmount'), 0),
      weightedAvgPrice: nullableNumber(pick(row, 'weighted_avg_price', 'weightedAvgPrice')),
      quantityShare: nullableNumber(pick(row, 'quantity_share', 'quantityShare')),
      amountShare: nullableNumber(pick(row, 'amount_share', 'amountShare')),
      recordCount: numberOr(pick(row, 'record_count', 'recordCount'), 0),
      qualityMarks: stringArray(pick(row, 'quality_marks', 'qualityMarks')),
    })),
    unrecognized: {
      label: stringOr(pick(unrecognized, 'label'), '其他'),
      recordCount: numberOr(pick(unrecognized, 'record_count', 'recordCount'), 0),
      salesQuantity: numberOr(pick(unrecognized, 'sales_quantity', 'salesQuantity'), 0),
    },
    total: normalizeMetricTotal(pick(body, 'total')),
  }
}

function normalizeMetricTotal(value: unknown): MetricTotal {
  const record = asRecord(value)
  const salesQuantity = numberOr(pick(record, 'sales_quantity', 'salesQuantity'), 0)
  const salesAmount = numberOr(pick(record, 'sales_amount', 'salesAmount'), 0)
  return {
    salesQuantity,
    salesAmount,
    weightedAvgPrice: nullableNumber(pick(record, 'weighted_avg_price', 'weightedAvgPrice'))
      ?? (salesQuantity ? salesAmount / salesQuantity : null),
  }
}

export function normalizeSeriesAnalysis(payload: unknown): SeriesAnalysisResult {
  const body = unwrap(payload)
  return {
    content: stringOr(pick(body, 'content'), ''),
    model: stringOr(pick(body, 'model'), '未知模型'),
    generatedAt: stringOr(pick(body, 'generated_at', 'generatedAt'), ''),
    cached: pick(body, 'cached') === true,
  }
}

function normalizeSeriesAggregate(row: JsonRecord): SeriesAggregate {
  const overview = normalizeOverview(row)
  return {
    total: overview.total,
    grades: overview.grades,
    gradeAmountShares: normalizeGradeAmountShares(
      pick(row, 'grade_amount_shares', 'gradeAmountShares'),
    ),
    spread: normalizeSpread(pick(row, 'spread')),
  }
}

function normalizeGradeAmountShares(value: unknown): Record<Grade, number | null> {
  const record = asRecord(value)
  return {
    A: nullableNumber(pick(record, 'A', 'a')),
    B: nullableNumber(pick(record, 'B', 'b')),
    C: nullableNumber(pick(record, 'C', 'c')),
  }
}

function normalizeSpread(value: unknown): PriceSpread {
  const record = asRecord(value)
  const prices = asRecord(pick(record, 'grade_prices', 'gradePrices'))
  return {
    aMinusB: nullableNumber(pick(record, 'a_minus_b', 'aMinusB')),
    bMinusC: nullableNumber(pick(record, 'b_minus_c', 'bMinusC')),
    bDiscountVsA: nullableNumber(pick(record, 'b_discount_vs_a', 'bDiscountVsA')),
    gradePrices: {
      ...emptyGradeRecord<number | null>(null),
      ...normalizeGradePrices(prices),
    },
  }
}

function normalizeGradePrices(prices: JsonRecord): Partial<Record<Grade, number | null>> {
  const result: Partial<Record<Grade, number | null>> = {}
  GRADES.forEach((grade) => {
    const value = pick(prices, grade, grade.toLowerCase())
    if (value !== undefined) result[grade] = nullableNumber(value)
  })
  return result
}

export function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : []
}

function normalizeAnomaly(row: JsonRecord): OperatingAnomaly {
  return {
    type: stringOr(pick(row, 'type', 'issue_type', 'issueType'), 'operating_anomaly'),
    reason: stringOr(row.reason ?? row.message, '发现经营指标异常'),
    merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), ''),
    merchantNoNormalized: stringOr(pick(row, 'merchant_no_normalized', 'merchantNoNormalized'), ''),
    metric: nullableNumber(row.metric),
    baseline: nullableNumber(row.baseline),
  }
}

function normalizeIssueCounts(value: unknown): IssueCounts {
  const record = asRecord(value)
  const result: IssueCounts = { total: numberOr(record.total, 0) }
  Object.entries(record).forEach(([key, item]) => { result[key] = numberOr(item, 0) })
  return result
}

function normalizeGrade(value: unknown): Grade | null {
  const grade = String(value ?? '').trim().toUpperCase()
  if (grade.startsWith('A')) return 'A'
  if (grade.startsWith('B') && !grade.startsWith('BC')) return 'B'
  if (grade.startsWith('C') || grade.startsWith('BC')) return 'C'
  return null
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function pick(record: JsonRecord | undefined, ...keys: string[]): unknown {
  for (const key of keys) if (record?.[key] !== undefined) return record[key]
  return undefined
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : numberOr(value, 0)
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function idOrEmpty(value: unknown): number | string {
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}

function nullableId(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

function sum(rows: JsonRecord[], ...keys: string[]): number {
  return rows.reduce((total, row) => total + numberOr(pick(row, ...keys), 0), 0)
}

function sumMetric(rows: GradeMetric[], key: 'salesQuantity' | 'salesAmount'): number {
  return rows.reduce((total, row) => total + row[key], 0)
}
