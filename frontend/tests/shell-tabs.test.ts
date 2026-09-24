import assert from 'node:assert/strict'
import test from 'node:test'

import {
  closeOtherTabs,
  closeTab,
  isClosableTab,
  nextActivePath,
  openTab,
  restoreTabs,
  type ShellTab,
} from '../src/utils/shellTabs.ts'

const KNOWN = new Set([
  '/overview',
  '/settlements',
  '/imports',
  '/settlement-detail',
  '/settlement-comparison',
  '/series-comparison',
])

function isKnownPath(path: string): boolean {
  return KNOWN.has(path)
}

function tab(path: string, fullPath = path): ShellTab {
  return { path, fullPath }
}

test('欢迎页固定不可关闭，所有业务页签都可关闭', () => {
  assert.equal(isClosableTab('/welcome'), false)
  assert.equal(isClosableTab('/overview'), true)
  assert.equal(isClosableTab('/settlements'), true)
})

test('打开已存在的页面不新增页签，只更新地址', () => {
  const tabs = [tab('/overview'), tab('/settlements')]

  assert.deepEqual(openTab(tabs, '/overview', '/overview'), tabs)
  assert.deepEqual(
    openTab(tabs, '/settlements', '/settlements?merchant=626').at(-1),
    tab('/settlements', '/settlements?merchant=626'),
  )
  assert.equal(openTab(tabs, '/settlements', '/settlements?x=1').length, tabs.length)
})

test('打开新页面追加到末尾并保持原有顺序', () => {
  const tabs = openTab(openTab([tab('/overview')], '/series-comparison', '/series-comparison'), '/settlements', '/settlements')

  assert.deepEqual(tabs.map((item) => item.path), ['/overview', '/series-comparison', '/settlements'])
})

test('关闭当前页签后激活右侧邻居，没有右侧则退回左侧', () => {
  const tabs = [tab('/overview'), tab('/settlements'), tab('/imports')]

  const afterFirst = closeTab(tabs, '/settlements')
  assert.deepEqual(afterFirst.map((item) => item.path), ['/overview', '/imports'])
  assert.equal(nextActivePath(afterFirst, 1), '/imports')

  const afterLast = closeTab(tabs, '/imports')
  assert.equal(nextActivePath(afterLast, 2), '/settlements')
})

test('关闭其他只保留不可关闭页签与当前页', () => {
  const tabs = [tab('/overview'), tab('/settlements'), tab('/series-comparison')]

  assert.deepEqual(
    closeOtherTabs(tabs, '/series-comparison').map((item) => item.path),
    ['/series-comparison'],
  )
})

test('恢复页签时过滤脏数据、去重并保留业务页签顺序', () => {
  const restored = restoreTabs(
    [
      { path: '/series-comparison', fullPath: '/series-comparison' },
      { path: '/overview', fullPath: '/overview' },
      { path: '/series-comparison', fullPath: '/series-comparison?again=1' },
      { path: '/unknown', fullPath: '/unknown' },
      { path: '/imports', fullPath: 'imports' },
      null,
      'oops',
    ],
    isKnownPath,
  )

  assert.deepEqual(restored.map((item) => item.path), ['/series-comparison', '/overview'])
})

test('没有业务页签时恢复为欢迎访问页', () => {
  assert.deepEqual(restoreTabs(null, isKnownPath), [{ path: '/welcome', fullPath: '/welcome' }])
  assert.deepEqual(
    restoreTabs([{ path: '/settlements', fullPath: '/settlements' }], isKnownPath).map((item) => item.path),
    ['/settlements'],
  )
})

test('关闭最后一个业务页签后回到欢迎访问页', () => {
  assert.equal(nextActivePath([], 0), '/welcome')
})

test('从欢迎页打开业务菜单时移除欢迎占位且不产生重复页签', () => {
  const welcome = [{ path: '/welcome', fullPath: '/welcome' }]
  const opened = openTab(welcome, '/settlements', '/settlements')
  assert.deepEqual(opened, [{ path: '/settlements', fullPath: '/settlements' }])
  assert.deepEqual(
    openTab(opened, '/settlements', '/settlements'),
    opened,
  )
})
