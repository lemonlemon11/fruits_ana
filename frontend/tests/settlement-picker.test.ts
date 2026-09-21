import assert from 'node:assert/strict'
import test from 'node:test'

import type { SettlementListItem } from '../src/api/types.ts'
import {
  addWholeSeries,
  filterSettlementOptions,
  groupByCategory,
  initialSameSeriesSelection,
  isWholeSeriesSelected,
  normalizeSameSeriesSelection,
  paginateSettlementOptions,
  parseSelectedParam,
  serializeSelectedParam,
  sortByRecentArrival,
  toggleDraftSelection,
} from '../src/utils/settlementPicker.ts'

function settlement(overrides: Partial<SettlementListItem>): SettlementListItem {
  return {
    merchantNo: '626',
    merchantNoNormalized: '626',
    orderNo: '宝贝L004',
    orderNoNormalized: '宝贝-004',
    fruitType: '榴莲',
    series: '宝贝',
    containerNo: 'TCLU1234567',
    vehicleNo: '',
    arrivalDate: '',
    saleDateStart: '2026-08-01',
    saleDateEnd: '2026-08-10',
    salesAmount: 1000,
    totalQuantity: 10,
    averagePrice: 100,
    gradeQuantities: { A: 1, B: 1, AB: 0, C: 1, D: 0, E: 0, F: 0, OTHER: 0 },
    recordCount: 3,
    ...overrides,
  }
}

const OPTIONS = [
  settlement({ merchantNo: '626', orderNo: '宝贝L004' }),
  settlement({ merchantNo: '单637', orderNo: '宝贝01' }),
  settlement({ merchantNo: '888', orderNo: '金果A2', series: '金果', containerNo: 'OOLU7654321' }),
]

test('filterSettlementOptions 按商号、单号、系列与柜号搜索', () => {
  assert.equal(filterSettlementOptions(OPTIONS, '').length, 3)
  assert.deepEqual(
    filterSettlementOptions(OPTIONS, '637').map((item) => item.merchantNo),
    ['单637'],
  )
  assert.deepEqual(
    filterSettlementOptions(OPTIONS, '金果').map((item) => item.merchantNo),
    ['888'],
  )
  assert.deepEqual(
    filterSettlementOptions(OPTIONS, 'oolu').map((item) => item.merchantNo),
    ['888'],
  )
  assert.equal(filterSettlementOptions(OPTIONS, '不存在').length, 0)
})

test('groupByCategory 按品类分组，缺失品类归入未识别品类', () => {
  const items = [
    settlement({ merchantNo: '626', fruitType: '榴莲' }),
    settlement({ merchantNo: '单637', fruitType: '榴莲' }),
    settlement({ merchantNo: '888', orderNo: '金果A2', series: '金果', fruitType: '山竹' }),
    settlement({ merchantNo: '999', fruitType: '' }),
  ]

  assert.deepEqual(
    groupByCategory(items).map((group) => [group.category, group.items.map((item) => item.merchantNo)]),
    [
      ['榴莲', ['626', '单637']],
      ['山竹', ['888']],
      ['未识别品类', ['999']],
    ],
  )
})

test('toggleDraftSelection 支持勾选、取消与上限保护', () => {
  const first = toggleDraftSelection([], '626', 2)
  assert.deepEqual(first, { next: ['626'], limited: false })

  const second = toggleDraftSelection(first.next, '单637', 2)
  assert.deepEqual(second, { next: ['626', '单637'], limited: false })

  const blocked = toggleDraftSelection(second.next, '888', 2)
  assert.deepEqual(blocked, { next: ['626', '单637'], limited: true })

  const removed = toggleDraftSelection(second.next, '626', 2)
  assert.deepEqual(removed, { next: ['单637'], limited: false })
})

test('addWholeSeries 追加去重并按上限截断', () => {
  const result = addWholeSeries(['888'], ['626', '单637', '888'], 2)
  assert.deepEqual(result, { next: ['888', '626'], limited: true })

  const all = addWholeSeries([], ['626', '单637'], 6)
  assert.deepEqual(all, { next: ['626', '单637'], limited: false })
})

test('isWholeSeriesSelected 只在整组都选中时返回 true', () => {
  assert.equal(isWholeSeriesSelected(['626', '单637'], ['626', '单637']), true)
  assert.equal(isWholeSeriesSelected(['626'], ['626', '单637']), false)
  assert.equal(isWholeSeriesSelected([], []), false)
})

test('sortByRecentArrival 按到达日期从近到远，同日期按商号', () => {
  const items = [
    settlement({ merchantNo: 'A', saleDateStart: '2026-08-01' }),
    settlement({ merchantNo: 'C', saleDateStart: '2026-09-09' }),
    settlement({ merchantNo: 'B', saleDateStart: '2026-09-09' }),
    settlement({ merchantNo: 'D', saleDateStart: '' }),
  ]

  assert.deepEqual(
    sortByRecentArrival(items).map((item) => item.merchantNo),
    ['B', 'C', 'A', 'D'],
  )
  // 不改动入参数组
  assert.equal(items[0].merchantNo, 'A')
})

test('parseSelectedParam 去掉空值、重复项并按上限截断', () => {
  assert.deepEqual(parseSelectedParam('640, 单637 ,640'), ['640', '单637'])
  assert.deepEqual(parseSelectedParam(['626', '640']), ['626', '640'])
  assert.deepEqual(parseSelectedParam('640,单637,626', 2), ['640', '单637'])
  assert.deepEqual(parseSelectedParam(undefined), [])
  assert.deepEqual(parseSelectedParam(' , '), [])
})

test('serializeSelectedParam 与 parseSelectedParam 互为逆运算', () => {
  const value = ['640', '单637', '626']
  assert.equal(serializeSelectedParam(value), '640,单637,626')
  assert.deepEqual(parseSelectedParam(serializeSelectedParam(value)), value)
  assert.equal(serializeSelectedParam([]), '')
})


test('paginateSettlementOptions 返回安全页码与当前页数据', () => {
  const page = paginateSettlementOptions(OPTIONS, 1, 2)
  assert.equal(page.page, 1)
  assert.equal(page.pages, 2)
  assert.equal(page.total, 3)
  assert.deepEqual(page.items.map((item) => item.merchantNo), ['626', '单637'])
  assert.equal(paginateSettlementOptions(OPTIONS, 99, 2).page, 2)
  assert.deepEqual(paginateSettlementOptions(OPTIONS, 99, 2).items.map((item) => item.merchantNo), ['888'])
})

test('initialSameSeriesSelection 默认选择有至少两张的品牌，且不跨品牌', () => {
  assert.deepEqual(initialSameSeriesSelection(OPTIONS, 3), ['626', '单637'])
  assert.deepEqual(initialSameSeriesSelection([OPTIONS[2]], 3), ['888'])
})

test('normalizeSameSeriesSelection 收敛跨品牌历史选择', () => {
  assert.deepEqual(normalizeSameSeriesSelection(OPTIONS, ['单637', '888'], 3), ['626', '单637'])
  assert.deepEqual(normalizeSameSeriesSelection(OPTIONS, ['888'], 3), ['626', '单637'])
  assert.deepEqual(normalizeSameSeriesSelection(OPTIONS, [], 3), ['626', '单637'])
})
