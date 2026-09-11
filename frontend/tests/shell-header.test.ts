import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

type ShellHeaderModule = {
  SIDEBAR_STORAGE_KEY: string
  restoreSidebarCollapsed: (value: string | null) => boolean
  formatHeaderClock: (value: Date) => {
    date: string
    time: string
    datetime: string
  }
}

const shellHeader = await import('../src/utils/shellHeader.ts')
  .catch(() => null) as ShellHeaderModule | null
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const shell = fs.readFileSync(path.join(src, 'AppShell.vue'), 'utf8')
const styles = fs.readFileSync(path.join(src, 'styles-shell.css'), 'utf8')

test('侧栏收起状态只接受明确的 true 并使用稳定存储键', () => {
  assert.ok(shellHeader)
  assert.equal(shellHeader.SIDEBAR_STORAGE_KEY, 'fruits-ana:sidebar-collapsed')
  assert.equal(shellHeader.restoreSidebarCollapsed('true'), true)
  assert.equal(shellHeader.restoreSidebarCollapsed('false'), false)
  assert.equal(shellHeader.restoreSidebarCollapsed('broken'), false)
  assert.equal(shellHeader.restoreSidebarCollapsed(null), false)
})

test('顶部时间格式包含本地日期、星期和时分秒', () => {
  assert.ok(shellHeader)
  assert.deepEqual(shellHeader.formatHeaderClock(new Date(2026, 8, 11, 16, 5, 9)), {
    date: '2026-09-11 星期五',
    time: '16:05:09',
    datetime: '2026-09-11T16:05:09',
  })
})

test('header 品牌图标返回销售总览并提供可访问的侧栏按钮和时间', () => {
  assert.match(shell, /<RouterLink class="app-header-home" to="\/overview"/)
  assert.match(shell, /class="sidebar-toggle"/)
  assert.match(shell, /:aria-expanded="!sidebarCollapsed"/)
  assert.match(shell, /aria-controls="primary-nav"/)
  assert.match(shell, /<time\s+class="app-header-clock"/)
  assert.match(shell, /:datetime="headerClock\.datetime"/)
})

test('桌面收起为自适应图标栏且移动端不显示收起按钮', () => {
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.app-shell\.sidebar-collapsed \.app-body\s*\{[^}]*4\.24rem/)
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.sidebar-toggle\s*\{\s*display:\s*none/)
})

test('页面提供右下角一键回顶按钮，移动端抬高到底部导航之上', () => {
  assert.match(shell, /class="back-to-top"/)
  assert.match(shell, /aria-label="回到页面顶部"/)
  assert.match(shell, /window\.addEventListener\('scroll', handleScroll/)
  assert.match(styles, /\.back-to-top\s*\{[^}]*position:\s*fixed/)
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.back-to-top\s*\{[\s\S]*calc\(var\(--mobile-tabbar-height\)/)
})
