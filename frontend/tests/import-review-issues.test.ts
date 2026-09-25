import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  cellClassFor,
  rowClassFor,
  SALES_FIELD_TO_CELL,
} from '../src/utils/importReviewIssues.ts'
import type { ImportReviewIssue } from '../src/api/types.ts'

function issue(overrides: Partial<ImportReviewIssue> = {}): ImportReviewIssue {
  return {
    code: 'data_issue',
    severity: 'error',
    message: '数据有问题',
    section: 'sales',
    row: 1,
    field: '',
    rawValue: '',
    ...overrides,
  }
}

test('rowClassFor 只有同分区同行存在 error 时标红，warning 或异行不标红', () => {
  const cases: Array<{ issues: ImportReviewIssue[]; expected: string }> = [
    { issues: [issue()], expected: 'row-invalid' },
    { issues: [issue({ severity: 'warning' })], expected: '' },
    { issues: [issue({ section: 'after_sales' })], expected: '' },
    { issues: [issue({ row: 2 })], expected: '' },
    { issues: [], expected: '' },
  ]
  for (const item of cases) {
    assert.equal(rowClassFor(item.issues, 'sales', 1), item.expected)
  }
})

test('rowClassFor 兼容字符串行号和 0 行', () => {
  assert.equal(rowClassFor([issue({ row: '1' })], 'sales', 1), 'row-invalid')
  assert.equal(rowClassFor([issue({ row: 0 })], 'sales', 0), 'row-invalid')
  assert.equal(rowClassFor([issue({ row: null })], 'sales', 1), '')
})

test('cellClassFor 整行 error 会让该行所有单元格标红', () => {
  const issues = [issue({ section: 'sales', row: 2, field: '' })]
  assert.equal(cellClassFor(issues, 'sales', 2, 'sale_date'), 'cell-error')
  assert.equal(cellClassFor(issues, 'sales', 2, 'variety'), 'cell-error')
  assert.equal(cellClassFor(issues, 'sales', 1, 'sale_date'), '')
})

test('cellClassFor 字段级 error 只命中对应单元格', () => {
  const issues = [issue({ section: 'sales', row: 2, field: 'sale_date' })]
  assert.equal(cellClassFor(issues, 'sales', 2, 'sale_date'), 'cell-error')
  assert.equal(cellClassFor(issues, 'sales', 2, 'variety'), '')
})

test('cellClassFor 销售字段完整映射到表格单元格', () => {
  for (const [field, cellKey] of Object.entries(SALES_FIELD_TO_CELL)) {
    const issues = [issue({ section: 'sales', row: 1, field })]
    assert.equal(cellClassFor(issues, 'sales', 1, field), 'cell-error')
    assert.equal(cellClassFor(issues, 'sales', 1, cellKey), 'cell-error')
  }
})

test('cellClassFor warning 标黄，同字段 error 优先于 warning', () => {
  assert.equal(
    cellClassFor([issue({ severity: 'warning', field: 'sale_date' })], 'sales', 1, 'sale_date'),
    'cell-warning',
  )
  assert.equal(
    cellClassFor(
      [
        issue({ severity: 'warning', field: 'sale_date' }),
        issue({ severity: 'error', field: 'sale_date' }),
      ],
      'sales',
      1,
      'sale_date',
    ),
    'cell-error',
  )
})

test('cellClassFor 售后与费用分区不传字段时，按整行判定', () => {
  assert.equal(
    cellClassFor([issue({ section: 'fees', row: 1, field: '' })], 'fees', 1),
    'cell-error',
  )
  assert.equal(
    cellClassFor([issue({ section: 'after_sales', row: 1, severity: 'warning', field: '' })], 'after_sales', 1),
    'cell-warning',
  )
})

test('二次确认问题行底色已加深并保留内描边', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const source = fs.readFileSync(path.join(root, 'views', 'ImportReviewView.vue'), 'utf8')
  assert.match(source, /\.review-table :deep\(tbody tr\.row-invalid\),[\s\S]*?background: #ffd9d6 !important;/)
  assert.doesNotMatch(source, /\.review-table :deep\(tbody tr\.row-invalid\),[\s\S]*?background: #fff1f0 !important;/)
  assert.match(source, /\.review-table :deep\(tbody tr\.row-invalid\) td \{ box-shadow: inset 0 0 0 1px #f2b0ac; \}/)
})
