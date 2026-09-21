import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const source = fs.readFileSync(path.join(root, 'components', 'DateRangeFilter.vue'), 'utf8')

test('日期筛选使用 Element Plus 日期范围组件并保持双绑定', () => {
  assert.match(source, /ElDatePicker/)
  assert.match(source, /type="daterange"/)
  assert.match(source, /value-format="YYYY-MM-DD"/)
  assert.match(source, /'update:startDate'/)
  assert.match(source, /'update:endDate'/)
  assert.match(source, /ref="root" class="date-range-filter"/)
})

test('日期筛选使用中文环境配置', () => {
  assert.match(source, /ElConfigProvider/)
  assert.match(source, /zhCn/)
})

test('手机端日期筛选切到原生 date 输入，避免聚焦后页面缩放', () => {
  assert.match(source, /@media \(max-width: 820px\)/)
  assert.match(source, /type="date"/)
  assert.match(source, /date-range-native/)
  assert.match(source, /\.date-range-control \{[\s\S]*?display: none;[\s]*\}/)
})
