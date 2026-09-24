import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

type ShellHeaderModule = {
  SIDEBAR_STORAGE_KEY: string
  FONT_SIZE_STORAGE_KEY: string
  restoreSidebarCollapsed: (value: string | null) => boolean
  restoreFontSize: (value: string | null) => FontSizePreference
  fontScaleFor: (value: FontSizePreference) => number
  formatHeaderClock: (value: Date) => {
    date: string
    time: string
    datetime: string
  }
}
type FontSizePreference = 'small' | 'standard' | 'large' | 'xlarge'

const shellHeader = await import('../src/utils/shellHeader.ts')
  .catch(() => null) as ShellHeaderModule | null
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const shell = fs.readFileSync(path.join(src, 'AppShell.vue'), 'utf8')
const styles = fs.readFileSync(path.join(src, 'styles-shell.css'), 'utf8')
const globalStyles = fs.readFileSync(path.join(src, 'styles.css'), 'utf8')

test('侧栏收起状态只接受明确的 true 并使用稳定存储键', () => {
  assert.ok(shellHeader)
  assert.equal(shellHeader.SIDEBAR_STORAGE_KEY, 'fruits-ana:sidebar-collapsed')
  assert.equal(shellHeader.restoreSidebarCollapsed('true'), true)
  assert.equal(shellHeader.restoreSidebarCollapsed('false'), false)
  assert.equal(shellHeader.restoreSidebarCollapsed('broken'), false)
  assert.equal(shellHeader.restoreSidebarCollapsed(null), false)
})

test('字号偏好使用稳定存储键并只接受已知档位', () => {
  assert.ok(shellHeader)
  assert.equal(shellHeader.FONT_SIZE_STORAGE_KEY, 'fruits-ana:font-size')
  assert.equal(shellHeader.restoreFontSize('small'), 'small')
  assert.equal(shellHeader.restoreFontSize('standard'), 'standard')
  assert.equal(shellHeader.restoreFontSize('xlarge'), 'xlarge')
  assert.equal(shellHeader.restoreFontSize('broken'), 'small')
  assert.equal(shellHeader.restoreFontSize(null), 'small')
  assert.equal(shellHeader.fontScaleFor('small'), 0.9)
  assert.equal(shellHeader.fontScaleFor('standard'), 1)
  assert.equal(shellHeader.fontScaleFor('large'), 1.125)
  assert.equal(shellHeader.fontScaleFor('xlarge'), 1.25)
})

test('顶部时间格式包含本地日期、星期和时分秒', () => {
  assert.ok(shellHeader)
  assert.deepEqual(shellHeader.formatHeaderClock(new Date(2026, 8, 11, 16, 5, 9)), {
    date: '2026-09-11 星期五',
    time: '16:05:09',
    datetime: '2026-09-11T16:05:09',
  })
})

test('header 品牌图标返回角色默认入口并提供可访问的侧栏按钮和时间', () => {
  assert.match(shell, /<RouterLink class="app-header-home" :to="defaultHomePath"/)
  assert.match(shell, /class="sidebar-toggle"/)
  assert.match(shell, /:aria-expanded="!sidebarCollapsed"/)
  assert.match(shell, /aria-controls="primary-nav"/)
  assert.match(shell, /<time\s+class="app-header-clock"/)
  assert.match(shell, /:datetime="headerClock\.datetime"/)
})

test('header 提供字号选择并让全局根字号按偏好缩放', () => {
  assert.match(shell, /class="app-header-font-size"/)
  assert.match(shell, /class="font-size-trigger"/)
  assert.match(shell, /aria-controls="font-size-popover"/)
  assert.match(shell, /:aria-expanded="fontSizePanelOpen"/)
  assert.match(shell, /@click="toggleFontSizePanel"/)
  assert.match(shell, /id="font-size-popover"/)
  assert.match(shell, /v-if="fontSizePanelOpen"/)
  assert.match(shell, /id="font-size-slider"/)
  assert.match(shell, /type="range"/)
  assert.match(shell, /v-model="fontSizeIndex"/)
  assert.match(shell, /:aria-valuetext="fontSizeOption\.label"/)
  assert.match(shell, /FONT_SIZE_OPTIONS/)
  assert.match(shell, /当前字号：\{\{ fontSizeOption\.label \}\}/)
  assert.match(globalStyles, /--font-scale:\s*1/)
  assert.match(globalStyles, /calc\(17px \* var\(--font-scale\)\)/)
  assert.match(globalStyles, /calc\(clamp\(15px, 0\.25rem \+ 0\.85vw, 17px\) \* var\(--font-scale\)\)/)
})

test('桌面收起为自适应图标栏且移动端不显示收起按钮', () => {
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.app-shell\.sidebar-collapsed \.app-body\s*\{[^}]*4\.24rem/)
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.sidebar-toggle\s*\{\s*display:\s*none/)
})

test('header 文案与用户名单行截断，避免换行变高后盖住左侧菜单', () => {
  assert.match(styles, /\.app-header\s*\{[^}]*min-width:\s*0/)
  assert.match(styles, /\.app-header-account\s*\{\s*flex:\s*0 1 auto/)
  assert.match(styles, /\.app-header-copy strong\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(styles, /\.app-header-copy strong\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.match(styles, /\.account-name\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(styles, /\.account-name\s*\{[^}]*text-overflow:\s*ellipsis/)
})

test('页面提供右下角一键回顶按钮，移动端抬高到底部导航之上', () => {
  assert.match(shell, /class="back-to-top"/)
  assert.match(shell, /aria-label="回到页面顶部"/)
  assert.match(shell, /window\.addEventListener\('scroll', handleScroll/)
  assert.match(styles, /\.back-to-top\s*\{[^}]*position:\s*fixed/)
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.back-to-top\s*\{[\s\S]*calc\(var\(--mobile-tabbar-height\)/)
})
