import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAnalyticsQuery, normalizeSettlementList } from '../src/api/normalize.ts'

const viewSource = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'views',
    'SettlementListView.vue',
  ),
  'utf8',
)

test('列表页分页：每页条数、上一页 / 下一页与页码文案', () => {
  assert.match(viewSource, /const page = ref\(1\)/)
  assert.match(viewSource, /const pageSize = ref\(10\)/)
  assert.match(viewSource, /const PAGE_SIZE_OPTIONS = \[10, 20, 50\]/)
  assert.match(viewSource, /class="list-pagination"/)
  assert.match(viewSource, /@click="goPage\(page - 1\)">上一页</)
  assert.match(viewSource, /@click="goPage\(page \+ 1\)">下一页</)
  assert.match(viewSource, /:disabled="page <= 1"/)
  assert.match(viewSource, /:disabled="page >= totalPages"/)
  // 页码文案只在分页条出现一次；面板标题不再重复「共 N 张 · 第 x / y 页」。
  assert.match(viewSource, /<span class="pagination-summary">共 <b>\{\{ totalCount \}\}<\/b> 张 · 第 <b>\{\{ page \}\}<\/b> \/ \{\{ totalPages \}\} 页<\/span>/)
  assert.doesNotMatch(viewSource, /共 \$\{totalCount\} 张结算单/)
  assert.match(viewSource, /function onPageSizeChange\(event: Event\)/)
  // 筛选项变化要把页码收回第 1 页，否则会停在越界页。
  assert.match(viewSource, /@submit\.prevent="refresh\(\{ resetPage: true \}\)"/)
  assert.match(viewSource, /@change="refresh\(\{ resetPage: true \}\)"/)
})

test('列表改用通用 DataTable，并保留移动端卡片分页', () => {
  assert.match(viewSource, /import DataTable, \{ type DataTableColumn \} from '\.\.\/components\/DataTable\.vue'/)
  assert.match(viewSource, /<DataTable\n\s+class="settlement-table"/)
  assert.match(viewSource, /min-width="900px"/)
  // 列定义集中在 columns 里，等级列随筛选范围动态展开。
  assert.match(viewSource, /const columns = computed<DataTableColumn<SettlementListItem>\[\]>\(\(\) => \[/)
  assert.match(viewSource, /label: `\$\{gradeLabel\(grade\)\}件数`/)
  // 移动端降级为卡片：只隐藏表格数据区，表内底栏（分页）留在卡片下方。
  assert.match(viewSource, /\.settlement-list-results \{ display: flex; flex-direction: column;/)
  assert.match(viewSource, /\.settlement-list-results \.settlement-table :deep\(\.data-table-scroll\) \{ display: none; \}/)
  assert.match(viewSource, /\.settlement-list-results \.settlement-table :deep\(\.data-table-foot\) \{ padding: 0;/)
  assert.match(viewSource, /\.mobile-settlement-cards \{ order: 1;/)
  assert.match(viewSource, /\.list-pagination \{ display: flex;/)
  assert.match(viewSource, /\.mobile-settlement-cards \{ display: none; \}/)
})

test('分页条内嵌在表格底栏，与表格是一个整体', () => {
  // 分页走 DataTable 的 footer 插槽，落在表格外框内侧。
  assert.match(viewSource, /<template #footer>[\s\S]*?<footer v-if="totalCount" class="list-pagination" aria-label="结算单分页">/)
  assert.match(viewSource, /<\/footer>\n\s*<\/template>\n\s*<\/DataTable>/)
  // 结果区只剩表格一块，不再单独排一行分页。
  assert.match(viewSource, /\.settlement-list-results \{ display: grid; grid-template-rows: minmax\(0, 1fr\); min-height: 0; \}/)
})

test('列表在桌面端至少撑满剩余视口，行多时随页面自然向下扩展', () => {
  // 整页高度下限 = 视口高 -（导航 + 页签 + 留白），行数少时列表也撑满可视区。
  assert.match(viewSource, /min-height: max\(32rem, calc\(100dvh - var\(--settle-reserved\)\)\)/)
  // 行数超出可视高度时列表随内容扩展，顶部筛选区保持原样。
  assert.match(viewSource, /\.settlement-list-page > \* \{ flex: 0 0 auto; \}/)
  assert.match(viewSource, /\.settlement-list-page \.panel \{ display: grid; flex: 1 1 auto;/)
  // 翻页按钮仍靠左，右下角整块留空给“顺仔”悬浮入口，避免点不到。
  assert.match(viewSource, /\.pagination-actions \{ margin-left: 0; \}/)
})

test('分页请求参数与响应解析', () => {
  assert.equal(buildAnalyticsQuery({ page: 3, pageSize: 20 }), '?page=3&page_size=20')
  assert.equal(buildAnalyticsQuery({ merchantNo: '637' }), '?merchant_no=637')

  const data = normalizeSettlementList({
    date_range: { start_date: '2026-09-01', end_date: '2026-09-15', is_default: false },
    settlements: [],
    pagination: { total: 13, page: 2, page_size: 10, pages: 2 },
  })
  assert.deepEqual(data.pagination, { total: 13, page: 2, pageSize: 10, pages: 2 })
  assert.equal(normalizeSettlementList({ settlements: [] }).pagination, null)
})

test('按行导出：地址指向单张结算单模板，手工单与导入件同一入口', async () => {
  const { settlementTemplateExportUrl } = await import('../src/api/client.ts')

  assert.equal(
    settlementTemplateExportUrl('单624'),
    '/api/exports/settlements/%E5%8D%95624/template.xlsx',
  )
  assert.equal(settlementTemplateExportUrl('637'), '/api/exports/settlements/637/template.xlsx')
})

test('列表每行都有导出入口，桌面表格与移动端卡片一致', () => {
  assert.match(viewSource, /settlementTemplateExportUrl/)
  assert.match(viewSource, /settlementTemplatePdfUrl/)
  // 桌面表格：导出按钮 → 下拉菜单（Excel / PDF），查看明细主操作实心绿。
  assert.match(
    viewSource,
    /<template #cell-actions="{ row }">[\s\S]*?<span class="export-dropdown">[\s\S]*?<button class="row-action-button" type="button" @click\.prevent\.stop="toggleExportMenu\(row\.merchantNo\)">[\s\S]*?<Download :size="13" aria-hidden="true" \/>[\s\S]*?导出[\s\S]*?<span class="export-sub" :class="{ visible: openExportMenu === row\.merchantNo }">[\s\S]*?>[\s\S]*?Excel[\s\S]*?>[\s\S]*?PDF[\s\S]*?<button class="row-action-button is-primary" type="button" @click="openRecords\(row\)">[\s\S]*?<ListTree :size="13" aria-hidden="true" \/>[\s\S]*?查看明细[\s\S]*?<\/template>/,
  )
  assert.match(viewSource, /import Download from '@lucide\/vue\/dist\/esm\/icons\/download\.mjs'/)
  assert.match(viewSource, /import ListTree from '@lucide\/vue\/dist\/esm\/icons\/list-tree\.mjs'/)
  assert.match(viewSource, /\.row-action-button\.is-primary \{ border-color: var\(--primary-dark\); background: var\(--primary\); color: white; \}/)
  // 移动端卡片：查看明细 + Excel / PDF + 删除放在同一动作栏，不折行。
  assert.match(viewSource, /<div class="mobile-card-actions-bar">/)
  assert.match(viewSource, /<button class="primary-button mobile-detail-button" type="button" @click="openRecords\(item\)">查看明细<\/button>/)
  assert.match(viewSource, /<a class="text-button export-row-link" :href="rowExportUrl\(item, 'xlsx'\)" download>/)
  assert.match(viewSource, /<FileSpreadsheet :size="14" aria-hidden="true" \/> Excel/)
  assert.match(viewSource, /<a class="text-button export-row-link" :href="rowExportUrl\(item, 'pdf'\)" download>/)
  assert.match(viewSource, /<FileText :size="14" aria-hidden="true" \/> PDF/)
  assert.match(viewSource, /class="text-button delete-row-link"/)
  assert.match(viewSource, /\.mobile-card-actions-bar \{\s+display: flex;/)
  assert.match(viewSource, /\.mobile-detail-button \{\s+flex: 1 1 auto;/)
  // 操作列固定宽度，避免两按钮被挤到折行。
  assert.match(viewSource, /\{ key: 'actions', label: '操作', align: 'right', width: '13\.5rem' \}/)
})

test('结算单列表空状态与其他页面一致使用 prominent，且不显示 null 范围提示', () => {
  assert.match(viewSource, /<div v-else-if="!settlements\.length" class="empty-state prominent">/)
  assert.match(viewSource, /<p v-if="dateRange" class="range-note">\{\{ rangeHint \}\}<\/p>/)
  assert.match(viewSource, /\.settlement-list-page \.panel > \.skeleton-block \{ min-height: 0; \}/)
  assert.doesNotMatch(viewSource, /\.settlement-list-page \.panel > \.empty-state \{ min-height: 0; \}/)
})

test('删除结算单使用页面内确认框，不弹浏览器原生确认框', () => {
  assert.doesNotMatch(viewSource, /window\.confirm/)
  assert.match(viewSource, /const deleteTarget = ref<SettlementListItem \| null>\(null\)/)
  assert.match(viewSource, /v-if="deleteTarget" class="delete-confirm-overlay"/)
  assert.match(viewSource, /role="alertdialog"/)
  assert.match(viewSource, /确认删除/)
})
