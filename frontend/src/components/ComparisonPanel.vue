<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel, type GradeMetric, type MetricTotal } from '../api/client'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const gradeOrder = ['A', 'B', 'C'] as const
const metricColumns = [
  { key: 'quantity', label: '销量' },
  { key: 'share', label: '销量占比' },
  { key: 'price', label: '加权均价' },
] as const
type MetricKey = (typeof metricColumns)[number]['key']
type Snapshot = Pick<GradeMetric, 'salesQuantity' | 'quantityShare' | 'weightedAvgPrice'>
type ComparisonRow = { grade: GradeMetric['grade']; global: Snapshot | null; selected: Snapshot | null }

const props = defineProps<{
  globalGrades?: GradeMetric[]
  globalTotal?: MetricTotal | null
  selectedGrades?: GradeMetric[] | null
  selectedTotal?: MetricTotal | null
}>()

const rows = computed<ComparisonRow[]>(() => {
  const global = new Map((props.globalGrades ?? []).map((item) => [item.grade, item]))
  const selected = new Map((props.selectedGrades ?? []).map((item) => [item.grade, item]))
  return gradeOrder.map((grade) => ({ grade, global: global.get(grade) ?? null, selected: selected.get(grade) ?? null }))
})
const hasData = computed(() => Boolean(props.globalGrades?.length || props.selectedGrades?.length))
const hasSelected = computed(() => Boolean(props.selectedTotal || props.selectedGrades?.length))
const globalTotalValue = computed<MetricTotal>(() => props.globalTotal ?? {
  salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null,
})

function metricValue(row: ComparisonRow, key: MetricKey, side: 'global' | 'selected'): string {
  const metric = row[side]
  if (!metric) return '—'
  if (key === 'quantity') return formatNumber(metric.salesQuantity)
  if (key === 'share') return formatPercent(metric.quantityShare)
  return formatPrice(metric.weightedAvgPrice)
}

function signedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`
}

function signedShare(value: number | null): string {
  if (value === null) return '暂无数据'
  return `${formatPercent(value).replace('%', '')} 个百分点`
}

function signedPrice(value: number | null): string {
  if (value === null) return '暂无数据'
  return `${value > 0 ? '+' : ''}${formatPrice(value)}`
}

function metricDelta(row: ComparisonRow, key: MetricKey): string {
  if (!row.global || !row.selected) return '待选择'
  if (key === 'quantity') return signedNumber(row.selected.salesQuantity - row.global.salesQuantity)
  if (key === 'share') {
    if (row.global.quantityShare === null || row.selected.quantityShare === null) return '暂无数据'
    return signedShare(row.selected.quantityShare - row.global.quantityShare)
  }
  if (row.global.weightedAvgPrice === null || row.selected.weightedAvgPrice === null) return '暂无数据'
  return signedPrice(row.selected.weightedAvgPrice - row.global.weightedAvgPrice)
}

function signedCurrency(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`
}

function deltaClass(value: string): string {
  if (value === '待选择' || value === '暂无数据') return 'is-neutral'
  return value.startsWith('-') ? 'is-negative' : value.startsWith('+') ? 'is-positive' : 'is-neutral'
}
</script>

<template>
  <section class="comparison-panel" aria-labelledby="comparison-panel-title">
    <header class="comparison-panel__heading">
      <div><p class="comparison-panel__eyebrow">DATA COMPARE</p><h2 id="comparison-panel-title">全局与单柜数据对比</h2></div>
      <p class="comparison-panel__note">{{ hasSelected ? '单柜指标相对当前筛选范围的差值' : '选择单柜后查看相对全局差值' }}</p>
    </header>

    <div v-if="!hasData" class="comparison-panel__empty" role="status">
      <strong>暂无可对比数据</strong><span>导入销售数据或调整筛选范围后再查看等级表现。</span>
    </div>

    <template v-else>
      <div class="comparison-panel__totals" aria-label="总量对比">
        <div><span>全局销量</span><strong>{{ formatNumber(globalTotalValue.salesQuantity) }}</strong></div>
        <div><span>单柜销量</span><strong>{{ hasSelected && selectedTotal ? formatNumber(selectedTotal.salesQuantity) : '—' }}</strong></div>
        <div>
          <span>销量差值</span>
          <strong :class="deltaClass(hasSelected && selectedTotal ? signedNumber(selectedTotal.salesQuantity - globalTotalValue.salesQuantity) : '待选择')">{{ hasSelected && selectedTotal ? signedNumber(selectedTotal.salesQuantity - globalTotalValue.salesQuantity) : '待选择' }}</strong>
        </div>
        <div>
          <span>销售额差值</span>
          <strong :class="deltaClass(hasSelected && selectedTotal ? signedCurrency(selectedTotal.salesAmount - globalTotalValue.salesAmount) : '待选择')">{{ hasSelected && selectedTotal ? signedCurrency(selectedTotal.salesAmount - globalTotalValue.salesAmount) : '待选择' }}</strong>
        </div>
      </div>

      <div class="comparison-panel__legend" aria-hidden="true">
        <span><i class="legend-dot legend-dot--global" />全局基线</span><span><i class="legend-dot legend-dot--selected" />当前单柜</span><span><i class="legend-dot legend-dot--delta" />相对差值</span>
      </div>

      <div class="comparison-panel__rows" role="table" aria-label="A/B/C 等级销售数据对比">
        <div class="comparison-panel__row comparison-panel__row--header" role="row"><span role="columnheader">等级</span><span v-for="metric in metricColumns" :key="metric.key" role="columnheader">{{ metric.label }}</span></div>
        <div v-for="row in rows" :key="row.grade" class="comparison-panel__row" :class="`grade-${row.grade.toLowerCase()}`" role="row">
          <div class="comparison-panel__grade" role="cell"><span class="comparison-panel__badge">{{ row.grade }}</span><strong>{{ gradeLabel(row.grade) }}</strong></div>
          <div v-for="metric in metricColumns" :key="metric.key" class="comparison-panel__metric" role="cell">
            <span class="comparison-panel__metric-label">全局 / 单柜</span>
            <strong>{{ metricValue(row, metric.key, 'global') }} <b>→</b> {{ metricValue(row, metric.key, 'selected') }}</strong>
            <small :class="deltaClass(metricDelta(row, metric.key))">{{ metricDelta(row, metric.key) }}</small>
          </div>
        </div>
      </div>
      <p v-if="!hasSelected" class="comparison-panel__hint">当前仅展示全局基线；从货柜对比列表进入单柜诊断后，将自动补充单柜数据。</p>
    </template>
  </section>
</template>

<style scoped>
.comparison-panel { min-width: 0; padding-top: 20px; border-top: 2px solid var(--ink); }
.comparison-panel__heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.comparison-panel__eyebrow { margin: 0 0 3px; color: var(--primary); font-family: Bahnschrift, sans-serif; font-size: .68rem; font-weight: 700; letter-spacing: .1em; }
.comparison-panel h2 { margin: 0; font-size: 1.08rem; line-height: 1.35; }
.comparison-panel__note, .comparison-panel__hint { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.5; }
.comparison-panel__empty { display: flex; min-height: 150px; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px dashed var(--line-strong); color: var(--muted); text-align: center; font-size: .76rem; }
.comparison-panel__empty strong { color: var(--ink); font-size: .82rem; }
.comparison-panel__totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.comparison-panel__totals > div { display: grid; gap: 4px; min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); }
.comparison-panel__totals > div:last-child { border-right: 0; }
.comparison-panel__totals span { color: var(--muted); font-size: .67rem; }
.comparison-panel__totals strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .9rem; font-variant-numeric: tabular-nums; }
.comparison-panel__legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-bottom: 8px; color: var(--muted); font-size: .66rem; }
.comparison-panel__legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; }.legend-dot--global { background: var(--ink); }.legend-dot--selected { background: var(--primary); }.legend-dot--delta { background: var(--warning); }
.comparison-panel__rows { overflow-x: auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.comparison-panel__row { display: grid; grid-template-columns: minmax(110px, .8fr) repeat(3, minmax(170px, 1fr)); align-items: center; min-width: 640px; min-height: 68px; gap: 12px; padding: 9px 10px; border-top: 1px solid var(--line); background: var(--surface); }
.comparison-panel__row--header { min-height: 34px; border-top: 0; background: var(--surface-soft); color: var(--muted); font-size: .65rem; font-weight: 700; }.comparison-panel__row--header span:not(:first-child) { text-align: right; }
.comparison-panel__row.grade-a { --grade-color: var(--grade-a); }.comparison-panel__row.grade-b { --grade-color: var(--grade-b); }.comparison-panel__row.grade-c { --grade-color: var(--grade-c); }
.comparison-panel__grade { display: flex; align-items: center; gap: 8px; min-width: 0; }.comparison-panel__grade strong { overflow-wrap: anywhere; font-size: .78rem; }
.comparison-panel__badge { display: inline-flex; width: 29px; height: 29px; flex: 0 0 29px; align-items: center; justify-content: center; border: 1px solid color-mix(in srgb, var(--grade-color, var(--line)) 50%, white); border-radius: 50%; background: color-mix(in srgb, var(--grade-color, var(--line)) 12%, white); color: var(--grade-color, var(--ink)); font-family: Bahnschrift, sans-serif; font-size: .8rem; font-weight: 800; }
.comparison-panel__metric { display: grid; justify-items: end; gap: 2px; min-width: 0; }.comparison-panel__metric-label { color: var(--muted); font-size: .6rem; }.comparison-panel__metric strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .75rem; font-variant-numeric: tabular-nums; text-align: right; }.comparison-panel__metric strong b { padding: 0 3px; color: var(--muted); font-weight: 400; }.comparison-panel__metric small { font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .65rem; font-variant-numeric: tabular-nums; }
.is-positive { color: var(--primary-dark); }.is-negative { color: var(--danger); }.is-neutral { color: var(--muted); }.comparison-panel__hint { margin-top: 9px; }
@media (max-width: 720px) { .comparison-panel__heading { align-items: flex-start; flex-direction: column; gap: 6px; }.comparison-panel__totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }.comparison-panel__totals > div:nth-child(2) { border-right: 0; }.comparison-panel__totals > div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }.comparison-panel__legend { justify-content: flex-start; } }
@media (max-width: 430px) { .comparison-panel__totals > div { padding: 9px 10px; }.comparison-panel__totals strong { font-size: .82rem; } }
</style>
