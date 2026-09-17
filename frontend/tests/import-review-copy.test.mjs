import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const review = fs.readFileSync(path.join(root, 'views', 'ImportReviewView.vue'), 'utf8')
const entry = fs.readFileSync(path.join(root, 'views', 'EntryView.vue'), 'utf8')

test('导入二次确认数量字段使用“数量（件）”文案', () => {
  assert.match(review, /label: '数量（件）'/)
  assert.doesNotMatch(review, /label: '销售数量'/)
  assert.match(review, /aria-label="数量（件）"/)
  assert.match(review, /总件数/)
})

test('导入二次确认品种保留用户原文输入，不使用下拉选择', () => {
  const varietyCell = review.match(/<template #cell-variety="\{ row \}">([\s\S]*?)<\/template>/)?.[1] ?? ''
  assert.match(varietyCell, /<input v-model="row\.variety"/)
  assert.doesNotMatch(varietyCell, /<select v-model="row\.variety"/)
})

test('手工录单同步使用“数量（件）”文案', () => {
  assert.match(entry, /label: '数量（件）'/)
  assert.doesNotMatch(entry, /label: '销售数量'/)
  assert.match(entry, /aria-label="数量（件）"/)
})
