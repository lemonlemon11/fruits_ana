import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAnalyticsQuery,
  getImportIssues,
  gradeLabel,
  normalizeGrade,
  normalizeGradeBreakdown,
  normalizeGradeMetrics,
  normalizeImportIssues,
  normalizeOverview,
  normalizeSettlementDetail,
  normalizeSettlementList,
  recordSourceUrl,
} from '../src/api/client.ts'
import { formatAnomalyValue } from '../src/utils/format.ts'

test('buildAnalyticsQuery sends only populated contract filters', () => {
  assert.equal(
    buildAnalyticsQuery({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      merchantNo: '单 625',
    }),
    '?start_date=2026-01-01&end_date=2026-01-31&merchant_no=%E5%8D%95+625',
  )
  assert.equal(buildAnalyticsQuery({ startDate: '', endDate: '', merchantNo: '' }), '')
  assert.equal(
    buildAnalyticsQuery({ includeAllSettlements: true }),
    '?include_all_settlements=true',
  )
})

test('normalizeGradeMetrics 只保留实际出现过的等级并保留 AB 独立', () => {
  const grades = normalizeGradeMetrics([
    { grade: 'AB', sales_quantity: 4, sales_amount: 32, weighted_avg_price: 8, quantity_share: 0.4 },
    { grade: 'A', sales_quantity: 6, sales_amount: 72, weighted_avg_price: 12, quantity_share: 0.6 },
  ])

  assert.deepEqual(grades.map((item) => item.grade), ['A', 'AB'])
  assert.equal(grades[0].salesQuantity, 6)
  assert.equal(grades[1].salesQuantity, 4)
  assert.equal(gradeLabel('C'), 'C果')
  assert.equal(gradeLabel('AB'), 'AB果')
  assert.equal(normalizeGrade('BC'), 'OTHER')
})

test('normalizeOverview accepts wrapped payload and snake_case fields', () => {
  const overview = normalizeOverview({
    data: {
      total: { sales_quantity: 10, sales_amount: 104, weighted_avg_price: 10.4 },
      grades: [{ grade: 'A', sales_quantity: 10, sales_amount: 104, weighted_avg_price: 10.4, quantity_share: 1 }],
      issue_counts: { total: 2, amount_mismatch: 2 },
    },
  })

  assert.equal(overview.total.salesAmount, 104)
  assert.equal(overview.grades[0].quantityShare, 1)
  assert.deepEqual(overview.issueCounts, { total: 2, amount_mismatch: 2 })
})

test('normalizeGradeBreakdown exposes grades and spec records', () => {
  const breakdown = normalizeGradeBreakdown({
    grades: [
      { grade: 'A', sales_quantity: 2, sales_amount: 20, weighted_avg_price: 10, quantity_share: 1 },
    ],
    records: [{
      id: 8, sale_date: '2026-01-02', grade: 'A', grade_raw: 'A',
      piece_count: '3/4头', quantity: 2, unit_price: 10, amount: 20,
    }],
  })

  assert.equal(breakdown.grades[0].salesQuantity, 2)
  assert.equal(breakdown.records[0].id, 8)
  assert.equal(breakdown.records[0].headCount, '3/4头')
})

test('normalizeSettlementDetail exposes settlement and traceable records', () => {
  const detail = normalizeSettlementDetail({
    merchant_no: '640',
    order_no: '宝贝L004',
    container_no: 'CBHU2970762',
    vehicle_no: '桂ABF330',
    settlement: { after_sales_amount: 10, goods_amount: 980, fee_amount: 20, customs_tax: 30, payable_amount: 940 },
    records: [{
      id: 7, source_file_id: 2, sale_date: '2026-01-02', grade_raw: 'BC6', grade: 'C',
      fruit_type: '榴莲', quantity: 4, unit_price: 8, amount: 32,
      remark: '客户: 张', sales_region: '华东',
    }],
  }, '640')

  assert.equal(detail.merchantNo, '640')
  assert.equal(detail.orderNo, '宝贝L004')
  assert.equal(detail.containerNo, 'CBHU2970762')
  assert.equal(detail.vehicleNo, '桂ABF330')
  assert.equal(detail.settlement.feeAmount, 20)
  assert.equal(detail.settlement.afterSalesAmount, 10)
  assert.equal(detail.settlement.goodsAmount, 980)
  assert.equal(detail.settlement.customsTax, 30)
  assert.equal(detail.settlement.payableAmount, 940)
  assert.equal(detail.records[0].id, 7)
  assert.equal(detail.records[0].saleDate, '2026-01-02')
  assert.equal(detail.records[0].gradeRaw, 'BC6')
  assert.equal(detail.records[0].grade, 'C')
  assert.equal(detail.records[0].fruitType, '榴莲')
  assert.equal(detail.records[0].salesRegion, '华东')
  assert.equal(detail.records[0].remark, '客户: 张')
  assert.equal(detail.records[0].unitPrice, 8)
  assert.equal(detail.records[0].sourceFileId, 2)
  assert.equal(recordSourceUrl(detail.records[0].id), '/api/exports/records/7/source')
})

test('normalizeSettlementList reads the default range and grade quantities', () => {
  const list = normalizeSettlementList({
    date_range: { start_date: '2026-08-09', end_date: '2026-09-09', is_default: true },
    settlements: [{
      merchant_no: '640', order_no: '宝贝L004', container_no: 'CBHU2970762',
      vehicle_no: '桂ABF330', arrival_date: '2026-09-08', sale_date_start: '2026-09-09', sale_date_end: '2026-09-09',
      sales_amount: 8000, total_quantity: 20, average_price: 400,
      grade_quantities: { A: 12, B: 6, C: 2 }, record_count: 3,
    }],
  })

  assert.deepEqual(list.dateRange, { startDate: '2026-08-09', endDate: '2026-09-09', isDefault: true })
  assert.equal(list.settlements[0].merchantNo, '640')
  assert.equal(list.settlements[0].orderNo, '宝贝L004')
  assert.equal(list.settlements[0].arrivalDate, '2026-09-08')
  assert.deepEqual(list.settlements[0].gradeQuantities, {
    A: 12, B: 6, AB: 0, C: 2, D: 0, E: 0, F: 0, OTHER: 0,
  })
  assert.equal(list.settlements[0].averagePrice, 400)
  assert.equal(list.settlements[0].recordCount, 3)
})

test('normalizeSettlementList tolerates an empty payload', () => {
  assert.deepEqual(normalizeSettlementList({ date_range: null, settlements: [] }), {
    dateRange: null,
    settlements: [],
    pagination: null,
  })
})

test('normalizeImportIssues accepts issue_type and nullable fields', () => {
  const issues = normalizeImportIssues({ issues: [{
    id: 9, row_number: 11, issue_type: 'amount_mismatch', severity: 'warning',
    field_name: 'amount', message: '金额不一致', raw_value: null,
  }] })

  assert.deepEqual(issues[0], {
    id: 9, rowNumber: 11, issueType: 'amount_mismatch', severity: 'warning',
    fieldName: 'amount', message: '金额不一致', rawValue: '',
    resolved: false,
    resolvedAt: null,
  })
})

test('getImportIssues calls the batch endpoint and normalizes its response', async (context) => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({ issues: [{
      id: 3,
      row_number: 4,
      issue_type: 'unknown_grade',
      severity: 'error',
      field_name: 'grade',
      message: '无法识别等级',
      raw_value: 'D9',
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const issues = await getImportIssues('batch 8')

  assert.equal(requestedUrl, '/api/imports/batch%208/issues')
  assert.equal(issues[0].rowNumber, 4)
  assert.equal(issues[0].rawValue, 'D9')
})

test('formatAnomalyValue applies units from type or issue_type', () => {
  assert.equal(formatAnomalyValue('low_weighted_avg_price', 8), '¥8')
  assert.equal(formatAnomalyValue('grade_share_deviation', 0.125), '12.5%')
  assert.equal(formatAnomalyValue('daily_quantity_deviation', 1234), '1,234')
})
