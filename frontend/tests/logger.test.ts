import assert from 'node:assert/strict'
import test from 'node:test'

import { createLogger } from '../src/utils/logger.ts'

test('createLogger 输出统一 scope 前缀', () => {
  const original = console.info
  const calls: unknown[][] = []
  console.info = (...args: unknown[]) => { calls.push(args) }
  try {
    createLogger('unit').info('hello', { count: 1 })
  } finally {
    console.info = original
  }

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.[0], '[unit] hello')
})

test('logger 自动脱敏密码、token 等敏感字段', () => {
  const original = console.error
  const calls: unknown[][] = []
  console.error = (...args: unknown[]) => { calls.push(args) }
  try {
    createLogger('unit').error('auth failed', {
      username: 'admin',
      password: 'secret',
      Authorization: 'Bearer token',
      nested: { api_key: 'value', visible: 'ok' },
    })
  } finally {
    console.error = original
  }

  assert.equal(calls.length, 1)
  const payload = calls[0]?.[1] as Record<string, unknown>
  assert.equal(payload.username, 'admin')
  assert.equal(payload.password, '[REDACTED]')
  assert.equal(payload.Authorization, '[REDACTED]')
  assert.deepEqual(payload.nested, { api_key: '[REDACTED]', visible: 'ok' })
})

