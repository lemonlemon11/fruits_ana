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

test('导入期间显示等待遮罩并标记忙碌状态', () => {
  assert.match(source, /:aria-busy="uploading"/)
  assert.match(source, /class="uploading-mask"/)
  assert.match(source, /class="uploading-spinner"/)
  assert.match(source, /正在导入，请稍候/)
  assert.match(source, /请不要关闭页面/)
})
