<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Grade, SettlementComparisonItem } from '../api/client'
import { activeGrades, gradeLabel } from '../utils/grades'
import { displayMerchantNo } from '../utils/merchantNo'
import { settlementOptionLabel, settlementSeries } from '../utils/settlementComparison'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import SearchableSelect from './SearchableSelect.vue'

type SortKey = 'salesAmount' | 'salesQuantity' | 'weightedAvgPrice' | 'series' | 'saleDate' | 'merchantNo'

const props = withDefaults(defineProps<{
  items: SettlementComparisonItem[]
  loading?: boolean
  mode?: 'metrics' | 'identity'
}>(), { mode: 'metrics' })

const metricsSortOptions = [
  { value: 'salesAmount', label: '按销售金额' },
  { value: 'salesQuantity', label: '按销量' },
  { value: 'weightedAvgPrice', label: '按每件均价' },
] as const
const identitySortOptions = [
  { value: 'series', label: '按品牌' },
  { value: 'saleDate', label: '按销售日期' },
  { value: 'merchantNo', label: '按商号' },
] as const

const gradeOrder = computed(() => activeGrades(props.items.flatMap((item) => item.grades)))

const sortOptions = computed(() => props.mode === 'identity' ? identitySortOptions : metricsSortOptions)
const sortSelectOptions = computed(() =>
  sortOptions.value.map((option) => ({ value: option.value, label: option.label })),
)
const sortBy = ref<SortKey>(props.mode === 'identity' ? 'saleDate' : 'salesAmount')

function merchantLabel(item: SettlementComparisonItem): string {
  return displayMerchantNo(item)
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'zh-Hans-CN', { numeric: true })
}

function compareDate(left: SettlementComparisonItem, right: SettlementComparisonItem): number {
  return compareText(right.startDate || right.endDate || '', left.startDate || left.endDate || '')
}

function compareSeries(left: SettlementComparisonItem, right: SettlementComparisonItem): number {
  return compareText(settlementSeries(left), settlementSeries(right))
}

function compareMerchant(left: SettlementComparisonItem, right: SettlementComparisonItem): number {
  return compareText(merchantLabel(right), merchantLabel(left))
}

const sortedItems = computed(() => [...props.items].sort((left, right) => {
  if (sortBy.value === 'series') {
    return compareSeries(left, right) || compareDate(left, right) || compareMerchant(left, right)
  }
  if (sortBy.value === 'saleDate') {
    return compareDate(left, right) || compareSeries(left, right) || compareMerchant(left, right)
  }
  if (sortBy.value === 'merchantNo') {
    return compareMerchant(left, right) || compareDate(left, right) || compareSeries(left, right)
  }
  return (right[sortBy.value] ?? -1) - (left[sortBy.value] ?? -1)
}))

function periodLabel(item: SettlementComparisonItem): string {
  if (!item.startDate && !item.endDate) return '销售日期未登记'
  if (!item.startDate || item.startDate === item.endDate) return item.startDate || item.endDate || '销售日期未登记'
  return `${item.startDate} 至 ${item.endDate}`
}

function gradeOf(item: SettlementComparisonItem, grade: Grade) {
  return item.grades.find((row) => row.grade === grade)
}
</script>

<template>
  <section class="dashboard-section comparison-section" aria-labelledby="comparison-title">
    <header class="section-heading comparison-heading">
      <div>
        <h2 id="comparison-title">结算单对比</h2>
        <p class="section-note">{{ mode === 'identity' ? '按品牌、销售日期或商号排序查看' : '按销售金额、销量或每件均价排序查看' }}</p>
      </div>
      <div class="comparison-sort">
        <SearchableSelect
          v-model="sortBy"
          :options="sortSelectOptions"
          aria-label="排序"
          placeholder="选择排序"
        />
      </div>
    </header>

    <div v-if="loading" class="comparison-skeleton skeleton-block">正在加载结算单数据</div>
    <div v-else-if="!items.length" class="empty-state">
      <strong>当前没有结算单数据</strong>
      <span>请先导入销售数据，或调整销售日期范围。</span>
    </div>
    <div v-else class="simple-container-list">
      <article
        v-for="item in sortedItems"
        :key="item.merchantNo"
        class="simple-container-row"
      >
        <span class="simple-container-name">
          <strong>{{ settlementOptionLabel(item) }}</strong>
          <small>
            {{ periodLabel(item) }} · {{ settlementSeries(item) }}
            <template v-if="item.containerNo"> · 柜号 {{ item.containerNo }}</template>
          </small>
        </span>
        <span class="simple-metric"><small>销售金额</small><strong>{{ formatCurrency(item.salesAmount) }}</strong></span>
        <span class="simple-metric"><small>销量</small><strong>{{ formatNumber(item.salesQuantity) }}</strong></span>
        <span class="simple-metric"><small>每件均价</small><strong>{{ formatPrice(item.weightedAvgPrice) }}</strong></span>
        <div class="simple-grade-shares" aria-label="等级、等级均价与占比">
          <div v-for="grade in gradeOrder" :key="grade" class="simple-grade-cell">
            <strong>{{ gradeLabel(grade) }}</strong>
            <small>等级均价 {{ formatPrice(gradeOf(item, grade)?.weightedAvgPrice ?? null) }}</small>
            <small>占比 {{ formatPercent(gradeOf(item, grade)?.quantityShare ?? null) }}</small>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.comparison-heading { align-items: flex-end; }
.comparison-heading h2 { margin-bottom: 4px; }
.comparison-sort { width: min(220px, 100%); }
.comparison-sort :deep(input) {
  min-height: 3.06rem;
  padding: 0 2rem 0 .65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 1.05rem;
}
.comparison-sort :deep(input:focus) {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  outline: none;
}
.simple-container-list { display: grid; gap: 10px; }
.simple-container-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.2fr) repeat(3, minmax(110px, .75fr)) minmax(220px, 1.2fr);
  min-height: 76px;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  text-align: left;
}
.simple-container-row:hover { border-color: var(--primary); background: #f8faf8; }
.simple-container-row > * { min-width: 0; }
.simple-container-name,
.simple-metric { display: grid; gap: 4px; }
.simple-container-name strong { overflow-wrap: anywhere; font-size: 1rem; }
.simple-container-name small,
.simple-metric small { color: var(--muted); font-size: .85rem; }
.simple-metric strong { overflow-wrap: anywhere; font-size: .9rem; }
  .simple-grade-shares { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 6px; }
.simple-grade-cell { display: grid; gap: 4px; padding: 7px 6px; background: var(--surface-soft); text-align: center; }
.simple-grade-cell strong { font-size: .9rem; }
.simple-grade-cell small { color: var(--muted); font-size: .78rem; line-height: 1.25; }
@media (max-width: 1050px) {
  .simple-container-row { grid-template-columns: minmax(140px, 1fr) repeat(3, minmax(100px, .75fr)); }
  .simple-grade-shares { grid-column: 1 / -1; }
}

@media (max-width: 660px) {
  .comparison-heading { align-items: stretch; }
  .comparison-sort { width: 100%; }
  .comparison-sort :deep(input) {
    min-height: 38px;
    padding: 0 1.75rem 0 .45rem;
    font-size: .95rem;
  }
  .simple-container-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 14px; }
  .simple-container-name { grid-column: 1 / -1; }
  .simple-metric:nth-of-type(4) { grid-column: 1 / -1; }
  .simple-grade-shares { grid-column: 1 / -1; }
}

@media (max-width: 560px) {
  .simple-container-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 8px; min-height: 0; }
  .simple-metric:nth-of-type(4) { grid-column: auto; }
  .simple-container-name { gap: 1px; }
  .simple-container-name strong { font-size: .9rem; line-height: 1.25; }
  .simple-container-name small { font-size: .7rem; line-height: 1.25; }
  .simple-metric { gap: 2px; }
  .simple-metric strong { font-size: .78rem; }
  .simple-metric small { font-size: .68rem; }
  .simple-grade-shares { gap: 3px; }
  .simple-grade-cell { gap: 2px; padding: 3px 2px; }
  .simple-grade-cell strong { font-size: .7rem; }
  .simple-grade-cell small { font-size: .66rem; line-height: 1.2; }
}
</style>
