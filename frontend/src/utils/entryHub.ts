import type { ImportBatch } from '../api/types'

/** 录单 / 导入入口页的纯逻辑：最近导入批次的状态与摘要。 */

export type BatchStatusKind = 'ok' | 'warn' | 'bad'

/** 入口页只展示最近几条，完整记录仍在数据导入页。 */
export const RECENT_BATCH_LIMIT = 3

const WARNING_STATUSES = ['warning', 'partial', 'conflict']

export function batchStatusKind(batch: ImportBatch): BatchStatusKind {
  const status = batch.status.toLowerCase()
  if (status === 'failed' || batch.failureCount > 0) return 'bad'
  if (WARNING_STATUSES.includes(status) || batch.warningCount > 0) return 'warn'
  return 'ok'
}

export function batchStatusLabel(kind: BatchStatusKind): string {
  if (kind === 'bad') return '失败'
  return kind === 'warn' ? '需关注' : '成功'
}

/** 与数据导入页一致的口径：失败优先说明失败原因，其次说明需要核对的行数。 */
export function batchStatusDetail(batch: ImportBatch): string {
  const kind = batchStatusKind(batch)
  if (kind === 'bad') return batch.errorSummary || `${batch.failureCount} 行未导入，需要重新处理`
  if (kind === 'warn') return `${batch.warningCount} 行需要核对`
  return `成功 ${batch.successCount} 行`
}

export function batchTitle(batch: ImportBatch): string {
  const orderNo = batch.orderNoNormalized || batch.orderNo
  if (orderNo && batch.merchantNo) return `${orderNo} · 商号 ${batch.merchantNoNormalized || batch.merchantNo}`
  return orderNo || batch.fileName || '未命名结算单'
}

export function recentBatches(batches: ImportBatch[], limit = RECENT_BATCH_LIMIT): ImportBatch[] {
  return batches.slice(0, Math.max(0, limit))
}
