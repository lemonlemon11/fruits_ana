import assert from 'node:assert/strict'
import test from 'node:test'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

test('路由分片识别覆盖 JS、CSS 与 Safari 模块错误', async () => {
  const recovery = await import('../src/utils/routeChunkRecovery.ts').catch(() => null)
  assert.ok(recovery, '应提供独立的路由分片恢复模块')

  assert.equal(recovery.isRouteChunkLoadError(new Error('Failed to fetch dynamically imported module')), true)
  assert.equal(recovery.isRouteChunkLoadError(new Error('Unable to preload CSS for /assets/page.css')), true)
  assert.equal(recovery.isRouteChunkLoadError(new Error('Importing a module script failed.')), true)
  assert.equal(recovery.isRouteChunkLoadError(new Error('网络异常，请检查连接后重试')), false)
})

test('分片首次失败只刷新一次，再失败时进入 exhausted', async () => {
  const recovery = await import('../src/utils/routeChunkRecovery.ts').catch(() => null)
  assert.ok(recovery, '应提供独立的路由分片恢复模块')

  const storage = new MemoryStorage()
  const replaced: string[] = []
  const firstPage = recovery.createRouteChunkRecovery({
    storage,
    origin: 'https://fruit.example',
    replace: (url: string) => replaced.push(url),
    now: () => 123456,
  })

  assert.equal(firstPage.handle(new Error('Unable to preload CSS for /assets/page.css'), '/settlements?page=2'), 'reload')
  assert.deepEqual(replaced, ['https://fruit.example/settlements?page=2&_route_reload=123456'])
  assert.equal(firstPage.handle(new Error('Unable to preload CSS for /assets/page.css'), '/settlements?page=2'), 'pending')

  const reloadedPage = recovery.createRouteChunkRecovery({
    storage,
    origin: 'https://fruit.example',
    replace: (url: string) => replaced.push(url),
    now: () => 123457,
  })
  assert.equal(reloadedPage.handle(new Error('Failed to fetch dynamically imported module'), '/settlements'), 'exhausted')
  assert.equal(replaced.length, 1)

  reloadedPage.clear()
  assert.equal(storage.length, 0)
})

test('导航反馈事件携带目标路径并能正常结束', async () => {
  const feedback = await import('../src/utils/navigationFeedback.ts').catch(() => null)
  assert.ok(feedback, '应提供独立的导航反馈模块')

  const target = new EventTarget()
  const seen: Array<{ type: string; path?: string }> = []
  target.addEventListener(feedback.NAVIGATION_START_EVENT, (event: Event) => {
    seen.push({ type: 'start', path: (event as CustomEvent<{ path: string }>).detail.path })
  })
  target.addEventListener(feedback.NAVIGATION_END_EVENT, () => seen.push({ type: 'end' }))

  feedback.reportNavigationStart('/settlements', target)
  feedback.reportNavigationEnd(target)

  assert.deepEqual(seen, [{ type: 'start', path: '/settlements' }, { type: 'end' }])
})
