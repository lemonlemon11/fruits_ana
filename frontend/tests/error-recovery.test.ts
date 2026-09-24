import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERROR_STATE_TTL_MS,
  classifyApiFailure,
  createFatalErrorState,
  readFatalError,
  safeReturnPath,
  saveFatalError,
  type FatalErrorState,
} from '../src/utils/errorRecovery.ts'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

test('页面读取请求的系统故障进入默认错误页', () => {
  assert.equal(classifyApiFailure({ kind: 'http', status: 503, method: 'GET', url: '/api/analytics/overview' }), 'server')
  assert.equal(classifyApiFailure({ kind: 'network', status: null, method: 'GET', url: '/api/settlements' }), 'network')
  assert.equal(classifyApiFailure({ kind: 'timeout', status: null, method: 'HEAD', url: '/api/analytics/overview' }), 'timeout')
  assert.equal(classifyApiFailure({ kind: 'invalid-response', status: 200, method: 'GET', url: '/api/analytics/overview' }), 'server')
  assert.equal(classifyApiFailure({ kind: 'http', status: 403, method: 'GET', url: '/api/analytics/overview' }), 'forbidden')
})

test('404 仅在明确的页面读取模式进入不存在页面', () => {
  const failure = { kind: 'http' as const, status: 404, method: 'GET', url: '/api/settlements/missing' }
  assert.equal(classifyApiFailure(failure), null)
  assert.equal(classifyApiFailure({ ...failure, failureMode: 'page' }), 'not-found')
})

test('写请求、局部请求与取消请求不自动离开当前页面', () => {
  assert.equal(classifyApiFailure({ kind: 'http', status: 503, method: 'POST', url: '/api/entry' }), null)
  assert.equal(classifyApiFailure({ kind: 'http', status: 503, method: 'GET', url: '/api/notifications', failureMode: 'inline' }), null)
  assert.equal(classifyApiFailure({ kind: 'abort', status: null, method: 'GET', url: '/api/analytics/overview' }), null)
  assert.equal(classifyApiFailure({ kind: 'http', status: 422, method: 'GET', url: '/api/analytics/overview' }), null)
})

test('来源路径只接受站内地址并排除错误页自身', () => {
  assert.equal(safeReturnPath('/settlements?page=2'), '/settlements?page=2')
  assert.equal(safeReturnPath('//evil.example/path'), null)
  assert.equal(safeReturnPath('https://evil.example/path'), null)
  assert.equal(safeReturnPath('/error'), null)
  assert.equal(safeReturnPath('/error?again=1'), null)
})

test('错误状态只保留安全恢复信息', () => {
  const nowMs = Date.parse('2026-09-23T00:00:00.000Z')
  const state = createFatalErrorState({
    kind: 'server',
    from: 'https://evil.example/path',
    status: 503,
    requestId: 'req-123',
    source: 'api',
  }, nowMs)

  assert.deepEqual(state, {
    kind: 'server',
    from: null,
    status: 503,
    requestId: 'req-123',
    occurredAt: '2026-09-23T00:00:00.000Z',
    source: 'api',
  })
})

test('sessionStorage 中的错误状态过期后自动清除', () => {
  const nowMs = Date.parse('2026-09-23T00:00:00.000Z')
  const storage = new MemoryStorage()
  const state: FatalErrorState = {
    kind: 'network',
    from: '/overview',
    status: null,
    requestId: null,
    occurredAt: new Date(nowMs).toISOString(),
    source: 'api',
  }
  saveFatalError(state, storage)

  assert.deepEqual(readFatalError(storage, nowMs + ERROR_STATE_TTL_MS - 1), state)
  assert.equal(readFatalError(storage, nowMs + ERROR_STATE_TTL_MS + 1), null)
  assert.equal(storage.length, 0)
})
