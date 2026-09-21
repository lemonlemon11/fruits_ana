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

test('submit 走预览草稿，不再把点击事件当覆盖参数', () => {
  assert.match(source, /async function submit\(\)/)
  assert.match(source, /const result = await previewImports\(files\)/)
  assert.doesNotMatch(source, /forceOverwrite/)
})

test('数据导入支持一次选择多个文件', () => {
  assert.match(source, /selectedFiles\.value = supported/)
  assert.match(source, /type="file" multiple/)
})

test('导入期间显示等待遮罩并标记忙碌状态', () => {
  assert.match(source, /:aria-busy="uploading"/)
  assert.match(source, /class="uploading-mask"/)
  assert.match(source, /class="uploading-spinner"/)
  assert.match(source, /正在导入，请稍候/)
  assert.match(source, /请不要关闭页面/)
})

test('导入记录按页展示，批次列表只渲染当前页', () => {
  assert.match(source, /const batchPage = ref\(1\)/)
  assert.match(source, /const batchPageSize = 5/)
  assert.match(source, /const totalBatchPages = computed/)
  assert.match(source, /v-for="batch in pagedBatches"/)
  assert.match(source, /class="batch-pagination"/)
  assert.match(source, /function goBatchPage\(page: number\)/)
  assert.match(source, /watch\(\(\) => batches\.value\.length, \(\) => \{ batchPage\.value = 1 \}\)/)
})
