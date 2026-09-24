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

test('文件导入二次确认不提供“保存当前修改”，保留还原与确认提交', () => {
  assert.doesNotMatch(review, /@click="saveDraft"/)
  assert.match(review, /@click="restoreCurrentDraft"/)
  assert.match(review, /@click="openConfirm"/)
})

test('导入二次确认按具体操作展示等待文案', () => {
  assert.match(review, /type SavingAction = 'switch' \| 'restore' \| 'prepare' \| 'submit' \| ''/)
  assert.match(review, /正在切换文件…/)
  assert.match(review, /正在还原…/)
  assert.match(review, /正在保存…/)
  assert.match(review, /正在提交…/)
  assert.match(review, /savingAction === 'switch' \? savingMessage : '正在加载复核数据…'/)
  assert.match(review, /role="status" aria-live="polite"/)
})

test('手工录单区分暂存和正式保存状态', () => {
  assert.match(entry, /const draftSaving = ref\(false\)/)
  assert.match(entry, /暂存中…/)
  assert.match(entry, /保存中…/)
  assert.match(entry, /savingAsOverwrite \? '覆盖中…' : '保存中…'/)
  assert.match(entry, /const saved = await flushDraft\(\)/)
  assert.match(entry, /saved \? '已暂存，可稍后继续录单' : '暂存失败，请稍后重试'/)
})
