import assert from 'node:assert/strict'
import test from 'node:test'

const statusModule = await import('../src/utils/importStatus.ts').catch(() => ({})) as Record<string, unknown>

test('import summary distinguishes failed, duplicate, warning and successful files', () => {
  const summarize = statusModule.summarizeImportResults
  assert.equal(typeof summarize, 'function')

  const message = (summarize as Function)([
    { status: 'success', successCount: 12, warningCount: 0, failureCount: 0 },
    { status: 'partial', successCount: 3, warningCount: 1, failureCount: 1 },
    { status: 'duplicate', successCount: 0, warningCount: 0, failureCount: 0 },
    { status: 'failed', successCount: 0, warningCount: 0, failureCount: 1 },
  ])

  assert.match(message, /成功导入 2 个文件，共 15 条数据/)
  assert.match(message, /跳过 1 个重复文件/)
  assert.match(message, /1 个文件导入失败/)
  assert.match(message, /2 条问题/)
})
