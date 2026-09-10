import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'views', 'ImportView.vue'),
  'utf8',
)

test('开始导入按钮不把点击事件当作覆盖参数', () => {
  assert.doesNotMatch(source, /@click="submit"(?!\()/)
  assert.match(source, /@click="submit\(\)"/)
})

test('submit 只把显式 true 当作覆盖请求', () => {
  assert.match(source, /async function submit\(overwrite = false\)/)
  assert.match(source, /const forceOverwrite = overwrite === true/)
})
