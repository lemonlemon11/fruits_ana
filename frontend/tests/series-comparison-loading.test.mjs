import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'views', 'SeriesComparisonView.vue'),
  'utf8',
)

test('系列对比抽屉的候选加载态独立于对比请求版本号', () => {
  assert.match(source, /let optionsRequestVersion = 0/)
  assert.match(source, /const version = \+\+optionsRequestVersion/)
  assert.match(source, /if \(version === optionsRequestVersion\) loadingOptions\.value = false/)
  assert.doesNotMatch(source, /if \(version === requestVersion\) loadingOptions\.value = false/)
})

test('候选加载态在发起对比请求前结束，避免抽屉一直显示加载中', () => {
  const loadOptions = source.match(/async function loadOptions\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(loadOptions, '应能找到 loadOptions 函数')
  const loadingFalseAt = loadOptions.indexOf('loadingOptions.value = false')
  const comparisonAt = loadOptions.indexOf('await loadComparison(controller.signal)')
  assert.ok(loadingFalseAt >= 0)
  assert.ok(comparisonAt > loadingFalseAt)
})

test('应用选择后显示对比更新状态并锁定选择器', () => {
  assert.match(source, /:loading="loadingOptions \|\| loadingComparison"/)
  assert.match(source, /v-if="loadingComparison" class="comparison-updating" role="status"/)
  assert.match(source, /正在更新对比结果/)
})
