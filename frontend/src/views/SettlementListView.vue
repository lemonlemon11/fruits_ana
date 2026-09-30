<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElPagination } from 'element-plus'
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/pagination/style/css'
import Download from '@lucide/vue/dist/esm/icons/download.mjs'
import FileSpreadsheet from '@lucide/vue/dist/esm/icons/file-spreadsheet.mjs'
import FileText from '@lucide/vue/dist/esm/icons/file-text.mjs'
import ListTree from '@lucide/vue/dist/esm/icons/list-tree.mjs'

import {
  deleteSettlement,
  getSettlements,
  gradeLabel,
  settlementListExportUrl,
  settlementTemplateExportUrl,
  settlementTemplatePdfUrl,
  type SettlementListItem,
  type SettlementPagination,
  type SettlementSortBy,
  type SettlementSortOrder,
} from '../api/client'
import { GRADES, type Grade } from '../utils/grades'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import { formatCurrency, formatDateTime, formatNumber, formatPrice } from '../utils/format'
import { settlementOptionLabel } from '../utils/settlementComparison'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import { downloadFile } from '../utils/fileDownload'
import {
  getCachedSettlements,
  invalidateSettlementCandidateCache,
} from '../utils/settlementCandidateCache'
import { useQuickPeriods } from '../utils/quickPeriods'

const filters = reactive({ startDate: '', endDate: '', merchantNo: '', brand: '' })
const settlements = ref<SettlementListItem[]>([])
const options = ref<SettlementListItem[]>([])
const loading = ref(true)
const sorting = ref(false)
const error = ref('')
const exportingKeys = ref<ReadonlySet<string>>(new Set())
const exportNotice = ref('')
const exportError = ref('')
const deletingMerchantNo = ref('')
const deleteTarget = ref<SettlementListItem | null>(null)
const deleteError = ref('')
const pagination = ref<SettlementPagination | null>(null)
const page = ref(1)
const pageSize = ref(10)
const sortBy = ref<SettlementSortBy | ''>('')
const sortOrder = ref<SettlementSortOrder>('desc')
/** 等级列在筛选范围内累积，翻页时列不跳变，与导出列口径一致。 */
const scopeGrades = ref<Grade[]>([])
const PAGE_SIZE_OPTIONS = [10, 20, 50]
let requestVersion = 0
let activeController: AbortController | null = null
const router = useRouter()

const totalCount = computed(() => pagination.value?.total ?? settlements.value.length)
const totalPages = computed(() => pagination.value?.pages ?? 1)
const deleteBusy = computed(() => Boolean(deletingMerchantNo.value))
/** 导出进行中（列表导出或任意行的 Excel/PDF）：整个列表盖遮罩，防重复点击与误触其他操作。 */
const exportingCount = computed(() => exportingKeys.value.size)
const exportingAnything = computed(() => exportingKeys.value.size > 0)

const visibleGrades = computed(() => scopeGrades.value)

/** 列表列定义：等级列随筛选范围动态展开，保证翻页时列不跳变；全列居中展示。 */
const columns = computed<DataTableColumn<SettlementListItem>[]>(() => [
  { key: 'merchantNo', label: '商号', align: 'center', emphasis: true },
  { key: 'brand', label: '品牌', align: 'center', value: (item) => item.brand || '未识别品牌' },
  { key: 'orderNo', label: '单号', align: 'center', emphasis: true, noShrink: true, value: (item) => item.orderNoNormalized || item.orderNo || '—' },
  { key: 'arrivalDate', label: '到达市场日期', align: 'center', sortable: true, sortKey: 'arrival_date', value: (item) => item.arrivalDate || '—' },
  { key: 'totalQuantity', label: '总件数', align: 'center', numeric: true, sortable: true, sortKey: 'total_quantity', value: (item) => formatNumber(item.totalQuantity) },
  ...visibleGrades.value.map((grade) => ({
    key: `grade-${grade}`,
    label: `${gradeLabel(grade)}件数`,
    align: 'center' as const,
    numeric: true,
    sortable: grade === 'A' || grade === 'B',
    sortKey: `grade_${grade.toLowerCase()}`,
    value: (item: SettlementListItem) => formatNumber(item.gradeQuantities[grade]),
  })),
  { key: 'salesAmount', label: '销售金额', align: 'center', numeric: true, sortable: true, sortKey: 'sales_amount', value: (item) => formatCurrency(item.salesAmount) },
  { key: 'averagePrice', label: '每件均价', align: 'center', numeric: true, sortable: true, sortKey: 'average_price', value: (item) => formatPrice(item.averagePrice) },
  { key: 'confirmedAt', label: '录单时间', align: 'center', sortable: true, sortKey: 'confirmed_at', value: (item) => formatDateTime(item.confirmedAt) },
  { key: 'actions', label: '操作', align: 'center', width: '184px', fixed: 'right' },
])

function mergeScopeGrades(items: SettlementListItem[]) {
  const merged = new Set(scopeGrades.value)
  items.forEach((item) =>
    GRADES.forEach((grade) => {
      if ((item.gradeQuantities[grade] ?? 0) > 0) merged.add(grade)
    }),
  )
  scopeGrades.value = GRADES.filter((grade) => merged.has(grade))
}

const merchantSelectOptions = computed(() =>
  [
    { value: '', label: '全部结算单' },
    ...options.value.map((item) => ({
      value: item.merchantNo,
      label: settlementOptionLabel(item),
    })),
  ],
)

const brandSelectOptions = computed(() => {
  const brands = new Set(options.value.map((item) => item.brand || '未识别品牌').filter(Boolean))
  return [
    { value: '', label: '全部品牌' },
    ...[...brands].sort((left, right) => left.localeCompare(right, 'zh-CN')).map((brand) => ({
      value: brand,
      label: brand,
    })),
  ]
})

const listExportUrl = computed(() => settlementListExportUrl({ ...filters }))

function salesPeriod(item: SettlementListItem): string {
  if (!item.saleDateStart) return '—'
  return item.saleDateStart === item.saleDateEnd
    ? item.saleDateStart
    : `${item.saleDateStart} 至 ${item.saleDateEnd}`
}

const { quickYears, quickMonths, loadQuickPeriods } = useQuickPeriods()

onMounted(() => {
  void loadQuickPeriods()
})

function rowExportUrl(item: SettlementListItem, fmt: 'xlsx' | 'pdf' = 'xlsx'): string {
  return fmt === 'pdf'
    ? settlementTemplatePdfUrl(item.merchantNo)
    : settlementTemplateExportUrl(item.merchantNo)
}

function rowExportKey(item: SettlementListItem, fmt: 'xlsx' | 'pdf'): string {
  return `${item.merchantNo}:${fmt}`
}

function isExporting(key: string): boolean {
  return exportingKeys.value.has(key)
}

function setExporting(key: string, active: boolean) {
  const next = new Set(exportingKeys.value)
  if (active) next.add(key)
  else next.delete(key)
  exportingKeys.value = next
}

async function runExport(key: string, url: string, fallbackFilename: string) {
  if (isExporting(key)) return
  setExporting(key, true)
  exportNotice.value = ''
  exportError.value = ''
  try {
    const filename = await downloadFile(url, fallbackFilename)
    exportNotice.value = `${filename} 已开始下载`
  } catch (caught) {
    exportError.value = caught instanceof Error ? caught.message : '导出失败，请稍后重试'
  } finally {
    setExporting(key, false)
  }
}

function runListExport() {
  void runExport('list', listExportUrl.value, '结算单列表.xlsx')
}

function runRowExport(item: SettlementListItem, fmt: 'xlsx' | 'pdf') {
  const extension = fmt === 'pdf' ? 'pdf' : 'xlsx'
  void runExport(
    rowExportKey(item, fmt),
    rowExportUrl(item, fmt),
    `${displayMerchantNo(item)}-结算单.${extension}`,
  )
}

function openRecords(item: SettlementListItem) {
  void router.push({ path: '/import-review', query: { merchant_no: item.merchantNo, readonly: '1' } })
}

function requestDelete(item: SettlementListItem) {
  if (deletingMerchantNo.value) return
  deleteError.value = ''
  deleteTarget.value = item
}

function cancelDelete() {
  if (deletingMerchantNo.value) return
  deleteTarget.value = null
}

async function confirmDelete() {
  const item = deleteTarget.value
  if (!item || deletingMerchantNo.value) return
  deleteTarget.value = null
  deletingMerchantNo.value = item.merchantNo
  deleteError.value = ''
  try {
    await deleteSettlement(item.merchantNo)
    invalidateSettlementCandidateCache()
    options.value = options.value.filter((option) => option.merchantNo !== item.merchantNo)
    if (filters.merchantNo === item.merchantNo) filters.merchantNo = ''
    await refresh({ resetPage: true })
  } catch (caught) {
    deleteError.value = caught instanceof Error ? caught.message : '删除失败，请稍后重试'
  } finally {
    deletingMerchantNo.value = ''
  }
}

async function loadOptions() {
  const data = await getCachedSettlements({ ...filters })
  options.value = data.settlements
  return data
}

async function refresh(options: { resetPage?: boolean; preserveRows?: boolean } = {}) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '销售日期起不能晚于销售日期止'
    return
  }
  const targetPage = options.resetPage ? 1 : page.value
  if (options.resetPage && !options.preserveRows) {
    page.value = 1
    scopeGrades.value = []
  }
  const version = ++requestVersion
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  sorting.value = Boolean(options.preserveRows)
  if (!options.preserveRows) loading.value = true
  error.value = ''
  try {
    const data = await getSettlements({
      ...filters,
      page: targetPage,
      pageSize: pageSize.value,
      sortBy: sortBy.value || undefined,
      sortOrder: sortOrder.value,
    }, { signal: controller.signal })
    if (version !== requestVersion) return
    settlements.value = data.settlements
    pagination.value = data.pagination
    if (data.pagination) page.value = data.pagination.page
    mergeScopeGrades(data.settlements)
  } catch (caught) {
    if (controller.signal.aborted) return
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '数据明细加载失败'
  } finally {
    if (version === requestVersion && !options.preserveRows) loading.value = false
    if (version === requestVersion) sorting.value = false
  }
}

async function bootstrap() {
  const version = ++requestVersion
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  loading.value = true
  error.value = ''
  try {
    const data = await getCachedSettlements({ ...filters }, { signal: controller.signal })
    if (version !== requestVersion) return
    options.value = data.settlements
    settlements.value = data.settlements.slice(0, pageSize.value)
    const total = data.settlements.length
    pagination.value = {
      total,
      page: 1,
      pageSize: pageSize.value,
      pages: Math.max(1, Math.ceil(total / pageSize.value)),
    }
    page.value = 1
    mergeScopeGrades(data.settlements)
  } catch (caught) {
    if (controller.signal.aborted) return
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '数据明细加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function goPage(target: number) {
  const next = Math.min(Math.max(target, 1), totalPages.value)
  if (next === page.value) return
  page.value = next
  refresh()
}

function onPageChange(next: number) {
  goPage(next)
}

function onSizeChange(size: number) {
  if (!Number.isFinite(size) || size === pageSize.value) return
  pageSize.value = size
  refresh({ resetPage: true })
}

function toggleSort(key: string) {
  if (sorting.value) return
  const nextSort = key as SettlementSortBy
  if (sortBy.value === nextSort) {
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortBy.value = nextSort
    sortOrder.value = 'desc'
  }
  void refresh({ resetPage: true, preserveRows: true })
}

onMounted(bootstrap)
onBeforeUnmount(() => {
  requestVersion += 1
  activeController?.abort()
})
</script>

<template>
  <div class="page-stack settlement-list-page">
    <form class="filter-bar settlement-list-filter" @submit.prevent="refresh({ resetPage: true })">
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
        :years="quickYears"
        :months="quickMonths"
        @change="refresh({ resetPage: true })"
      />
      <SearchableSelect
        v-model="filters.merchantNo"
        :options="merchantSelectOptions"
        label="商号"
        aria-label="商号"
        placeholder="全部结算单"
        :loading="loading || sorting"
        @change="refresh({ resetPage: true })"
      />
      <SearchableSelect
        v-model="filters.brand"
        :options="brandSelectOptions"
        label="品牌"
        aria-label="品牌"
        placeholder="全部品牌"
        :loading="loading || sorting"
        @change="refresh({ resetPage: true })"
      />
      <button class="primary-button" type="submit" :disabled="loading || sorting">{{ loading ? '正在查询' : sorting ? '正在排序' : '查看结果' }}</button>
    </form>

    <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>
    <p v-if="exportError" class="export-feedback is-error" role="alert">{{ exportError }}</p>
    <p v-else-if="exportNotice" class="export-feedback" role="status" aria-live="polite">{{ exportNotice }}</p>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据明细没有加载成功</strong>{{ error }}</span>
      <button type="button" @click="refresh()">重新查询</button>
    </div>

    <section class="panel" :aria-busy="exportingAnything">
      <header class="panel-head">
        <h2>结算单列表</h2>
        <button
          class="primary-button list-export-button"
          type="button"
          :disabled="isExporting('list')"
          @click="runListExport"
        >
          <span v-if="isExporting('list')" class="button-spinner" aria-hidden="true"></span>
          <FileSpreadsheet v-else :size="13" aria-hidden="true" />
          {{ isExporting('list') ? '导出列表中…' : '导出列表' }}
        </button>
      </header>
      <div v-if="loading" class="skeleton-block">正在加载数据明细</div>
      <div v-else-if="!settlements.length" class="empty-state prominent">
        <strong>当前范围没有结算单</strong>
        <span>请调整销售日期范围，或从左侧菜单进入“数据导入”补充结算单。</span>
      </div>
      <div v-else class="settlement-list-results">
        <DataTable
          class="settlement-table fixed-height-list"
          fill-height
          fit-width
          :columns="columns"
          :rows="settlements"
          :row-key="(item) => item.merchantNo"
          caption="结算单列表：每张结算单的商号、单号、到达市场日期、销售日期、各等级件数、销售金额、每件均价与录单时间"
          min-width="880px"
          :active-sort-key="sortBy"
          :sort-order="sortOrder"
          :sort-busy="sorting"
          @sort="toggleSort"
        >
          <template #cell-merchantNo="{ row }">
            <span :title="rawMerchantNo(row) && rawMerchantNo(row) !== displayMerchantNo(row) ? `原始商号：${rawMerchantNo(row)}` : ''">
              {{ displayMerchantNo(row) }}
            </span>
          </template>
          <template #cell-actions="{ row }">
            <div class="table-actions">
              <ElDropdown class="export-dropdown" trigger="click" popper-class="export-dropdown-popper">
                <button
                  class="table-action"
                  type="button"
                  :disabled="isExporting(rowExportKey(row, 'xlsx')) || isExporting(rowExportKey(row, 'pdf'))"
                  @click.stop
                >
                  <Download :size="13" aria-hidden="true" />
                  操作
                  <span class="dropdown-caret" aria-hidden="true">▾</span>
                </button>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem @click="openRecords(row)">
                      <ListTree :size="14" aria-hidden="true" />
                      查看明细
                    </ElDropdownItem>
                    <ElDropdownItem :disabled="isExporting(rowExportKey(row, 'xlsx'))" @click="runRowExport(row, 'xlsx')">
                      <FileSpreadsheet :size="14" aria-hidden="true" />
                      {{ isExporting(rowExportKey(row, 'xlsx')) ? '导出中…' : 'Excel' }}
                    </ElDropdownItem>
                    <ElDropdownItem :disabled="isExporting(rowExportKey(row, 'pdf'))" @click="runRowExport(row, 'pdf')">
                      <FileText :size="14" aria-hidden="true" />
                      {{ isExporting(rowExportKey(row, 'pdf')) ? '导出中…' : 'PDF' }}
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
              <button
                class="table-action danger"
                type="button"
                :disabled="deletingMerchantNo === row.merchantNo"
                @click="requestDelete(row)"
              >
                {{ deletingMerchantNo === row.merchantNo ? '删除中…' : '删除' }}
              </button>
            </div>
          </template>
          <template #footer>
            <footer v-if="totalCount" class="list-pagination" aria-label="结算单分页">
              <span class="pagination-summary">共 <b>{{ totalCount }}</b> 张 · 第 <b>{{ page }}</b> / {{ totalPages }} 页</span>
              <ElPagination
                :current-page="page"
                :page-size="pageSize"
                :page-sizes="PAGE_SIZE_OPTIONS"
                :total="totalCount"
                :disabled="loading || sorting"
                layout="sizes, prev, pager, next"
                aria-label="结算单分页"
                @current-change="onPageChange"
                @size-change="onSizeChange"
              />
            </footer>
          </template>
        </DataTable>

      </div>

      <div v-if="exportingAnything" class="list-export-mask" role="status" aria-live="polite">
        <span class="mask-spinner" aria-hidden="true"></span>
        <strong>正在导出{{ exportingCount > 1 ? ` ${exportingCount} 个文件` : '' }}，请稍候</strong>
        <small>文件生成后会自动开始下载，请不要重复点击。</small>
      </div>
    </section>

    <div v-if="deleteTarget" class="delete-confirm-overlay" @click.self="cancelDelete">
      <section
        class="delete-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <header class="delete-confirm-head">
          <div>
            <h2 id="delete-confirm-title">确认删除</h2>
            <p>{{ settlementOptionLabel(deleteTarget) }}</p>
          </div>
          <button class="delete-confirm-close" type="button" aria-label="关闭确认框" @click="cancelDelete">×</button>
        </header>
        <p class="delete-confirm-copy">删除后该单的销售明细、售后、费用、汇总和留痕都会一起移除，无法撤销。</p>
        <div class="delete-confirm-actions">
          <button class="delete-confirm-cancel" type="button" :disabled="deleteBusy" @click="cancelDelete">取消</button>
          <button class="delete-confirm-submit" type="button" :disabled="deleteBusy" @click="confirmDelete">
            {{ deleteBusy ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settlement-list-page { gap: 12px; }
/* 表格的 min-width 会把 .page-stack 的网格轨道顶到 900px，在 640–1177px 之间整页被撑出横向滚动；
   让网格项可收缩，宽度不够时交给 .table-wrap 自己内部滚动。 */
.settlement-list-page > * { min-width: 0; }
/* 顶部区块收紧，把高度让给列表：配合下方“整页一屏高”，分页始终留在可视区。
   筛选栏版式统一由全局 .filter-bar 基线提供（flex 换行 + 13rem 下拉基准）。 */
.settlement-list-filter label { gap: 4px; font-size: .95rem; }
.list-export-button { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
.list-export-button:disabled,
.export-row-link:disabled { cursor: wait; opacity: .65; }
.button-spinner {
  width: .85rem;
  height: .85rem;
  border: 2px solid rgb(255 255 255 / 45%);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: export-spin .7s linear infinite;
}
@keyframes export-spin { to { transform: rotate(360deg); } }
.export-feedback { margin: 0; color: var(--primary-dark); font-size: .88rem; font-weight: 700; }
.export-feedback.is-error { color: var(--danger); }
.settlement-list-page .panel-head { margin-bottom: 10px; }
/* 导出进行中整个列表盖上遮罩：挡住重复点击、排序翻页与删除等操作。 */
.settlement-list-page .panel { position: relative; }
.list-export-mask {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 9px;
  padding: 22px;
  background: rgb(255 255 255 / 88%);
  backdrop-filter: blur(2px);
  text-align: center;
}
.list-export-mask strong { color: var(--ink); font-size: 1.05rem; }
.list-export-mask small { color: var(--muted); font-size: .88rem; line-height: 1.5; }
.mask-spinner {
  width: 1.6rem;
  height: 1.6rem;
  border: 3px solid rgb(43 94 74 / 25%);
  border-top-color: var(--primary-dark);
  border-radius: 50%;
  animation: export-spin .7s linear infinite;
}
/* 表格外观统一由 components/DataTable.vue 提供，本页只负责布局与分页。 */
.fixed-height-list {
  height: 100%;
  min-height: 31rem;
  overflow-y: hidden;
}
.text-button { min-height: 0; padding: 2px 8px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--primary-dark); cursor: pointer; font-size: .88rem; font-weight: 700; }
.text-button:hover { border-color: var(--primary); background: var(--primary-soft); }
/* 与管理端用户管理列表同款操作按钮：紧凑边框按钮，文案不换行。 */
.table-actions { display: flex; flex-wrap: nowrap; gap: .35rem; justify-content: center; }
.table-action {
  display: inline-flex;
  min-height: 2.35rem;
  align-items: center;
  gap: .35rem;
  padding: 0 .59rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--primary-dark);
  cursor: pointer;
  font-size: .9rem;
  font-weight: 700;
  white-space: nowrap;
}
.table-action:hover:not(:disabled) { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-dark); }
.table-action.danger { border-color: #e2bcb8; color: var(--danger); }
.table-action.danger:hover:not(:disabled) { border-color: var(--danger); background: #fbebe9; color: var(--danger); }
.table-action:disabled { cursor: not-allowed; opacity: .5; }
.table-action :deep(svg) { flex: 0 0 auto; }
.export-row-link { text-decoration: none; }
/* 操作菜单本体由 ElDropdown 渲染在 body（.export-dropdown-popper），这里只管触发按钮。 */
.export-dropdown { display: inline-flex; }
.dropdown-caret { margin-left: 2px; color: var(--muted); font-size: .72rem; }
/* ElDropdown 菜单渲染在 body 层，菜单项样式走全局 styles-element.css。 */
.delete-row-link { color: var(--danger); }
.delete-error { margin: 0; color: var(--danger); font-size: .88rem; font-weight: 700; }
.delete-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgb(20 28 24 / 55%);
}
.delete-confirm-dialog {
  width: min(100%, 30rem);
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-top: 3px solid var(--danger);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.delete-confirm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
}
.delete-confirm-head h2 { margin: 0 0 4px; font-size: 1.08rem; }
.delete-confirm-head p { margin: 0; color: var(--muted); font-size: .88rem; }
.delete-confirm-close {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 1.25rem;
  line-height: 1;
}
.delete-confirm-close:hover { border-color: var(--danger); color: var(--danger); }
.delete-confirm-copy { margin: 14px 0 0; color: var(--ink); line-height: 1.65; }
.delete-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.delete-confirm-cancel,
.delete-confirm-submit {
  min-height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: .92rem;
  font-weight: 700;
}
.delete-confirm-cancel {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}
.delete-confirm-cancel:hover:not(:disabled) { border-color: var(--primary); background: var(--surface-soft); }
.delete-confirm-submit {
  border: 1px solid var(--danger);
  background: var(--danger);
  color: white;
}
.delete-confirm-submit:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 86%, black); }
.delete-confirm-cancel:disabled,
.delete-confirm-submit:disabled { opacity: .55; cursor: wait; }
/* 分页条由 DataTable 的 footer 插槽渲染，间距交给表内底栏的 padding。 */
.list-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 12px; }
.pagination-summary { color: var(--muted); font-size: .84rem; }
.pagination-summary b { color: var(--ink); font-variant-numeric: tabular-nums; }
/* 分页控件靠右排（用户要求）；页脚在面板内侧、距窗口右缘还有页边距，不与右下角顺仔悬浮入口重叠。 */
.list-pagination .el-pagination { justify-content: flex-end; font-weight: 400; }

/* 桌面端让列表至少撑满剩余视口；行数超过一屏时随内容向下扩展，
   由页面自然滚动，避免结算单列表被压在内部小滚动区里。
   --settle-reserved = 顶部导航 + 页签 + main 上下内边距 + 页脚。 */
@media (min-width: 861px) {
  .settlement-list-page {
    --settle-reserved: calc(var(--app-header-height) + var(--app-tabs-height) + 9.2rem);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: max(32rem, calc(100dvh - var(--settle-reserved)));
  }
  /* 列表随内容扩展时，顶部筛选区保持原样不被压缩。 */
  .settlement-list-page > * { flex: 0 0 auto; }
  .settlement-list-page .page-header { padding-bottom: 6px; }
  .settlement-list-page .settlement-list-filter { gap: 8px; padding: 8px; }
  /* 列表标题与“共 N 张”合并成一行，省下的高度留给数据行。 */
  .settlement-list-page .panel-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; }
  .settlement-list-page .panel-head h2 { font-size: 1.2rem; }
  .settlement-list-page .panel-head span { color: var(--muted); font-size: .84rem; }
  .settlement-list-page .panel { display: grid; flex: 1 1 auto; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
  .settlement-list-page .panel > .skeleton-block { min-height: 0; }
  /* 分页在表内，结果区只剩表格一块，撑满剩余高度即可。 */
  .settlement-list-results { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); min-height: 0; }
  .settlement-table :deep(th),
  .settlement-table :deep(td) { padding: .75rem .82rem; }
  .settlement-table :deep(thead th) { font-size: .92rem; }
  /* 翻页控件靠左排：窗口右下角是“顺仔”悬浮入口的地盘，右侧整段留空就不会被按钮盖住。 */
  .list-pagination .el-pagination { flex-wrap: wrap; }
}

@media (max-width: 860px) {
  .settlement-list-filter { flex-direction: column; align-items: stretch; }
  /* 只放宽下拉；日期块的最小宽度由 DateRangeFilter 组件自带，不再用 min-width:0 抵消。 */
  .settlement-list-filter > .searchable-select { flex: 1 1 auto; min-width: 0; }
  .fixed-height-list { height: auto; min-height: 24rem; }
}

</style>
