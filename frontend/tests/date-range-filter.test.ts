import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const source = fs.readFileSync(path.join(root, 'components', 'DateRangeFilter.vue'), 'utf8')

test('日期筛选使用单个日期范围选择器并保持双绑定', () => {
  assert.match(source, /ElDatePicker/)
  assert.match(source, /type="daterange"/)
  assert.match(source, /value-format="YYYY-MM-DD"/)
  assert.match(source, /range-separator="至"/)
  assert.match(source, /start-placeholder="开始日期"/)
  assert.match(source, /end-placeholder="结束日期"/)
  assert.match(source, /'update:startDate'/)
  assert.match(source, /'update:endDate'/)
  assert.match(source, /ref="root" class="date-range-filter"/)
})

test('日期范围选择器为单一控件，桌面与手机端共用同一结构', () => {
  assert.match(source, /date-range-control/)
  assert.match(source, /date-range-picker/)
  assert.doesNotMatch(source, /date-range-fields/)
  assert.doesNotMatch(source, /type="date"/)
})
