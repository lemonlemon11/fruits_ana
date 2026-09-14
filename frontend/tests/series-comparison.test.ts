import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSeriesComparison, normalizeSettlementList } from '../src/api/normalize.ts'
import {
  MAX_SERIES_COMPARISON,
  deselectSeries,
  gradeRow,
  groupBySeries,
  selectWholeSeries,
  toggleSelection,
} from '../src/utils/seriesComparison.ts'

const payload = {
  settlements: [
    {
      merchant_no: '单624',
      order_no: '宝贝01',
      series: '宝贝',
      container_no: 'MWCU1823691',
      vehicle_no: '桂AAB087',
      start_date: '2026-08-27',
      end_date: '2026-08-28',
      total: { sales_quantity: 30, sales_amount: 2000, weighted_avg_price: 66.6667 },
      grades: [
        { grade: 'A', sales_quantity: 10, sales_amount: 1000, weighted_avg_price: 100, quantity_share: 0.3333 },
        { grade: 'B', sales_quantity: 20, sales_amount: 1000, weighted_avg_price: 50, quantity_share: 0.6667 },
        { grade: 'C', sales_quantity: 0, sales_amount: 0, weighted_avg_price: null, quantity_share: 0 },
      ],
      grade_amount_shares: { A: 0.5, B: 0.5, C: null },
    },
  ],
  series: [
    { name: '宝贝', merchant_nos: ['单624'], settlement_count: 1, total: { sales_quantity: 30, sales_amount: 2000 } },
  ],
  total: {
    total: { sales_quantity: 30, sales_amount: 2000, weighted_avg_price: 66.6667 },
    grades: [{ grade: 'A', sales_quantity: 10, sales_amount: 1000 }],
    grade_amount_shares: { A: 0.5 },
  },
}

test('normalizeSeriesComparison 解析结算单、系列与合计三部分', () => {
  const data = normalizeSeriesComparison(payload)

  assert.equal(data.settlements.length, 1)
  assert.equal(data.settlements[0].merchantNo, '单624')
  assert.equal(data.settlements[0].series, '宝贝')
  assert.equal(data.settlements[0].total.salesAmount, 2000)
  assert.equal(data.settlements[0].gradeAmountShares.B, 0.5)
  assert.equal(data.series[0].name, '宝贝')
  assert.deepEqual(data.series[0].merchantNos, ['单624'])
  assert.equal(data.total.gradeAmountShares.A, 0.5)
})

test('normalizeSeriesComparison 缺字段时给出可展示的零值', () => {
  const data = normalizeSeriesComparison({})

  assert.deepEqual(data.settlements, [])
  assert.deepEqual(data.series, [])
  assert.equal(data.total.total.salesQuantity, 0)
  assert.deepEqual(data.total.grades, [])
})

test('normalizeSettlementList 带出系列字段', () => {
  const data = normalizeSettlementList({
    date_range: { start_date: '2026-08-27', end_date: '2026-09-06', is_default: true },
    settlements: [
      { merchant_no: '单624', order_no: '宝贝01', series: '宝贝', total_quantity: 30 },
      { merchant_no: '626', order_no: '626' },
    ],
  })

  assert.equal(data.settlements[0].series, '宝贝')
  assert.equal(data.settlements[1].series, '未识别品牌')
  assert.equal(data.dateRange?.isDefault, true)
})

test('groupBySeries 按品牌分组，品牌内保持原顺序', () => {
  const groups = groupBySeries([
    { series: '宝贝', merchantNo: '单624' },
    { series: '香香', merchantNo: '单637' },
    { series: '宝贝', merchantNo: '626' },
  ])

  assert.deepEqual(groups.map((group) => group.series), ['宝贝', '香香'])
  assert.deepEqual(groups[0].items.map((item) => item.merchantNo), ['单624', '626'])
})

test('toggleSelection 支持勾选、取消与上限保护', () => {
  assert.deepEqual(toggleSelection(['单624'], '626'), ['单624', '626'])
  assert.deepEqual(toggleSelection(['单624', '626'], '626'), ['单624'])

  const full = Array.from({ length: MAX_SERIES_COMPARISON }, (_, index) => `商号${index}`)
  assert.deepEqual(toggleSelection(full, '新增'), full)
})

test('selectWholeSeries 追加去重并按上限截断', () => {
  assert.deepEqual(selectWholeSeries(['单624'], ['单624', '626']), ['单624', '626'])

  const full = Array.from({ length: MAX_SERIES_COMPARISON }, (_, index) => `商号${index}`)
  assert.equal(selectWholeSeries(full, ['新增']).length, MAX_SERIES_COMPARISON)
  assert.deepEqual(selectWholeSeries(full, ['新增']), full)
})

test('deselectSeries 移除整组选择', () => {
  assert.deepEqual(deselectSeries(['单624', '626', '单637'], ['单624', '626']), ['单637'])
})

test('gradeRow 在缺少等级时返回零值行', () => {
  const row = gradeRow([], 'C')

  assert.deepEqual(row, {
    grade: 'C',
    salesQuantity: 0,
    salesAmount: 0,
    weightedAvgPrice: null,
    quantityShare: null,
  })
})
