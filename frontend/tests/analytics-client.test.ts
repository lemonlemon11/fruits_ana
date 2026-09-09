import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAnalyticsQuery,
  getImportIssues,
  gradeLabel,
  normalizeContainerDetail,
  normalizeGradeMetrics,
  normalizeImportIssues,
  normalizeOverview,
  recordSourceUrl,
} from '../src/api/client.ts'
import { formatAnomalyValue } from '../src/utils/format.ts'

test('buildAnalyticsQuery sends only populated contract filters', () => {
  assert.equal(
    buildAnalyticsQuery({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      containerId: 'C 625',
    }),
    '?start_date=2026-01-01&end_date=2026-01-31&container_id=C+625',
  )
  assert.equal(buildAnalyticsQuery({ startDate: '', endDate: '', containerId: '' }), '')
})

test('normalizeGradeMetrics keeps A/B/C visible and maps BC into C', () => {
  const grades = normalizeGradeMetrics([
    { grade: 'BC', sales_quantity: 4, sales_amount: 32, weighted_avg_price: 8, quantity_share: 0.4 },
    { grade: 'A', sales_quantity: 6, sales_amount: 72, weighted_avg_price: 12, quantity_share: 0.6 },
  ])

  assert.deepEqual(grades.map((item) => item.grade), ['A', 'B', 'C'])
  assert.equal(grades[1].salesQuantity, 0)
  assert.equal(grades[2].salesQuantity, 4)
  assert.equal(gradeLabel('C'), 'C果（含BC）')
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

test('normalizeContainerDetail exposes settlement and traceable records', () => {
  const detail = normalizeContainerDetail({
    container_id: '625',
    settlement: { after_sales_amount: 10, fee_amount: 20, customs_tax: 30, payable_amount: 940 },
    records: [{
      id: 7, source_file_id: 2, sale_date: '2026-01-02', grade_raw: 'BC6', grade: 'C',
      quantity: 4, unit_price: 8, amount: 32,
    }],
  }, '625')

  assert.equal(detail.settlement.feeAmount, 20)
  assert.equal(detail.settlement.afterSalesAmount, 10)
  assert.equal(detail.settlement.customsTax, 30)
  assert.equal(detail.settlement.payableAmount, 940)
  assert.equal(detail.records[0].id, 7)
  assert.equal(detail.records[0].saleDate, '2026-01-02')
  assert.equal(detail.records[0].gradeRaw, 'BC6')
  assert.equal(detail.records[0].grade, 'C')
  assert.equal(detail.records[0].unitPrice, 8)
  assert.equal(detail.records[0].sourceFileId, 2)
  assert.equal(recordSourceUrl(detail.records[0].id), '/api/exports/records/7/source')
})

test('normalizeImportIssues accepts issue_type and nullable fields', () => {
  const issues = normalizeImportIssues({ issues: [{
    id: 9, row_number: 11, issue_type: 'amount_mismatch', severity: 'warning',
    field_name: 'amount', message: '金额不一致', raw_value: null,
  }] })

  assert.deepEqual(issues[0], {
    id: 9, rowNumber: 11, issueType: 'amount_mismatch', severity: 'warning',
    fieldName: 'amount', message: '金额不一致', rawValue: '',
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
  assert.match(formatAnomalyValue('low_weighted_avg_price', 8), /8\.00/)
  assert.equal(formatAnomalyValue('grade_share_deviation', 0.125), '12.5%')
  assert.equal(formatAnomalyValue('daily_quantity_deviation', 1234), '1,234')
})
