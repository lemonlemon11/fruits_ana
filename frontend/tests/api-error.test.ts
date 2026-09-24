import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError, deleteSettlement, getOverview } from '../src/api/client.ts'
import { FATAL_ERROR_EVENT } from '../src/utils/errorRecovery.ts'

test('读取请求的 HTTP 503 ApiError 保留请求编号并发布致命错误事件', async (context) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const events: CustomEvent[] = []
  globalThis.window = {
    dispatchEvent: (event: Event) => {
      if (event.type === FATAL_ERROR_EVENT) events.push(event as CustomEvent)
      return true
    },
    sessionStorage: { setItem() {}, getItem() { return null }, removeItem() {} } as Storage,
  } as unknown as Window & typeof globalThis
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '服务暂时不可用' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req-503' },
  })
  context.after(() => {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  await assert.rejects(
    () => getOverview(),
    (error: unknown) => error instanceof ApiError
      && error.status === 503
      && error.requestId === 'req-503'
      && error.kind === 'server',
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].detail.source, 'api')
})

test('写请求 HTTP 503 不发布致命错误事件', async (context) => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const events: Event[] = []
  globalThis.window = {
    dispatchEvent: (event: Event) => {
      if (event.type === FATAL_ERROR_EVENT) events.push(event)
      return true
    },
    sessionStorage: { setItem() {}, getItem() { return null }, removeItem() {} } as Storage,
  } as unknown as Window & typeof globalThis
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '删除失败' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req-write' },
  })
  context.after(() => {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  await assert.rejects(() => deleteSettlement('640'), ApiError)
  assert.equal(events.length, 0)
})
