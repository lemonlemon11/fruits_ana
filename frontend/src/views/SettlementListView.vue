<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getSettlements, gradeLabel, type SettlementListItem } from '../api/client'
import { GRADES } from '../utils/grades'
import DateRangeFilter from '../components/DateRangeFilter.vue'
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
let requestVersion = 0

const rangeHint = computed(() => {
  if (!dateRange.value) return '暂无销售数据'
  const { startDate, endDate, isDefault } = dateRange.value
  return isDefault
    ? `默认展示最新到达日期往前一个月：${startDate} 至 ${endDate}`
    : `当前查询范围：${startDate} 至 ${endDate}`
})

const visibleGrades = computed(() =>
  GRADES.filter((grade) =>
    settlements.value.some((item) => (item.gradeQuantities[grade] ?? 0) > 0),
  ),
)

const activeSettlement = computed(
  () => options.value.find((item) => item.merchantNo === activeMerchantNo.value)
    ?? settlements.value.find((item) => item.merchantNo === activeMerchantNo.value)
    ?? null,
)

function salesPeriod(item: SettlementListItem): string {
  if (!item.saleDateStart) return '—'
  return item.saleDateStart === item.saleDateEnd
    ? item.saleDateStart
    : `${item.saleDateStart} 至 ${item.saleDateEnd}`
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

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '到达日期起不能晚于到达日期止'
    return
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const data = await getSettlements({ ...filters })
    if (version !== requestVersion) return
    settlements.value = data.settlements
    dateRange.value = data.dateRange
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '数据明细加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

onMounted(() => {
  loadOptions()
  refresh()
})
</script>

<template>
  <div class="page-stack settlement-list-page">
    <header class="page-header">
      <div>
        <h1>数据明细</h1>
        <p>按商号查看每张结算单的销售额、各等级件数和平均每公斤售价，并可展开查看全部销售明细。</p>
      </div>
    </header>

    <section class="how-to" aria-label="查看方法">
      <strong>怎么查看</strong>
      <span>第一步：按商号选择结算单和到达日期，切换商号会立即刷新。第二步：改完到达日期后点击“查看结果”，再点右侧“查看明细”核对每一条销售记录。</span>
    </section>

    <form class="filter-bar settlement-list-filter" @submit.prevent="refresh">
      <label>商号
        <select v-model="filters.merchantNo" @change="refresh">
          <option value="">全部结算单</option>
          <option v-for="item in options" :key="item.merchantNo" :value="item.merchantNo">{{ settlementOptionLabel(item) }}</option>
        </select>
      </label>
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
      />
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '正在查询' : '查看结果' }}</button>
    </form>

    <p class="range-note">{{ rangeHint }}</p>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据明细没有加载成功</strong>{{ error }}</span>
      <button type="button" @click="refresh">重新查询</button>
    </div>

    <section class="panel">
      <header class="panel-head">
        <h2>结算单列表</h2>
        <span>{{ loading ? '正在加载' : `${settlements.length} 张结算单` }}</span>
      </header>
      <div v-if="loading" class="skeleton-block">正在加载数据明细</div>
      <div v-else-if="!settlements.length" class="empty-state compact">
        <strong>当前范围没有结算单</strong>
        <span>请调整到达日期范围，或从左侧菜单进入“数据导入”补充结算单。</span>
      </div>
      <div v-else class="settlement-list-results">
        <div class="table-wrap settlement-table">
          <table>
            <thead>
              <tr>
                <th>商号</th><th>单号</th><th>柜号</th><th>到达日期</th><th>总件数</th>
                <th v-for="grade in visibleGrades" :key="grade">{{ gradeLabel(grade) }}件数</th>
                <th>销售额</th><th>平均每公斤售价</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in settlements" :key="item.merchantNo">
                <td :title="rawMerchantNo(item) && rawMerchantNo(item) !== displayMerchantNo(item) ? `原始商号：${rawMerchantNo(item)}` : ''">
                  {{ displayMerchantNo(item) }}
                </td>
                <td :title="item.orderNo && item.orderNo !== item.orderNoNormalized ? `原始单号：${item.orderNo}` : ''">
                  {{ item.orderNoNormalized || item.orderNo || '—' }}
                </td>
                <td>{{ item.containerNo || '—' }}</td>
                <td>{{ salesPeriod(item) }}</td>
                <td>{{ formatNumber(item.totalQuantity) }}</td>
                <td v-for="grade in visibleGrades" :key="grade">{{ formatNumber(item.gradeQuantities[grade]) }}</td>
                <td>{{ formatCurrency(item.salesAmount) }}</td>
                <td>{{ formatPrice(item.averagePrice) }}</td>
                <td><button class="text-button" type="button" @click="openRecords(item)">查看明细</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mobile-settlement-cards">
          <article v-for="item in settlements" :key="item.merchantNo" class="mobile-settlement-card">
            <header>
              <div>
                <strong>{{ displayMerchantNo(item) }}</strong>
                <small>{{ item.orderNoNormalized || item.orderNo || '未登记单号' }} · {{ item.containerNo || '未登记柜号' }} · {{ salesPeriod(item) }}</small>
              </div>
              <button class="primary-button mobile-detail-button" type="button" @click="openRecords(item)">查看明细</button>
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
.settlement-list-page { gap: 16px; }
.settlement-list-filter { grid-template-columns: repeat(2, minmax(160px, 1fr)) auto; }
.range-note { margin: 0; color: var(--muted); font-size: .86rem; }
.settlement-table table { min-width: 900px; }
/* 表格的 min-width 会把 .page-stack 的网格轨道顶到 900px，在 640–1177px 之间整页被撑出横向滚动；
   让网格项可收缩，宽度不够时交给 .table-wrap 自己内部滚动。 */
.settlement-list-page > * { min-width: 0; }
.settlement-table th:first-child,
.settlement-table td:first-child,
.settlement-table th:nth-child(2),
.settlement-table td:nth-child(2),
.settlement-table th:nth-child(3),
.settlement-table td:nth-child(3),
.settlement-table th:nth-child(4),
.settlement-table td:nth-child(4) { text-align: left; }
.text-button { padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-soft); color: var(--primary-dark); cursor: pointer; font-weight: 700; }
.text-button:hover { border-color: var(--primary); }
.mobile-settlement-cards { display: none; }

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
  .settlement-list-results .table-wrap { display: none; }
  .mobile-settlement-cards { display: grid; gap: 8px; }
  .mobile-settlement-card { display: grid; gap: 5px; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
  .mobile-settlement-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mobile-settlement-card header > div { display: grid; gap: 2px; min-width: 0; }
  .mobile-settlement-card header strong { overflow-wrap: anywhere; font-size: .95rem; line-height: 1.25; }
  .mobile-settlement-card header small { color: var(--muted); font-size: .7rem; line-height: 1.3; }
  .mobile-detail-button { flex: 0 0 auto; min-height: 38px; padding: 0 10px; font-size: .82rem; }
  .mobile-settlement-stats { display: flex; flex-wrap: wrap; gap: 2px 8px; color: var(--muted); font-size: .7rem; line-height: 1.25; }
  .mobile-settlement-stats span { display: inline-flex; align-items: baseline; gap: 3px; }
  .mobile-settlement-stats b { color: var(--ink); font-size: .82rem; font-variant-numeric: tabular-nums; }
}
</style>
