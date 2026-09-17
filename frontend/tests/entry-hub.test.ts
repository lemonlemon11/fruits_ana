import assert from 'node:assert/strict'
import test from 'node:test'

import type { ImportBatch } from '../src/api/types.ts'
import {
  batchStatusDetail,
  batchStatusKind,
  batchStatusLabel,
  batchTitle,
  recentBatches,
} from '../src/utils/entryHub.ts'

function batch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 1,
    fileName: '宝贝-001.xlsx',
    merchantNo: '637',
    merchantNoNormalized: '637',
    orderNo: '宝贝-001',
    orderNoNormalized: '宝贝-001',
    importedAt: '2026-09-15T09:20:00',
    status: 'success',
    successCount: 42,
    warningCount: 0,
    failureCount: 0,
    errorSummary: '',
    ...overrides,
  }
}

test('批次状态按后端 success / partial / failed 归一为三档', () => {
  assert.equal(batchStatusKind(batch()), 'ok')
  assert.equal(batchStatusKind(batch({ status: 'partial', warningCount: 2 })), 'warn')
  assert.equal(batchStatusKind(batch({ status: 'conflict' })), 'warn')
  assert.equal(batchStatusKind(batch({ status: 'failed', failureCount: 3 })), 'bad')
  // 状态字面量缺失时按行数兜底，避免把有问题的批次显示成成功。
  assert.equal(batchStatusKind(batch({ status: 'unknown', warningCount: 1 })), 'warn')
  assert.equal(batchStatusKind(batch({ status: 'unknown', failureCount: 1 })), 'bad')
})

test('状态文案与说明对齐导入页口径', () => {
  assert.equal(batchStatusLabel('ok'), '成功')
  assert.equal(batchStatusLabel('warn'), '需关注')
  assert.equal(batchStatusLabel('bad'), '失败')
  assert.equal(batchStatusDetail(batch()), '成功 42 行')
  assert.equal(batchStatusDetail(batch({ status: 'partial', warningCount: 2 })), '2 行需要核对')
  assert.equal(batchStatusDetail(batch({ status: 'failed', failureCount: 3 })), '3 行未导入，需要重新处理')
  assert.equal(
    batchStatusDetail(batch({ status: 'failed', errorSummary: '文件表头无法识别' })),
    '文件表头无法识别',
  )
})

test('批次标题优先用单号，缺失时回落到文件名', () => {
  assert.equal(batchTitle(batch()), '宝贝-001 · 商号 637')
  assert.equal(batchTitle(batch({ orderNo: '', orderNoNormalized: '', merchantNo: '' })), '宝贝-001.xlsx')
  assert.equal(batchTitle(batch({ orderNo: '', orderNoNormalized: '', fileName: '' })), '未命名结算单')
})

test('最近导入只取最新几条，不倒序不改原数组', () => {
  const batches = [batch({ id: 1 }), batch({ id: 2 }), batch({ id: 3 }), batch({ id: 4 })]

  assert.deepEqual(recentBatches(batches).map((item) => item.id), [1, 2, 3])
  assert.deepEqual(recentBatches(batches, 2).map((item) => item.id), [1, 2])
  assert.deepEqual(recentBatches([], 2), [])
  assert.deepEqual(batches.map((item) => item.id), [1, 2, 3, 4])
})
