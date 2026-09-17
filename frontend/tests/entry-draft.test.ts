import assert from 'node:assert/strict'
import test from 'node:test'

import type { EntryPayload } from '../src/api/types.ts'
import {
  clearEntryDraft,
  describeEntryDraft,
  draftRelativeTime,
  draftTitle,
  entryDraftKey,
  hasEntryDraftContent,
  parseEntryDraft,
  readEntryDraft,
  saveEntryDraft,
  type DraftStorage,
  type EntryDraft,
} from '../src/utils/entryDraft.ts'

function memoryStorage(seed: Record<string, string> = {}): DraftStorage & { items: Record<string, string> } {
  const items = { ...seed }
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value },
    removeItem: (key) => { delete items[key] },
  }
}

function payload(overrides: Partial<EntryPayload> = {}): EntryPayload {
  return {
    merchantNo: '',
    orderNo: '',
    containerNo: '',
    vehicleNo: '',
    market: '',
    arrivalDate: '',
    arrivalQuantity: null,
    sales: [{ saleDate: '', variety: 'A', headCount: '1', specKg: '10', salesQuantity: 0, unitPrice: 20, remark: '' }],
    afterSales: [],
    fees: [],
    ...overrides,
  }
}

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    updatedAt: '2026-09-15T09:20:00.000Z',
    editing: false,
    merchantNo: '637',
    orderNo: '宝贝-001',
    salesCount: 2,
    payload: payload({ merchantNo: '637', orderNo: '宝贝-001' }),
    ...overrides,
  }
}

test('草稿按用户分键存储，不同账号互不覆盖', () => {
  const storage = memoryStorage()
  saveEntryDraft(storage, 1, draft())
  saveEntryDraft(storage, 2, draft({ merchantNo: '638' }))

  assert.equal(entryDraftKey(1), 'fruit-entry-draft:v1:1')
  assert.notEqual(entryDraftKey(1), entryDraftKey(2))
  assert.equal(readEntryDraft(storage, 1)?.merchantNo, '637')
  assert.equal(readEntryDraft(storage, 2)?.merchantNo, '638')
})

test('清空草稿后读不到内容，脏数据按没有草稿处理', () => {
  const storage = memoryStorage({ 'fruit-entry-draft:v1:1': '{oops' })
  assert.equal(readEntryDraft(storage, 1), null)

  saveEntryDraft(storage, 1, draft())
  clearEntryDraft(storage, 1)
  assert.equal(readEntryDraft(storage, 1), null)
  assert.equal(parseEntryDraft('{"updatedAt":"2026-09-15T09:20:00.000Z"}'), null)
  assert.equal(parseEntryDraft(null), null)
})

test('只有填过内容才留草稿，空表单不产生记录', () => {
  assert.equal(hasEntryDraftContent(payload()), false)
  assert.equal(hasEntryDraftContent(payload({ merchantNo: '637' })), true)
  assert.equal(hasEntryDraftContent(payload({ arrivalQuantity: 120 })), true)
  assert.equal(
    hasEntryDraftContent(payload({ sales: [{ saleDate: '2026-09-13', variety: 'A', headCount: '1', specKg: '10', salesQuantity: 0, unitPrice: 20, remark: '' }] })),
    true,
  )
  assert.equal(
    hasEntryDraftContent(payload({ afterSales: [{ content: '烂果扣款', summary: '', amount: 120 }] })),
    true,
  )
})

test('草稿相对时间与摘要文案只用于列表展示', () => {
  const now = Date.parse('2026-09-15T09:30:00.000Z')
  assert.equal(draftRelativeTime('2026-09-15T09:29:40.000Z', now), '刚刚')
  assert.equal(draftRelativeTime('2026-09-15T09:20:00.000Z', now), '10 分钟前')
  assert.equal(draftRelativeTime('2026-09-15T07:20:00.000Z', now), '2 小时前')
  assert.equal(draftRelativeTime('2026-09-14T07:20:00.000Z', now), '1 天前')
  assert.equal(draftRelativeTime('not-a-date', now), '时间未知')

  assert.equal(describeEntryDraft(draft(), now), '宝贝-001 · 2 行明细 · 最后编辑 10 分钟前')
  assert.equal(describeEntryDraft(draft({ orderNo: '' }), now), '2 行明细 · 最后编辑 10 分钟前')
})

test('草稿标题优先展示商号，没填商号时给出可读兜底', () => {
  assert.equal(draftTitle(draft()), '商号 637')
  assert.equal(draftTitle(draft({ merchantNo: '' })), '未命名的手工单')
  assert.equal(draftTitle(draft({ merchantNo: '', editing: true })), '正在修改的单据')
})
