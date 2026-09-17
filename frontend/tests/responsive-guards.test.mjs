import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const views = [
  'OverviewView.vue',
  'SettlementListView.vue',
  'SettlementComparisonView.vue',
  'SettlementView.vue',
  'SeriesComparisonView.vue',
  'ImportView.vue',
]

const guarded = new Set(
  fs
    .readFileSync(path.join(src, 'styles-responsive.css'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('min-width: 0; max-width: 100%;'))
    .flatMap((line) => line.slice(0, line.indexOf('{')).split(','))
    .map((selector) => selector.trim())
    .filter(Boolean),
)

function rootClass(file) {
  const source = fs.readFileSync(path.join(src, 'views', file), 'utf8')
  const matched = source.match(/<template>\s*<div class="([^"]+)"/)
  assert.ok(matched, `${file} 未找到根容器 class`)
  return matched[1].split(/\s+/)[0]
}

test('每个业务页面的根容器都在移动端最小宽度守卫内', () => {
  for (const file of views) {
    const selector = `.${rootClass(file)}`
    assert.ok(
      guarded.has(selector),
      `${file} 的根容器 ${selector} 缺少移动端 min-width 守卫`,
    )
    assert.ok(
      guarded.has(`${selector} > *`),
      `${file} 的子元素缺少 ${selector} > * 的 min-width 守卫`,
    )
  }
})

test('系列对比的等级表在移动端不固定 400px 列宽', () => {
  const source = fs.readFileSync(path.join(src, 'components', 'SeriesGradeTables.vue'), 'utf8')
  const mobile = source.match(/@media \(max-width: 560px\) \{[^}]*\}/)?.[0] ?? ''

  assert.match(mobile, /grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})

test('系列对比的等级表在窄屏折成卡片，宽屏靠内部横向滚动兜底', () => {
  const source = fs.readFileSync(path.join(src, 'components', 'SeriesGradeTables.vue'), 'utf8')

  // 5 列 + 长表头在卡片里放不下时不再被裁掉最后一列：窄屏走卡片模式，宽屏由组件内部滚动。
  assert.match(source, /cards-on-narrow/)
  assert.match(source, /min-width="320px"/)
  assert.match(source, /foot-label="合计"/)
})
