<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Download from '@lucide/vue/dist/esm/icons/download.mjs'
import ListTree from '@lucide/vue/dist/esm/icons/list-tree.mjs'

import {
  getSettlements,
  gradeLabel,
  settlementTemplateExportUrl,
  type SettlementListItem,
  type SettlementPagination,
} from '../api/client'
import { GRADES, type Grade } from '../utils/grades'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import SettlementRecordsDialog from '../components/SettlementRecordsDialog.vue'
import { formatCurrency, formatNumber, formatPrice } from '../utils/format'
import { settlementOptionLabel } from '../utils/settlementComparison'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'

const filters = reactive({ startDate: '', endDate: '', merchantNo: '' })
const settlements = ref<SettlementListItem[]>([])
const options = ref<SettlementListItem[]>([])
const dateRange = ref<{ startDate: string; endDate: string; isDefault: boolean } | null>(null)
const loading = ref(true)
const error = ref('')
const activeMerchantNo = ref('')
const pagination = ref<SettlementPagination | null>(null)
const page = ref(1)
const pageSize = ref(10)
/** 等级列在筛选范围内累积，翻页时列不跳变，与导出列口径一致。 */
const scopeGrades = ref<Grade[]>([])
const PAGE_SIZE_OPTIONS = [10, 20, 50]
let requestVersion = 0

const rangeHint = computed(() => {
  if (!dateRange.value) return '暂无销售数据'
  const { startDate, endDate, isDefault } = dateRange.value
  return isDefault
    ? `默认展示最新到达日期往前一个月：${startDate} 至 ${endDate}`
    : `当前查询范围：${startDate} 至 ${endDate}`
})

const totalCount = computed(() => pagination.value?.total ?? settlements.value.length)
const totalPages = computed(() => pagination.value?.pages ?? 1)

const visibleGrades = computed(() => scopeGrades.value)

/** 列表列定义：等级列随筛选范围动态展开，保证翻页时列不跳变。 */
const columns = computed<DataTableColumn<SettlementListItem>[]>(() => [
  { key: 'merchantNo', label: '商号', emphasis: true },
  { key: 'orderNo', label: '单号', emphasis: true, value: (item) => item.orderNoNormalized || item.orderNo || '—' },
  { key: 'containerNo', label: '柜号', value: (item) => item.containerNo || '—' },
  { key: 'salePeriod', label: '到达日期', value: (item) => salesPeriod(item) },
  { key: 'totalQuantity', label: '总件数', numeric: true, value: (item) => formatNumber(item.totalQuantity) },
  ...visibleGrades.value.map((grade) => ({
    key: `grade-${grade}`,
    label: `${gradeLabel(grade)}件数`,
    numeric: true,
    value: (item: SettlementListItem) => formatNumber(item.gradeQuantities[grade]),
  })),
  { key: 'salesAmount', label: '销售额', numeric: true, value: (item) => formatCurrency(item.salesAmount) },
  { key: 'averagePrice', label: '平均每公斤售价', numeric: true, value: (item) => formatPrice(item.averagePrice) },
  { key: 'actions', label: '操作', align: 'right', width: '10.5rem' },
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

const activeSettlement = computed(
  () => options.value.find((item) => item.merchantNo === activeMerchantNo.value)
    ?? settlements.value.find((item) => item.merchantNo === activeMerchantNo.value)
    ?? null,
)
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

function rowExportUrl(item: SettlementListItem): string {
  return settlementTemplateExportUrl(item.merchantNo)
}

function openRecords(item: SettlementListItem) {
  activeMerchantNo.value = item.merchantNo
}

function closeRecords() {
  activeMerchantNo.value = ''
}

async function loadOptions() {
  options.value = (await getSettlements()).settlements
}

async function refresh(options: { resetPage?: boolean } = {}) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '到达日期起不能晚于到达日期止'
    return
  }
  if (options.resetPage) {
    page.value = 1
    scopeGrades.value = []
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const data = await getSettlements({
      ...filters,
      page: page.value,
      pageSize: pageSize.value,
    })
    if (version !== requestVersion) return
    settlements.value = data.settlements
    dateRange.value = data.dateRange
    pagination.value = data.pagination
    if (data.pagination) page.value = data.pagination.page
    mergeScopeGrades(data.settlements)
  } catch (caught) {
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

onMounted(() => {
  loadOptions()
  refresh()
})
</script>

<template>
  <div class="page-stack settlement-list-page">
    <form class="filter-bar settlement-list-filter" @submit.prevent="refresh({ resetPage: true })">
      <SearchableSelect
        v-model="filters.merchantNo"
        :options="merchantSelectOptions"
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
        <span>请调整到达日期范围，或从左侧菜单进入“数据导入”补充结算单。</span>
      </div>
      <div v-else class="settlement-list-results">
        <DataTable
          class="settlement-table"
          :columns="columns"
          :rows="settlements"
          :row-key="(item) => item.merchantNo"
          caption="结算单列表：每张结算单的商号、单号、柜号、到达日期、各等级件数、销售额与平均每公斤售价"
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
              <a class="row-action-button" :href="rowExportUrl(row)" download>
                <Download :size="13" aria-hidden="true" />
                导出
              </a>
              <button class="row-action-button is-primary" type="button" @click="openRecords(row)">
                <ListTree :size="13" aria-hidden="true" />
                查看明细
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
                <small>{{ item.orderNoNormalized || item.orderNo || '未登记单号' }} · {{ item.containerNo || '未登记柜号' }} · {{ salesPeriod(item) }}</small>
              </div>
              <div class="mobile-card-actions">
                <a class="text-button export-row-link" :href="rowExportUrl(item)" download>导出</a>
                <button class="primary-button mobile-detail-button" type="button" @click="openRecords(item)">查看明细</button>
              </div>
            </header>
            <div class="mobile-settlement-stats">
              <span>销售额 <b>{{ formatCurrency(item.salesAmount) }}</b></span>
              <span v-for="grade in visibleGrades" :key="grade">{{ gradeLabel(grade) }} <b>{{ formatNumber(item.gradeQuantities[grade]) }}</b></span>
              <span>平均每公斤售价 <b>{{ formatPrice(item.averagePrice) }}</b></span>
            </div>
          </article>
        </div>

      </div>
    </section>

    <SettlementRecordsDialog
      v-if="activeMerchantNo"
      :merchant-no="activeMerchantNo"
      :title="activeSettlement ? settlementOptionLabel(activeSettlement) : `商号 ${activeMerchantNo}`"
      @close="closeRecords"
    />
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
.row-action-button :deep(svg) { flex: 0 0 auto; }
.export-row-link { text-decoration: none; }
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

/* 桌面端把整页锁在一屏内：顶部区块收紧，列表按整页行数自适应高度，
   行数超过可视高度时才由列表内部滚动（表头吸顶），整页不再上下滚。
   --settle-reserved = 顶部导航 + 页签 + main 上下内边距 + 页脚。 */
@media (min-width: 861px) {
  .settlement-list-page {
    --settle-reserved: calc(var(--app-header-height) + var(--app-tabs-height) + 9.2rem);
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: max(32rem, calc(100dvh - var(--settle-reserved)));
    min-height: 0;
  }
  /* 行数多到超出一屏时，只压缩列表所在的 .panel，顶部区块保持原样不被挤扁。 */
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
  /* 行高要在“好读”和“整页 10 行一屏放得下”之间取平衡：
     .5rem 会让 1440×900 下最后一行被压掉 5px，只能内部滚动。 */
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
  .filter-bar.settlement-list-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 6px; }
  .filter-bar.settlement-list-filter input,
  .filter-bar.settlement-list-filter select { min-height: 36px; font-size: .9rem; }
  .filter-bar.settlement-list-filter > * { grid-column: auto; }
  .filter-bar.settlement-list-filter .primary-button { grid-column: 1 / -1; min-height: 40px; }
  /* 移动端换成卡片：表格只隐藏数据区，表内底栏（分页）留着并排到卡片下方，
     这样分页仍然只有一处，桌面 / 移动共用同一段标记。 */
  .settlement-list-results { display: flex; flex-direction: column; gap: 8px; }
  .settlement-list-results .settlement-table { order: 2; border: 0; border-radius: 0; background: none; }
  .settlement-list-results .settlement-table :deep(.data-table-scroll) { display: none; }
  .settlement-list-results .settlement-table :deep(.data-table-foot) { padding: 0; border-top: 0; background: none; }
  .mobile-settlement-cards { order: 1; display: grid; gap: 8px; }
  .mobile-settlement-card { display: grid; gap: 5px; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
  .mobile-settlement-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  /* 标题让出空间，导出与查看明细保持同一行，不再折成两行。 */
  .mobile-settlement-card header > div:first-child { flex: 1 1 auto; min-width: 0; }
  .mobile-settlement-card header > div { display: grid; gap: 2px; min-width: 0; }
  .mobile-settlement-card header strong { overflow-wrap: anywhere; font-size: .95rem; line-height: 1.25; }
  .mobile-settlement-card header small { color: var(--muted); font-size: .7rem; line-height: 1.3; }
  .mobile-settlement-card header > div.mobile-card-actions { display: inline-flex; flex: 0 0 auto; flex-wrap: nowrap; align-items: center; gap: 4px; }
  .mobile-card-actions .export-row-link { min-height: 38px; display: inline-flex; align-items: center; padding: 0 10px; font-size: .82rem; }
  .mobile-detail-button { flex: 0 0 auto; min-height: 38px; padding: 0 10px; font-size: .82rem; }
  .mobile-settlement-stats { display: flex; flex-wrap: wrap; gap: 2px 8px; color: var(--muted); font-size: .7rem; line-height: 1.25; }
  .mobile-settlement-stats span { display: inline-flex; align-items: baseline; gap: 3px; }
  .mobile-settlement-stats b { color: var(--ink); font-size: .82rem; font-variant-numeric: tabular-nums; }
  .list-pagination { gap: 6px 10px; }
  .pagination-summary { font-size: .78rem; }
  .pagination-size { font-size: .78rem; }
  .pagination-size select { min-height: 32px; }
  .pagination-actions { width: 100%; margin-left: 0; }
  .page-button { flex: 1 1 0; min-height: 40px; }
}
</style>
