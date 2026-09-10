import type { ImportBatch } from '../api/types'

export function summarizeImportResults(results: ImportBatch[]): string {
  if (!results.length) return '没有收到导入结果，请重新选择文件。'
  const imported = results.filter((item) => !['duplicate', 'conflict', 'failed'].includes(item.status.toLowerCase()))
  const duplicates = results.filter((item) => item.status.toLowerCase() === 'duplicate').length
  const conflicts = results.filter((item) => item.status.toLowerCase() === 'conflict').length
  const failed = results.filter((item) => item.status.toLowerCase() === 'failed').length
  const rowCount = imported.reduce((total, item) => total + item.successCount, 0)
  const issueCount = imported.reduce(
    (total, item) => total + item.warningCount + item.failureCount,
    0,
  )
  const parts = imported.length
    ? [`成功导入 ${imported.length} 个文件，共 ${rowCount} 条数据`]
    : ['没有文件导入成功']
  if (duplicates) parts.push(`跳过 ${duplicates} 个重复文件`)
  if (conflicts) parts.push(`${conflicts} 张结算单已存在，确认后可覆盖`)
  if (failed) parts.push(`${failed} 个文件导入失败，请检查文件后重新选择`)
  if (issueCount) parts.push(`${issueCount} 条问题需要核对`)
  return `${parts.join('；')}。`
}
