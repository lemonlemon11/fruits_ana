import assert from 'node:assert/strict'
import test from 'node:test'

import * as api from '../src/api/client.ts'
import { AUTH_EXPIRED_EVENT } from '../src/utils/errorRecovery.ts'

type AuthApi = {
  getCurrentUser?: () => Promise<{ displayName: string }>
  login?: (payload: { displayName: string; password: string; rememberMe?: boolean }) => Promise<{ displayName: string }>
  register?: (payload: { displayName: string; password: string; email: string; verificationCode: string }) => Promise<{ displayName: string }>
  sendCode?: (email: string) => Promise<void>
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

test('guest authentication 401 stays inline and does not publish a session-expired event', async (context) => {
  const authApi = api as AuthApi
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const events: Event[] = []
  globalThis.window = {
    dispatchEvent: (event: Event) => {
      if (event.type === AUTH_EXPIRED_EVENT) events.push(event)
      return true
    },
  } as unknown as Window & typeof globalThis
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '用户名或密码错误' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
  context.after(() => {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  await assert.rejects(
    () => authApi.login!({ displayName: '用户', password: 'wrong-password' }),
    (error: unknown) => error instanceof api.ApiError && error.status === 401,
  )
  await assert.rejects(
    () => authApi.register!({
      displayName: '用户',
      password: 'password123',
      email: 'farmer@example.com',
      verificationCode: '123456',
    }),
    (error: unknown) => error instanceof api.ApiError && error.status === 401,
  )
  await assert.rejects(
    () => authApi.sendCode!('farmer@example.com'),
    (error: unknown) => error instanceof api.ApiError && error.status === 401,
  )
  assert.equal(events.length, 0)
})

test('session restore 401 is handled by the route guard without publishing a global event', async (context) => {
  const authApi = api as AuthApi
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const events: Event[] = []
  globalThis.window = {
    dispatchEvent: (event: Event) => {
      if (event.type === AUTH_EXPIRED_EVENT) events.push(event)
      return true
    },
  } as unknown as Window & typeof globalThis
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '未登录' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
  context.after(() => {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  await assert.rejects(
    () => authApi.getCurrentUser!(),
    (error: unknown) => error instanceof api.ApiError && error.status === 401,
  )
  assert.equal(events.length, 0)
})
