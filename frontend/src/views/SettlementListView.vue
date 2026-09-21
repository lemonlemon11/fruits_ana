<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Download from '@lucide/vue/dist/esm/icons/download.mjs'
import FileSpreadsheet from '@lucide/vue/dist/esm/icons/file-spreadsheet.mjs'
import FileText from '@lucide/vue/dist/esm/icons/file-text.mjs'
import ListTree from '@lucide/vue/dist/esm/icons/list-tree.mjs'

import {
  deleteSettlement,
  getSettlements,
  gradeLabel,
  settlementTemplateExportUrl,
  settlementTemplatePdfUrl,
  type SettlementListItem,
  type SettlementPagination,
} from '../api/client'
import { GRADES, type Grade } from '../utils/grades'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import { formatCurrency, formatNumber, formatPrice } from '../utils/format'
import { settlementOptionLabel } from '../utils/settlementComparison'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import {
  getCachedSettlements,
  invalidateSettlementCandidateCache,
} from '../utils/settlementCandidateCache'

const filters = reactive({ startDate: '', endDate: '', merchantNo: '' })
const settlements = ref<SettlementListItem[]>([])
const options = ref<SettlementListItem[]>([])
const dateRange = ref<{ startDate: string; endDate: string; isDefault: boolean } | null>(null)
const loading = ref(true)
const error = ref('')
const deletingMerchantNo = ref('')
const deleteTarget = ref<SettlementListItem | null>(null)
const deleteError = ref('')
const pagination = ref<SettlementPagination | null>(null)
const page = ref(1)
const pageSize = ref(10)
/** 等级列在筛选范围内累积，翻页时列不跳变，与导出列口径一致。 */
const scopeGrades = ref<Grade[]>([])
const PAGE_SIZE_OPTIONS = [10, 20, 50]
let requestVersion = 0
let activeController: AbortController | null = null
const router = useRouter()

const rangeHint = computed(() => {
  if (!dateRange.value) return '暂无销售数据'
  const { startDate, endDate, isDefault } = dateRange.value
  return isDefault
    ? `默认展示最新销售日期往前一个月：${startDate} 至 ${endDate}`
    : `当前查询范围：${startDate} 至 ${endDate}`
})

const totalCount = computed(() => pagination.value?.total ?? settlements.value.length)
const totalPages = computed(() => pagination.value?.pages ?? 1)
const deleteBusy = computed(() => Boolean(deletingMerchantNo.value))

const visibleGrades = computed(() => scopeGrades.value)

/** 列表列定义：等级列随筛选范围动态展开，保证翻页时列不跳变。 */
const columns = computed<DataTableColumn<SettlementListItem>[]>(() => [
  { key: 'merchantNo', label: '商号', emphasis: true },
  { key: 'orderNo', label: '单号', emphasis: true, value: (item) => item.orderNoNormalized || item.orderNo || '—' },
  { key: 'containerNo', label: '柜号', value: (item) => item.containerNo || '—' },
  { key: 'arrivalDate', label: '到达市场日期', value: (item) => item.arrivalDate || '—' },
  { key: 'salePeriod', label: '销售日期', value: (item) => salesPeriod(item) },
  { key: 'totalQuantity', label: '总件数', numeric: true, value: (item) => formatNumber(item.totalQuantity) },
  ...visibleGrades.value.map((grade) => ({
    key: `grade-${grade}`,
    label: `${gradeLabel(grade)}件数`,
    numeric: true,
    value: (item: SettlementListItem) => formatNumber(item.gradeQuantities[grade]),
  })),
  { key: 'salesAmount', label: '销售金额', numeric: true, value: (item) => formatCurrency(item.salesAmount) },
  { key: 'averagePrice', label: '每件均价', numeric: true, value: (item) => formatPrice(item.averagePrice) },
  { key: 'actions', label: '操作', align: 'right', width: '13.5rem' },
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

function salesPeriod(item: SettlementListItem): string {
  if (!item.saleDateStart) return '—'
  return item.saleDateStart === item.saleDateEnd
    ? item.saleDateStart
    : `${item.saleDateStart} 至 ${item.saleDateEnd}`
}

/** 当前展开导出菜单的商号（桌面端） */
const openExportMenu = ref('')

/** 切换导出下拉菜单 */
function toggleExportMenu(merchantNo: string) {
  openExportMenu.value = openExportMenu.value === merchantNo ? '' : merchantNo
}

/** 点击页面其他位置关闭导出菜单 */
function onDocumentClick() {
  openExportMenu.value = ''
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})

function rowExportUrl(item: SettlementListItem, fmt: 'xlsx' | 'pdf' = 'xlsx'): string {
  return fmt === 'pdf'
    ? settlementTemplatePdfUrl(item.merchantNo)
    : settlementTemplateExportUrl(item.merchantNo)
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

async function refresh(options: { resetPage?: boolean } = {}) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '销售日期起不能晚于销售日期止'
    return
  }
  if (options.resetPage) {
    page.value = 1
    scopeGrades.value = []
  }
  const version = ++requestVersion
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  loading.value = true
  error.value = ''
  try {
    const data = await getSettlements({
      ...filters,
      page: page.value,
      pageSize: pageSize.value,
    }, { signal: controller.signal })
    if (version !== requestVersion) return
    settlements.value = data.settlements
    dateRange.value = data.dateRange
    pagination.value = data.pagination
    if (data.pagination) page.value = data.pagination.page
    mergeScopeGrades(data.settlements)
  } catch (caught) {
    if (controller.signal.aborted) return
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '数据明细加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
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
    dateRange.value = data.dateRange
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

function onPageSizeChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value) || value === pageSize.value) return
  pageSize.value = value
  refresh({ resetPage: true })
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
      <SearchableSelect
        v-model="filters.merchantNo"
        :options="merchantSelectOptions"
        label="商号"
        aria-label="商号"
        placeholder="全部结算单"
        @change="refresh({ resetPage: true })"
      />
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
      />
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '正在查询' : '查看结果' }}</button>
    </form>

    <p v-if="dateRange" class="range-note">{{ rangeHint }}</p>
    <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据明细没有加载成功</strong>{{ error }}</span>
      <button type="button" @click="refresh()">重新查询</button>
    </div>

    <section class="panel">
      <header class="panel-head">
        <h2>结算单列表</h2>
      </header>
      <div v-if="loading" class="skeleton-block">正在加载数据明细</div>
      <div v-else-if="!settlements.length" class="empty-state prominent">
        <strong>当前范围没有结算单</strong>
        <span>请调整销售日期范围，或从左侧菜单进入“数据导入”补充结算单。</span>
      </div>
      <div v-else class="settlement-list-results">
        <DataTable
          class="settlement-table"
          :columns="columns"
          :rows="settlements"
          :row-key="(item) => item.merchantNo"
          caption="结算单列表：每张结算单的商号、单号、柜号、到达市场日期、销售日期、各等级件数、销售金额与每件均价"
          min-width="900px"
          bordered
        >
          <template #cell-merchantNo="{ row }">
            <span :title="rawMerchantNo(row) && rawMerchantNo(row) !== displayMerchantNo(row) ? `原始商号：${rawMerchantNo(row)}` : ''">
              {{ displayMerchantNo(row) }}
            </span>
          </template>
          <template #cell-actions="{ row }">
            <div class="row-actions">
              <span class="export-dropdown">
                <button class="row-action-button" type="button" @click.prevent.stop="toggleExportMenu(row.merchantNo)">
                  <Download :size="13" aria-hidden="true" />
                  导出
                </button>
                <span class="export-sub" :class="{ visible: openExportMenu === row.merchantNo }">
                  <a :href="rowExportUrl(row, 'xlsx')" download @click.stop="openExportMenu = ''"><FileSpreadsheet :size="14" aria-hidden="true" /> Excel</a>
                  <a :href="rowExportUrl(row, 'pdf')" download @click.stop="openExportMenu = ''"><FileText :size="14" aria-hidden="true" /> PDF</a>
                </span>
              </span>
              <button class="row-action-button is-primary" type="button" @click="openRecords(row)">
                <ListTree :size="13" aria-hidden="true" />
                查看明细
              </button>
              <button
                class="row-action-button is-danger"
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
              <label class="pagination-size">每页
                <select :value="pageSize" @change="onPageSizeChange">
                  <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
                </select>
                张
              </label>
              <div class="pagination-actions">
                <button type="button" class="page-button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
                <button type="button" class="page-button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
              </div>
            </footer>
          </template>
        </DataTable>

        <div class="mobile-settlement-cards">
          <article v-for="item in settlements" :key="item.merchantNo" class="mobile-settlement-card">
            <header>
              <div>
                <strong>{{ displayMerchantNo(item) }}</strong>
                <small>
                  {{ item.orderNoNormalized || item.orderNo || '未登记单号' }} · {{ item.containerNo || '未登记柜号' }}
                  <br />
                  到达 {{ item.arrivalDate || '—' }} · 销售 {{ salesPeriod(item) }}
                </small>
              </div>
            </header>
            <div class="mobile-settlement-stats">
              <span>销售金额 <b>{{ formatCurrency(item.salesAmount) }}</b></span>
              <span>销量 <b>{{ formatNumber(item.totalQuantity) }}</b></span>
              <span>每件均价 <b>{{ formatPrice(item.averagePrice) }}</b></span>
            </div>
            <div class="mobile-settlement-grades">
              <span v-for="grade in visibleGrades" :key="grade">
                {{ gradeLabel(grade) }} <b>{{ formatNumber(item.gradeQuantities[grade]) }}</b>
              </span>
            </div>
            <div class="mobile-card-actions-bar">
              <button class="primary-button mobile-detail-button" type="button" @click="openRecords(item)">查看明细</button>
              <a class="text-button export-row-link" :href="rowExportUrl(item, 'xlsx')" download>
                <FileSpreadsheet :size="14" aria-hidden="true" /> Excel
              </a>
              <a class="text-button export-row-link" :href="rowExportUrl(item, 'pdf')" download>
                <FileText :size="14" aria-hidden="true" /> PDF
              </a>
              <button
                class="text-button delete-row-link"
                type="button"
                :disabled="deletingMerchantNo === item.merchantNo"
                @click="requestDelete(item)"
              >
                {{ deletingMerchantNo === item.merchantNo ? '删除中…' : '删除' }}
              </button>
            </div>
          </article>
        </div>

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
/* 顶部区块收紧，把高度让给列表：配合下方“整页一屏高”，分页始终留在可视区。 */
.settlement-list-filter { grid-template-columns: repeat(2, minmax(160px, 1fr)) auto; gap: 10px; padding: 10px; }
.settlement-list-filter label { gap: 4px; font-size: .95rem; }
.range-note { margin: 0; color: var(--muted); font-size: .84rem; }
/* 表格外观统一由 components/DataTable.vue 提供，本页只负责布局与分页。 */
.text-button { min-height: 0; padding: 2px 8px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--primary-dark); cursor: pointer; font-size: .88rem; font-weight: 700; }
.text-button:hover { border-color: var(--primary); background: var(--primary-soft); }
/* 行内操作：导出按模板出单张结算单，查看明细展开该商号的销售记录。 */
.row-actions { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 6px; white-space: nowrap; }
/* 行内按钮保持紧凑：高度必须控制在 20px 内，否则 10 行就放不进一屏。 */
.row-action-button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--primary-dark);
  cursor: pointer;
  font-size: .82rem;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
}
.row-action-button:hover { border-color: var(--primary); background: var(--primary-soft); }
/* 主操作（查看明细）用实心绿，和移动端卡片的“查看明细”保持同一层级。 */
.row-action-button.is-primary { border-color: var(--primary-dark); background: var(--primary); color: white; }
.row-action-button.is-primary:hover { background: var(--primary-dark); color: white; }
.row-action-button.is-danger { border-color: color-mix(in srgb, var(--danger) 55%, white); color: var(--danger); }
.row-action-button.is-danger:hover:not(:disabled) { border-color: var(--danger); background: #fbe9e7; }
.row-action-button:disabled { opacity: .5; cursor: wait; }
.row-action-button :deep(svg) { flex: 0 0 auto; }
.export-row-link { text-decoration: none; }
/* 导出下拉菜单 */
.export-dropdown { position: relative; display: inline-flex; }
.export-sub {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  min-width: 100px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
  overflow: hidden;
}
.export-sub.visible { display: block; }
.export-sub a {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  color: var(--ink);
  font-size: .84rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.export-sub a:hover { background: var(--surface-soft); color: var(--primary); }
.export-sub a svg { flex: 0 0 auto; }
.export-sub a + a { border-top: 1px solid var(--line); }
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
.mobile-settlement-cards { display: none; }
/* 分页条由 DataTable 的 footer 插槽渲染，间距交给表内底栏的 padding。 */
.list-pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.pagination-summary { color: var(--muted); font-size: .84rem; }
.pagination-summary b { color: var(--ink); font-variant-numeric: tabular-nums; }
.pagination-size { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: .84rem; }
.pagination-size select { min-height: 28px; padding: 0 6px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font: inherit; }
.pagination-actions { display: inline-flex; gap: 8px; margin-left: auto; }
.page-button { min-height: 28px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-soft); color: var(--primary-dark); cursor: pointer; font-size: .9rem; font-weight: 700; }
.page-button:hover:not(:disabled) { border-color: var(--primary); }
.page-button:disabled { border-color: var(--line); background: var(--surface); color: var(--muted); cursor: not-allowed; }

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
  .settlement-list-page .panel { display: grid; flex: 1 1 auto; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
  .settlement-list-page .panel > .skeleton-block { min-height: 0; }
  /* 分页在表内，结果区只剩表格一块，撑满剩余高度即可。 */
  .settlement-list-results { display: grid; grid-template-rows: minmax(0, 1fr); min-height: 0; }
  /* 行高保持好读即可，不再为“一屏塞下 10 行”压缩行高。 */
  .settlement-table :deep(th),
  .settlement-table :deep(td) { padding: .5rem .7rem; }
  .settlement-table :deep(thead th) { font-size: .92rem; }
  /* 翻页控件靠左排：窗口右下角是“顺仔”悬浮入口的地盘，右侧整段留空就不会被按钮盖住。 */
  .pagination-actions { margin-left: 0; }
}

@media (max-width: 860px) {
  .settlement-list-filter { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .settlement-list-results { min-width: 0; }
  .settlement-list-page .range-note { display: none; }
  .settlement-list-page .panel-head { display: none; }
  .filter-bar.settlement-list-filter { display: flex; flex-wrap: nowrap; gap: 6px; padding: 4px; overflow-x: auto; scrollbar-width: none; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); }
  .filter-bar.settlement-list-filter::-webkit-scrollbar { display: none; }
  .filter-bar.settlement-list-filter > * { flex: 0 0 auto; }
  .filter-bar.settlement-list-filter .primary-button { flex: 0 0 auto; min-height: 34px; padding: 0 .7rem; }
  .filter-bar.settlement-list-filter input,
  .filter-bar.settlement-list-filter select { min-height: 32px; font-size: .82rem; }


  /* 移动端换成卡片：表格只隐藏数据区，表内底栏（分页）留着并排到卡片下方，
     这样分页仍然只有一处，桌面 / 移动共用同一段标记。 */
  .settlement-list-results { display: flex; flex-direction: column; gap: 8px; }
  .settlement-list-results .settlement-table { order: 2; border: 0; border-radius: 0; background: none; }
  .settlement-list-results .settlement-table :deep(.data-table-scroll) { display: none; }
  .settlement-list-results .settlement-table :deep(.data-table-foot) { padding: 0; border-top: 0; background: none; }
  .mobile-settlement-cards { order: 1; display: grid; gap: 8px; }
  /* 卡片按「标题 → 指标 → 等级 → 操作」四段式排列，操作独立成行避免挤压标题。 */
  .mobile-settlement-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .mobile-settlement-card header { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px 8px; }
  .mobile-settlement-card header > div:first-child { flex: 1 1 auto; min-width: 0; }
  .mobile-settlement-card header > div { display: grid; gap: 2px; min-width: 0; }
  .mobile-settlement-card header strong { font-size: 1.05rem; font-weight: 800; line-height: 1.25; }
  .mobile-settlement-card header small { color: var(--muted); font-size: .72rem; line-height: 1.45; overflow-wrap: anywhere; }

  .mobile-settlement-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--line);
    background: var(--surface-soft);
    color: var(--muted);
    font-size: .7rem;
    line-height: 1.3;
  }
  .mobile-settlement-stats span { display: block; min-width: 0; }
  .mobile-settlement-stats b {
    display: block;
    margin-top: 2px;
    color: var(--ink);
    font-size: .92rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .mobile-settlement-grades {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--line);
  }
  .mobile-settlement-grades span {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: .72rem;
    white-space: nowrap;
  }
  .mobile-settlement-grades b { color: var(--ink); font-size: .8rem; font-variant-numeric: tabular-nums; }

  .mobile-card-actions-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 10px;
    border-top: 1px solid var(--line);
  }
  .mobile-detail-button { flex: 1 1 auto; min-height: 38px; padding: 0 12px; font-size: .82rem; }
  .mobile-card-actions-bar .export-row-link {
    display: inline-flex;
    flex: 0 0 auto;
    min-height: 38px;
    align-items: center;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    color: var(--primary-dark);
    font-size: .82rem;
  }
  .mobile-card-actions-bar .delete-row-link { flex: 0 0 auto; min-height: 38px; padding: 0 8px; font-size: .82rem; }
  .list-pagination { gap: 6px 10px; }
  .pagination-summary { font-size: .78rem; }
  .pagination-size { font-size: .78rem; }
  .pagination-size select { min-height: 32px; }
  .pagination-actions { width: 100%; margin-left: 0; }
  .page-button { flex: 1 1 0; min-height: 40px; }
}
</style>
