import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8')

const mobile = read('styles-mobile.css')
const dataTable = read('components/DataTable.vue')
const entry = read('views/EntryView.vue')
const importReview = read('views/ImportReviewView.vue')

test('手工录单与导入二次确认共用同一套手机端长表单样式', () => {
  // 两个页面根节点都挂了 .mobile-form-page，styles-mobile.css 的共用规则才生效。
  assert.match(entry, /class="entry-page review-entry-page mobile-form-page"/)
  assert.match(importReview, /class="review-dialog mobile-form-page"/)
  assert.match(mobile, /\.mobile-form-page \.basic-grid \{/)
  assert.match(mobile, /\.mobile-form-page \.jump-nav \{/)
  assert.match(mobile, /\.mobile-form-page \.review-table tbody tr \{/)
})

test('筛选栏聚焦时放开 overflow，避免商号下拉被横向滚动容器裁掉', () => {
  assert.match(mobile, /\.filter-bar:focus-within \{\s*overflow: visible !important;/)
})

test('明细表手机端按列 key 定位，不依赖会随页面变化的列序号', () => {
  // DataTable 在单元格上输出 data-col，CSS 才能按列名排版。
  assert.match(dataTable, /:data-col="column\.key"/)
  // 二次确认页的表多一列「文件行」，必须显式分情况，否则会和金额列重叠。
  assert.match(mobile, /\.mobile-form-page \.fee-table tbody tr:has\(\[data-col='sourceRow'\]\)/)
  assert.match(mobile, /\.mobile-form-page \.sale-table tbody tr:has\(\[data-col='sourceRow'\]\)/)
  // nth-child 定位会随列数变化错位，禁止回退。
  assert.doesNotMatch(mobile, /\.mobile-form-page \.(sale|fee|after-sale)-table tbody td:nth-child/)
})

test('定高网格里的横向滚动锚点栏按内容撑开，不会被压扁', () => {
  assert.match(mobile, /\.review-body \{ grid-auto-rows: max-content !important;/)
  assert.match(mobile, /\.mobile-form-page \{ grid-auto-rows: max-content !important; \}/)
})

test('只读查看不重复提示，并整屏展示', () => {
  assert.match(importReview, /'status-panel--readonly': isReadonly/)
  assert.match(mobile, /\.status-panel--readonly \{ display: none !important; \}/)
  assert.match(mobile, /\.review-modal \{ padding: 0 !important; place-items: stretch !important; \}/)
})

test('导入页手机端不承诺拖拽，改成整块可点选文件', () => {
  const importView = read('views/ImportView.vue')
  // 手机没有拖拽能力，文案必须跟着能力走，不能继续写「拖入文件」。
  assert.match(importView, /matchMedia\('\(max-width: 820px\)'\)/)
  assert.match(importView, /isNarrow \? '选择文件上传后会自动解析/)
  assert.match(importView, /narrowQuery\?\.addEventListener\('change', onNarrowChange\)/)
  assert.match(importView, /narrowQuery\?\.removeEventListener\('change', onNarrowChange\)/)
  // 面板本身可点，避免 92px 高的区域只有按钮一小块能点。
  assert.match(importView, /@click="openFilePicker"/)
  assert.match(importView, /@click\.stop="openFilePicker">选择结算单/)
  assert.match(mobile, /\.import-page \.file-picker-panel \{/)
  assert.match(mobile, /\.import-page \.file-picker-panel \.primary-button \{/)
})

test('多文件上传队列显示数量与总大小，不再只显示第一个文件名', () => {
  const importView = read('views/ImportView.vue')
  assert.match(importView, /const uploadQueueSummary = computed/)
  assert.match(importView, /已选 \$\{files\.length\} 个文件/)
  assert.match(importView, /class="upload-queue-summary"/)
})

test('手机端选完文件不自动导入，停在「开始导入」等确认', () => {
  const importView = read('views/ImportView.vue')
  const onInput = importView.slice(importView.indexOf('function onInput'), importView.indexOf('function openFilePicker'))
  // 桌面端保持「选文件即导入」。
  assert.match(onInput, /if \(isNarrow\.value\) return/)
  assert.match(onInput, /if \(selectedFiles\.value\.length\) void submit\(\)/)
  // 桌面分支必须在手机端提前返回之后，不能被一起拦掉。
  assert.ok(onInput.indexOf('if (isNarrow.value) return') < onInput.indexOf('if (selectedFiles.value.length) void submit()'))
})

test('上传失败提示取人话，不把后端 JSON 原样丢到页面上', () => {
  const importView = read('views/ImportView.vue')
  assert.match(importView, /function friendlyUploadError/)
  assert.match(importView, /friendlyUploadError\(caught\.message\)/)
  // 只约束上传这条路径，列表 / 问题确认等其它地方的原始 message 用法不动。
  const submitBody = importView.slice(importView.indexOf('async function submit()'), importView.indexOf('async function loadIssues'))
  assert.match(submitBody, /friendlyUploadError\(caught\.message\)/)
})
