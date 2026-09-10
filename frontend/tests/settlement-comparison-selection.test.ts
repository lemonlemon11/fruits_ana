import assert from 'node:assert/strict'
import test from 'node:test'

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
