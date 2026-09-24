import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const mainSource = fs.readFileSync(path.join(root, 'main.ts'), 'utf8')
const shellSource = fs.readFileSync(path.join(root, 'AppShell.vue'), 'utf8')

test('路由注册默认错误页和未知地址 404 入口', () => {
  assert.match(mainSource, /path:\s*'\/error'[\s\S]*?ErrorView\.vue[\s\S]*?errorPage:\s*true/)
  assert.match(mainSource, /path:\s*'\/:pathMatch\(\.\*\)\*'/)
  assert.match(mainSource, /kind:\s*'not-found'/)
  assert.match(mainSource, /source:\s*'navigation'/)
})

test('权限不足进入 403 错误页而不是静默跳到其他菜单', () => {
  assert.match(mainSource, /kind:\s*'forbidden'/)
  assert.match(mainSource, /source:\s*'auth'/)
  assert.match(mainSource, /return\s+\{\s*path:\s*'\/error'/)
})

test('路由模块刷新一次后仍失败时进入错误页', () => {
  assert.match(mainSource, /createRouteChunkRecovery/)
  assert.match(mainSource, /vite:preloadError/)
  assert.match(mainSource, /kind:\s*'route'/)
  assert.match(mainSource, /source:\s*'router'/)
})

test('路由切换广播开始与结束状态，工作台提供即时加载反馈', () => {
  assert.match(mainSource, /reportNavigationStart/)
  assert.match(mainSource, /reportNavigationEnd/)
  assert.match(shellSource, /NAVIGATION_START_EVENT/)
  assert.match(shellSource, /NAVIGATION_END_EVENT/)
  assert.match(shellSource, /class="route-loading-bar"/)
  assert.match(shellSource, /aria-live="polite"/)
  assert.match(shellSource, /navigationPendingPath/)
})

test('Vue、window error 和 unhandledrejection 统一进入运行时错误页', () => {
  assert.match(mainSource, /app\.config\.errorHandler/)
  assert.match(mainSource, /addEventListener\('error'/)
  assert.match(mainSource, /addEventListener\('unhandledrejection'/)
  assert.match(mainSource, /kind:\s*'runtime'/)
  assert.match(mainSource, /FATAL_ERROR_EVENT/)
})

test('错误页在已登录状态保留工作台外壳和独立页签', () => {
  assert.match(shellSource, /TriangleAlert/)
  assert.match(shellSource, /path:\s*'\/error'/)
  assert.match(shellSource, /label:\s*'页面错误'/)
  assert.match(shellSource, /errorPage/)
})

test('通知轮询只在认证完成的普通业务页启动，避免初始路由竞态', () => {
  const mountedBlock = shellSource.match(/onMounted\(\(\)\s*=>\s*\{[\s\S]*?\n\}\)\nwatch\(/)?.[0] ?? ''

  assert.match(shellSource, /canLoadNotifications\s*=\s*computed/)
  assert.match(shellSource, /authReady\.value/)
  assert.match(shellSource, /Boolean\(currentUser\.value\)/)
  assert.match(shellSource, /!authPage\.value/)
  assert.match(shellSource, /!errorPage\.value/)
  assert.match(shellSource, /watch\(canLoadNotifications/)
  assert.doesNotMatch(mountedBlock, /void loadNotifications\(\)/)
})
