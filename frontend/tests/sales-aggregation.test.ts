import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateSaleRows, saleSourceText } from '../src/utils/salesAggregation.ts'
import type { EntrySaleItem } from '../src/api/types.ts'

function row(overrides: Partial<EntrySaleItem>): EntrySaleItem {
  return {
    sourceRow: null,
    saleDate: '2026-09-17',
    variety: '金枕',
    grade: 'B',
    headCount: '4',
    specKg: '9',
    remark: '',
    salesQuantity: 10,
    unitPrice: 200,
    amount: 2000,
    ...overrides,
  }
}

test('同一天/同规格/同重量/同单价/同备注 的行合并，数量与金额汇总', () => {
  const merged = aggregateSaleRows([
    row({ sourceRow: 13, salesQuantity: 20, amount: 4000 }),
    row({ sourceRow: 14, salesQuantity: 21, amount: 4200 }),
    row({ sourceRow: 15, salesQuantity: 9, amount: 1800 }),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].salesQuantity, 50)
  assert.equal(merged[0].amount, 10000)
  assert.equal(merged[0].sourceRow, 13)
  assert.equal(merged[0].sourceRowTo, 15)
})

test('任一聚合维度不同都不合并：日期/头数/KG/单价/备注', () => {
  const merged = aggregateSaleRows([
    row({ sourceRow: 1 }),
    row({ sourceRow: 2, saleDate: '2026-09-18' }),
    row({ sourceRow: 3, headCount: '3' }),
    row({ sourceRow: 4, specKg: '10' }),
    row({ sourceRow: 5, unitPrice: 210, amount: 2100 }),
    row({ sourceRow: 6, remark: '裂果' }),
  ])
  assert.equal(merged.length, 6)
})

test('品种或等级不同的行不合并（与导出口径一致）', () => {
  const merged = aggregateSaleRows([
    row({ sourceRow: 1, grade: 'A' }),
    row({ sourceRow: 2, grade: 'B' }),
    row({ sourceRow: 3, variety: '宝贝' }),
  ])
  assert.equal(merged.length, 3)
})

test('空备注归为一组，空白数量按 0 汇总，顺序按首次出现保留', () => {
  const merged = aggregateSaleRows([
    row({ sourceRow: 9, remark: '', salesQuantity: '', amount: 0 }),
    row({ sourceRow: 2, remark: '尾货', salesQuantity: 5, amount: 1000 }),
    row({ sourceRow: 4, remark: '', salesQuantity: 3, amount: 600 }),
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].remark, '')
  assert.equal(merged[0].salesQuantity, 3)
  assert.equal(merged[0].sourceRow, 4)
  assert.equal(merged[0].sourceRowTo, 9)
  assert.equal(saleSourceText(merged[0]), '4~9')
  assert.equal(merged[1].remark, '尾货')
})

test('saleSourceText：合并行显示区间，普通行显示行号，无行号显示新增', () => {
  assert.equal(saleSourceText({ ...row({}), sourceRow: 13, sourceRowTo: 15 }), '13~15')
  assert.equal(saleSourceText({ ...row({}), sourceRow: 13, sourceRowTo: 13 }), '13')
  assert.equal(saleSourceText({ ...row({}), sourceRow: null, sourceRowTo: null }), '新增')
})
