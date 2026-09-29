import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('自动查询页面把 loading 传给搜索下拉', () => {
  for (const file of ['views/OverviewView.vue', 'views/SettlementView.vue', 'views/SettlementListView.vue']) {
    assert.match(read(file), /<SearchableSelect[\s\S]*?:loading="[^"]+"/, file)
  }
})

test('结算单详情模板导出提供局部等待和结果提示', () => {
  const source = read('views/SettlementView.vue')
  assert.match(source, /const manualExporting = ref\(false\)/)
  assert.match(source, /await downloadFile\(/)
  assert.match(source, /manualExporting \? '导出中…' : '导出模板'/)
  assert.match(source, /role="status"/)
})

test('问题明细下载提供批次级等待状态', () => {
  const source = read('views/ImportView.vue')
  assert.match(source, /const downloadingIssuesBatch = ref\(''\)/)
  assert.match(source, /async function downloadIssues\(/)
  assert.match(source, /if \(issuesByBatch\[key\] \|\| loadingIssues\.value === key\) return/)
  assert.match(source, /下载中…/)
  assert.match(source, /:disabled="downloadingIssuesBatch === String\(batch\.id\)"/)
})

test('结算单导出期间整个列表/页面盖上遮罩，防止重复点击', () => {
  const list = read('views/SettlementListView.vue')
  assert.match(list, /const exportingAnything = computed\(\(\) => exportingKeys\.value\.size > 0\)/)
  assert.match(list, /:aria-busy="exportingAnything"/)
  assert.match(list, /v-if="exportingAnything" class="list-export-mask"/)
  assert.match(list, /正在导出\{\{ exportingCount > 1 \? ` \$\{exportingCount\} 个文件` : '' \}\}，请稍候/)
  assert.match(list, /\.settlement-list-page \.panel \{ position: relative; \}/)
  assert.match(list, /\.list-export-mask \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/)

  const detail = read('views/SettlementView.vue')
  assert.match(detail, /v-if="manualExporting" class="export-mask"/)
  assert.match(detail, /正在导出结算单，请稍候/)
  assert.match(detail, /\.export-mask \{[\s\S]*?position: absolute;[\s\S]*?inset: -6px;/)
})

test('排序期间锁定筛选操作并保留排序状态提示', () => {
  const source = read('views/SettlementListView.vue')
  // 统计周期组件已删除；销售日期快捷筛选与查询按钮在排序期间锁定。
  assert.doesNotMatch(source, /period-filter|onPeriodChange|PeriodPreset/)
  assert.match(source, /:disabled="loading \|\| sorting">\{\{ loading \? '正在查询' : sorting \? '正在排序' : '查看结果' \}\}/)
})

test('品牌对比更新期间锁定已选结算单的移除按钮', () => {
  const source = read('components/SettlementPicker.vue')
  assert.match(source, /class="picker-chip-remove"[\s\S]*?:disabled="loading"/)
  assert.match(source, /function removeSelected\(merchantNo: string\) \{\s+if \(props\.loading\) return/)
})
