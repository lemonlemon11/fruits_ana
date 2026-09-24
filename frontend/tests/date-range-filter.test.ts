import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const source = fs.readFileSync(path.join(root, 'components', 'DateRangeFilter.vue'), 'utf8')

test('日期筛选默认使用轻量原生日期输入并保持双绑定', () => {
  assert.doesNotMatch(source, /element-plus/)
  assert.doesNotMatch(source, /ElDatePicker/)
  assert.equal((source.match(/type="date"/g) ?? []).length, 2)
  assert.match(source, /'update:startDate'/)
  assert.match(source, /'update:endDate'/)
  assert.match(source, /ref="root" class="date-range-filter"/)
})

test('日期输入在桌面和手机端共用同一结构，避免重复加载重型日历组件', () => {
  assert.match(source, /date-range-fields/)
  assert.match(source, /date-range-native-field/)
  assert.doesNotMatch(source, /date-range-control/)
  assert.doesNotMatch(source, /display:\s*none/)
})
