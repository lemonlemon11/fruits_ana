import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const source = fs.readFileSync(path.join(root, 'components', 'DateRangeFilter.vue'), 'utf8')

test('日期筛选弹出层点击外部时通过 pointerdown 收起', () => {
  assert.match(source, /ref="root" class="date-range-filter"/)
  assert.match(source, /function handleDocumentPointerDown\(event: PointerEvent\)/)
  assert.match(source, /!root\.value\.contains\(event\.target as Node\)/)
  assert.match(source, /document\.addEventListener\('pointerdown', handleDocumentPointerDown\)/)
  assert.match(source, /document\.removeEventListener\('pointerdown', handleDocumentPointerDown\)/)
})
