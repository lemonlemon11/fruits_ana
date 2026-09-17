import type {
  AnalyticsFilters,
  AskResult,
  EntryAfterSaleItem,
  EntryFeeItem,
  EntryFieldOption,
  EntryRead,
  EntrySaleItem,
  GradeDetailData,
  GradeMetric,
  ImportBatch,
  ImportConfirmResult,
  ImportIssue,
  ImportJob,
  ImportReviewDraft,
  IssueCounts,
  MetricTotal,
  OperatingAnomaly,
  OverviewData,
  SeriesAggregate,
  SeriesAnalysisResult,
  SeriesComparisonData,
  SettlementComparisonItem,
  SettlementDetail,
  SettlementListData,
  SettlementListFilters,
  SettlementListItem,
  SettlementPagination,
  SettlementRecord,
  SettlementRecordsData,
  TrendPoint,
} from './types.ts'
import { emptyGradeRecord, gradeLabel, normalizeGrade, GRADES, type Grade } from '../utils/grades.ts'

export { gradeLabel, normalizeGrade, GRADES }

type JsonRecord = Record<string, unknown>

/** 与后端 `series_name` 保持一致：识别不出品牌时使用该名称。 */
export const UNKNOWN_SERIES = '未识别品牌'

/** 组装分析/列表类接口的查询串；`page` / `pageSize` 只有结算单列表会用到。 */
export function buildAnalyticsQuery(filters: SettlementListFilters): string {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.merchantNo) params.set('merchant_no', filters.merchantNo)
  if (filters.includeAllSettlements) params.set('include_all_settlements', 'true')
  if (filters.page) params.set('page', String(filters.page))
  if (filters.pageSize) params.set('page_size', String(filters.pageSize))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function normalizeGradeMetrics(input: unknown): GradeMetric[] {
  const rows = asArray(input)
  const presentGrades = GRADES.filter((grade) =>
    rows.some((row) => normalizeGrade(row.grade) === grade),
  )
  return presentGrades.map((grade) => {
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
      series: stringOr(pick(row, 'series', 'seriesName'), ''),
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
  return GRADES.reduce<Record<Grade, number | null>>(
    (result, grade) => ({ ...result, [grade]: nullableNumber(pick(record, grade, grade.toLowerCase())) }),
    emptyGradeRecord(null),
  )
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
    sourceType: pick(body, 'source_type', 'sourceType') === 'manual' ? 'manual' : 'import',
    market: stringOr(pick(body, 'market'), ''),
    arrivalDate: stringOr(pick(body, 'arrival_date', 'arrivalDate'), ''),
    arrivalQuantity: nullableNumber(pick(body, 'arrival_quantity', 'arrivalQuantity')),
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

export function normalizeEntrySales(input: unknown): EntrySaleItem[] {
  return asArray(input).map((row) => ({
    saleDate: stringOr(pick(row, 'sale_date', 'saleDate'), ''),
    variety: stringOr(pick(row, 'variety', 'grade_raw', 'gradeRaw'), 'A'),
    headCount: specText(pick(row, 'head_count', 'piece_count', 'headCount', 'pieceCount')),
    specKg: specText(pick(row, 'spec_kg', 'specKg')),
    salesQuantity: numberOr(pick(row, 'sales_quantity', 'quantity', 'salesQuantity'), 0),
    unitPrice: numberOr(pick(row, 'unit_price', 'unitPrice'), 0),
    remark: stringOr(pick(row, 'remark'), ''),
  }))
}

export function normalizeEntryAfterSales(input: unknown): EntryAfterSaleItem[] {
  return asArray(input).map((row) => ({
    content: stringOr(pick(row, 'content'), ''),
    summary: stringOr(pick(row, 'summary'), ''),
    amount: numberOr(pick(row, 'amount'), 0),
  }))
}

export function normalizeEntryFees(input: unknown): EntryFeeItem[] {
  return asArray(input).map((row) => ({
    name: stringOr(pick(row, 'name'), ''),
    amount: numberOr(pick(row, 'amount'), 0),
    isCustom: pick(row, 'is_custom', 'isCustom') === true,
  }))
}

export function normalizeEntryRead(payload: unknown): EntryRead {
  const body = unwrap(payload)
  return {
    merchantNo: stringOr(pick(body, 'merchant_no', 'merchantNo'), ''),
    orderNo: stringOr(pick(body, 'order_no', 'orderNo'), ''),
    containerNo: stringOr(pick(body, 'container_no', 'containerNo'), ''),
    vehicleNo: stringOr(pick(body, 'vehicle_no', 'vehicleNo'), ''),
    market: stringOr(pick(body, 'market'), ''),
    arrivalDate: stringOr(pick(body, 'arrival_date', 'arrivalDate'), ''),
    arrivalQuantity: nullableNumber(pick(body, 'arrival_quantity', 'arrivalQuantity')),
    sales: normalizeEntrySales(body.sales),
    afterSales: normalizeEntryAfterSales(body.after_sales ?? body.afterSales),
    fees: normalizeEntryFees(body.fees),
    sourceType: pick(body, 'source_type', 'sourceType') === 'manual' ? 'manual' : 'import',
  }
}

export function normalizeEntryFieldOptions(payload: unknown): EntryFieldOption[] {
  const body = unwrap(payload)
  return asArray(Array.isArray(body) ? body : body.options ?? body.items).map((row) => ({
    field: pick(row, 'field', 'field_key', 'fieldKey') === 'variety' ? 'variety' : 'market',
    value: stringOr(pick(row, 'value'), ''),
    sortOrder: numberOr(pick(row, 'sort_order', 'sortOrder'), 0),
  }))
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
    pagination: normalizeSettlementPagination(body.pagination),
  }
}

function normalizeSettlementPagination(input: unknown): SettlementPagination | null {
  const row = asRecord(input)
  if (!row || row.total === undefined) return null
  const total = numberOr(row.total, 0)
  const pageSize = numberOr(pick(row, 'page_size', 'pageSize'), 0)
  return {
    total,
    page: numberOr(row.page, 1),
    pageSize,
    pages: Math.max(1, numberOr(row.pages, pageSize ? Math.ceil(total / pageSize) : 1)),
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
    gradeQuantities: GRADES.reduce<Record<Grade, number>>(
      (result, grade) => ({ ...result, [grade]: numberOr(pick(quantities, grade, grade.toLowerCase()), 0) }),
      emptyGradeRecord(0),
    ),
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

export function normalizeImportJob(payload: unknown): ImportJob {
  const body = unwrap(payload)
  return {
    token: stringOr(pick(body, 'token'), ''),
    status: stringOr(pick(body, 'status'), 'pending'),
    fileCount: numberOr(pick(body, 'file_count', 'fileCount'), 0),
    draftCount: numberOr(pick(body, 'draft_count', 'draftCount'), 0),
    confirmedCount: numberOr(pick(body, 'confirmed_count', 'confirmedCount'), 0),
    createdAt: stringOr(pick(body, 'created_at', 'createdAt'), ''),
    drafts: asArray(body.drafts).map((row) => ({
      token: stringOr(pick(row, 'token'), ''),
      fileName: stringOr(pick(row, 'file_name', 'fileName'), '未命名文件'),
      merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), ''),
      orderNo: stringOr(pick(row, 'order_no', 'orderNo'), ''),
      issueCount: numberOr(pick(row, 'issue_count', 'issueCount'), 0),
      hasError: pick(row, 'has_error', 'hasError') === true,
      version: numberOr(pick(row, 'version'), 1),
      status: stringOr(pick(row, 'status'), 'pending'),
    })),
  }
}

export function normalizeImportReviewDraft(payload: unknown): ImportReviewDraft {
  const body = unwrap(payload)
  const draft = asRecord(body.payload ?? body.draft ?? {})
  return {
    jobToken: stringOr(pick(body, 'job_token', 'jobToken'), ''),
    jobStatus: stringOr(pick(body, 'job_status', 'jobStatus'), 'pending'),
    draftToken: stringOr(pick(body, 'draft_token', 'draftToken'), ''),
    version: numberOr(pick(body, 'version'), 1),
    fileName: stringOr(pick(body, 'file_name', 'fileName'), '未命名文件'),
    payload: {
      merchantNo: stringOr(pick(draft, 'merchant_no', 'merchantNo'), ''),
      orderNo: stringOr(pick(draft, 'order_no', 'orderNo'), ''),
      containerNo: stringOr(pick(draft, 'container_no', 'containerNo'), ''),
      vehicleNo: stringOr(pick(draft, 'vehicle_no', 'vehicleNo'), ''),
      market: stringOr(pick(draft, 'market'), ''),
      arrivalDate: stringOr(pick(draft, 'arrival_date', 'arrivalDate'), ''),
      arrivalQuantity: nullableNumber(pick(draft, 'arrival_quantity', 'arrivalQuantity')),
      sales: asArray(draft.sales).map((row) => ({
        sourceRow: nullableNumber(pick(row, 'source_row', 'sourceRow')),
        saleDate: stringOr(pick(row, 'sale_date', 'saleDate'), ''),
        variety: stringOr(pick(row, 'variety'), ''),
        headCount: stringOr(pick(row, 'head_count', 'headCount'), ''),
        specKg: stringOr(pick(row, 'spec_kg', 'specKg'), ''),
        salesQuantity: numberOr(pick(row, 'sales_quantity', 'salesQuantity'), 0),
        unitPrice: numberOr(pick(row, 'unit_price', 'unitPrice'), 0),
        amount: numberOr(pick(row, 'amount'), 0),
        remark: stringOr(pick(row, 'remark'), ''),
      })),
      afterSales: asArray(draft.after_sales).map((row) => ({
        sourceRow: nullableNumber(pick(row, 'source_row', 'sourceRow')),
        content: stringOr(pick(row, 'content'), ''),
        summary: stringOr(pick(row, 'summary'), ''),
        amount: numberOr(pick(row, 'amount'), 0),
      })),
      fees: asArray(draft.fees).map((row) => ({
        sourceRow: nullableNumber(pick(row, 'source_row', 'sourceRow')),
        name: stringOr(pick(row, 'name'), ''),
        amount: numberOr(pick(row, 'amount'), 0),
        isCustom: pick(row, 'is_custom', 'isCustom') === true,
      })),
      fileSummary: asRecord(draft.file_summary ?? draft.fileSummary) as Record<string, string>,
      computedSummary: asRecord(draft.computed_summary ?? draft.computedSummary) as Record<string, string>,
      issues: asArray(draft.issues).map((row) => ({
        code: stringOr(pick(row, 'code'), 'data_issue'),
        severity: (pick(row, 'severity') === 'error' ? 'error' : 'warning') as 'error' | 'warning',
        message: stringOr(pick(row, 'message'), '发现数据问题'),
        section: stringOr(pick(row, 'section'), ''),
        row: nullableNumber(pick(row, 'row')),
        field: stringOr(pick(row, 'field'), ''),
        rawValue: stringOr(pick(row, 'raw_value', 'rawValue'), ''),
      })),
      overwrite: false,
    },
  }
}

export function normalizeImportConfirmResult(payload: unknown): ImportConfirmResult {
  const body = unwrap(payload)
  return {
    jobToken: stringOr(pick(body, 'job_token', 'jobToken'), ''),
    status: stringOr(pick(body, 'status'), 'confirmed'),
    confirmed: asArray(body.confirmed).map((row) => ({
      draftToken: stringOr(pick(row, 'draft_token', 'draftToken'), ''),
      fileName: stringOr(pick(row, 'file_name', 'fileName'), '未命名文件'),
      merchantNo: stringOr(pick(row, 'merchant_no', 'merchantNo'), ''),
      batchId: idOrEmpty(pick(row, 'batch_id', 'batchId')),
      status: stringOr(pick(row, 'status'), 'success'),
      errorCount: numberOr(pick(row, 'error_count', 'errorCount'), 0),
      warningCount: numberOr(pick(row, 'warning_count', 'warningCount'), 0),
    })),
  }
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
      grade: normalizeGrade(pick(row, 'grade')) ?? 'OTHER',
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

export function normalizeAskResult(payload: unknown): AskResult {
  const body = unwrap(payload)
  const steps = Array.isArray(body.steps) ? body.steps : []
  return {
    answer: stringOr(pick(body, 'answer'), ''),
    model: stringOr(pick(body, 'model'), ''),
    steps: steps.map((item) => {
      const step = asRecord(item)
      return {
        tool: stringOr(pick(step, 'tool'), ''),
        summary: stringOr(pick(step, 'summary'), ''),
        args: asRecord(step.args),
      }
    }),
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
  }
}

function normalizeGradeAmountShares(value: unknown): Record<Grade, number | null> {
  const record = asRecord(value)
  const result: Record<Grade, number | null> = emptyGradeRecord(null)
  GRADES.forEach((grade) => {
    result[grade] = nullableNumber(pick(record, grade, grade.toLowerCase()))
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

/** 规格字段是文本（区间写法），但兼容后端返回数字的旧响应。 */
function specText(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
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
