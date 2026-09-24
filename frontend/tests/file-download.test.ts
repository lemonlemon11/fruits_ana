import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchDownload, parseDownloadFilename } from '../src/utils/fileDownload.ts'

test('下载文件名优先解析 UTF-8 Content-Disposition', () => {
  assert.equal(
    parseDownloadFilename("attachment; filename*=UTF-8''%E7%BB%93%E7%AE%97%E5%8D%95.xlsx", 'fallback.xlsx'),
    '结算单.xlsx',
  )
  assert.equal(
    parseDownloadFilename('attachment; filename="report.csv"', 'fallback.csv'),
    'report.csv',
  )
})

test('文件下载请求携带登录 Cookie 并返回 Blob', async () => {
  let requestOptions: RequestInit | undefined
  const result = await fetchDownload('/api/export', 'fallback.xlsx', async (_input, options) => {
    requestOptions = options
    return new Response(new Blob(['xlsx']), {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''%E6%8A%A5%E8%A1%A8.xlsx",
      },
    })
  })

  assert.equal(requestOptions?.credentials, 'include')
  assert.equal(result.filename, '报表.xlsx')
  assert.equal(await result.blob.text(), 'xlsx')
})

test('文件下载失败时读取后端 detail 文案', async () => {
  await assert.rejects(
    fetchDownload('/api/export', 'fallback.xlsx', async () => new Response(
      JSON.stringify({ detail: '当前范围没有可导出的数据' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )),
    /当前范围没有可导出的数据/,
  )
})
