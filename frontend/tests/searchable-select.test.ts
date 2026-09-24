import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { filterSearchableOptions, searchableOptionLabel } from '../src/utils/searchableSelect.ts'

const componentSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'SearchableSelect.vue'),
  'utf8',
)

const options = [
  { value: '637', label: '商号 637（宝贝-003）' },
  { value: '640', label: '商号 640（金枕-001）' },
  { value: '', label: '全部结算单' },
]

test('搜索下拉按标签做大小写不敏感过滤', () => {
  assert.deepEqual(filterSearchableOptions(options, '金枕'), [options[1]])
  assert.deepEqual(filterSearchableOptions(options, '637'), [options[0]])
})

test('空白关键字返回全部选项，且会去除首尾空格', () => {
  assert.deepEqual(filterSearchableOptions(options, '   '), options)
})

test('未找到时返回空数组', () => {
  assert.deepEqual(filterSearchableOptions(options, '不存在的单号'), [])
})

test('根据取值回显下拉标签', () => {
  assert.equal(searchableOptionLabel(options, '640'), '商号 640（金枕-001）')
  assert.equal(searchableOptionLabel(options, '不存在'), '')
})

test('搜索下拉支持查询中的转圈与防重复选择', () => {
  assert.match(componentSource, /loading\?: boolean/)
  assert.match(componentSource, /:loading="loading"/)
  assert.match(componentSource, /:disabled="disabled \|\| loading"/)
  assert.match(componentSource, /:aria-busy="loading"/)
})
