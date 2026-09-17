import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSettlementComparison } from '../src/api/normalize.ts'
import * as comparisonUtils from '../src/utils/settlementComparison.ts'

const { initialComparisonSelection, settlementOptionLabel, toggleComparisonSelection } = comparisonUtils

test('defaults to two settlements and caps selection at three', () => {
  const items = [{ merchantNo: 'A' }, { merchantNo: 'B' }, { merchantNo: 'C' }, { merchantNo: 'D' }] as never[]
  assert.deepEqual(initialComparisonSelection(items), ['A', 'B'])
  assert.deepEqual(toggleComparisonSelection(['A', 'B'], 'C'), ['A', 'B', 'C'])
  assert.deepEqual(toggleComparisonSelection(['A', 'B', 'C'], 'D'), ['A', 'B', 'C'])
})

test('allows deselection and re-selection without duplicates', () => {
  assert.deepEqual(toggleComparisonSelection(['A', 'B'], 'A'), ['B'])
  assert.deepEqual(toggleComparisonSelection(['B'], 'A'), ['B', 'A'])
})

test('下拉框按「商号（单号）」展示，取值仍是商号', () => {
  assert.equal(settlementOptionLabel({ orderNo: '宝贝L004', merchantNo: '640' }), '商号 640（宝贝L004）')
  assert.equal(settlementOptionLabel({ orderNo: '', merchantNo: '640' }), '商号 640')
  assert.equal(settlementOptionLabel({ orderNo: '宝贝01', merchantNo: '' }), '宝贝01')
  assert.equal(settlementOptionLabel({}), '未知结算单')
})

test('builds grade price baseline from other settlements only', () => {
  const buildBaseline = (comparisonUtils as Record<string, unknown>).buildOtherSettlementGradeBaseline
  assert.equal(typeof buildBaseline, 'function')

  const items = [
    {
      merchantNo: '单624',
      grades: [
        { grade: 'A', salesQuantity: 10, salesAmount: 100 },
        { grade: 'B', salesQuantity: 2, salesAmount: 12 },
      ],
    },
    {
      merchantNo: '626',
      grades: [
        { grade: 'A', salesQuantity: 4, salesAmount: 80 },
        { grade: 'B', salesQuantity: 0, salesAmount: 0 },
      ],
    },
    {
      merchantNo: '单637',
      grades: [
        { grade: 'A', salesQuantity: 6, salesAmount: 60 },
        { grade: 'B', salesQuantity: 3, salesAmount: 30 },
      ],
    },
  ]

  const baseline = (buildBaseline as Function)(items, '单624')

  assert.equal(baseline.find((item: { grade: string }) => item.grade === 'A').weightedAvgPrice, 14)
  assert.equal(baseline.find((item: { grade: string }) => item.grade === 'B').weightedAvgPrice, 10)
})

test('统计同品牌其他结算单数量（后端同品牌分析的前置条件）', () => {
  const countPeers = (comparisonUtils as Record<string, unknown>).countSameBrandPeers as (
    items: unknown[],
    merchantNo: string,
  ) => number
  assert.equal(typeof countPeers, 'function')

  const items = [
    { merchantNo: '637', series: '宝贝', orderNo: '宝贝-003' },
    { merchantNo: '640', series: '宝贝', orderNo: '宝贝-004' },
    { merchantNo: '626', series: '宝贝', orderNo: '宝贝-002' },
    { merchantNo: '651', series: '金枕', orderNo: '金枕-001' },
  ]
  assert.equal(countPeers(items, '637'), 2)
  assert.equal(countPeers(items, '651'), 0)
  assert.equal(countPeers(items, '不存在'), 0)

  // 接口没给 series 时回退到单号前缀，规则与后端 series_name 一致。
  const withoutSeries = [
    { merchantNo: '637', series: '', orderNo: '宝贝-003' },
    { merchantNo: '640', series: '', orderNo: '宝贝L004' },
    { merchantNo: '651', series: '', orderNo: '金枕001' },
  ]
  assert.equal(countPeers(withoutSeries, '637'), 1)
  assert.equal(countPeers(withoutSeries, '651'), 0)
})

test('结算单对比数据保留后端返回的品牌字段', () => {
  const items = normalizeSettlementComparison({
    settlements: [
      { merchant_no: '637', order_no: '宝贝-003', order_no_normalized: '宝贝-003', series: '宝贝' },
      { merchant_no: '651', order_no: '金枕001' },
    ],
  })
  assert.equal(items[0].series, '宝贝')
  assert.equal(items[1].series, '')
})
