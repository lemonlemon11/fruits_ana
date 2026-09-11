import assert from 'node:assert/strict'
import test from 'node:test'

import * as api from '../src/api/client.ts'

type AuthApi = {
  getCurrentUser?: () => Promise<{ displayName: string }>
  login?: (payload: { displayName: string; password: string; rememberMe?: boolean }) => Promise<{ displayName: string }>
}

test('authentication requests include the session cookie', async (context) => {
  const authApi = api as AuthApi
  assert.equal(typeof authApi.getCurrentUser, 'function')
  const originalFetch = globalThis.fetch
  let requestOptions: RequestInit | undefined
  globalThis.fetch = async (_input, options) => {
    requestOptions = options
    return new Response(JSON.stringify({ user: { id: 1, display_name: '果农' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  context.after(() => { globalThis.fetch = originalFetch })

  const user = await authApi.getCurrentUser!()

  assert.equal(requestOptions?.credentials, 'include')
  assert.equal(user.displayName, '果农')
})

test('login sends the remember-me choice in the JSON payload', async (context) => {
  const authApi = api as AuthApi
  assert.equal(typeof authApi.login, 'function')
  const originalFetch = globalThis.fetch
  let requestOptions: RequestInit | undefined
  globalThis.fetch = async (_input, options) => {
    requestOptions = options
    return new Response(JSON.stringify({ user: { id: 2, display_name: '用户' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  context.after(() => { globalThis.fetch = originalFetch })

  await authApi.login!({ displayName: '用户', password: 'password123', rememberMe: true })

  assert.equal(requestOptions?.method, 'POST')
  assert.equal(requestOptions?.headers && (requestOptions.headers as Record<string, string>)['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(String(requestOptions?.body)), {
    display_name: '用户',
    password: 'password123',
    remember_me: true,
  })
})
