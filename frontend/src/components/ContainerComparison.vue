<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ContainerComparisonItem } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { initialComparisonSelection, toggleComparisonSelection, MAX_COMPARISON_CONTAINERS, MIN_COMPARISON_CONTAINERS } from '../utils/containerComparison'
import { metricMaximum, relativeBarWidth } from '../utils/comparisonChart'

const props = defineProps<{ items: ContainerComparisonItem[]; loading?: boolean }>()
const emit = defineEmits<{ select: [containerId: string] }>()
const selectedIds = ref<string[]>([])
const sortBy = ref<'salesAmount' | 'salesQuantity' | 'weightedAvgPrice'>('salesAmount')
watch(() => props.items, (items) => {
  const valid = new Set(items.map((item) => item.containerId))
  const retained = selectedIds.value.filter((id) => valid.has(id))
  selectedIds.value = retained.length >= MIN_COMPARISON_CONTAINERS ? retained.slice(0, MAX_COMPARISON_CONTAINERS) : initialComparisonSelection(items)
}, { immediate: true })
const selectedItems = computed(() => props.items.filter((item) => selectedIds.value.includes(item.containerId)))
const sortedItems = computed(() => [...selectedItems.value].sort((left, right) => (right[sortBy.value] ?? -1) - (left[sortBy.value] ?? -1)))
const selectionHint = computed(() => selectedIds.value.length < MIN_COMPARISON_CONTAINERS ? `请至少勾选 ${MIN_COMPARISON_CONTAINERS} 个货柜` : `已选择 ${selectedIds.value.length} 个货柜，最多 ${MAX_COMPARISON_CONTAINERS} 个`)
type MetricKey = 'salesQuantity' | 'salesAmount' | 'weightedAvgPrice'
const metricRows: Array<{ key: MetricKey; label: string }> = [
  { key: 'salesQuantity', label: '销量' }, { key: 'salesAmount', label: '销售额' }, { key: 'weightedAvgPrice', label: '加权均价' },
]
const metricMaximums = computed(() => Object.fromEntries(metricRows.map((row) => [row.key, metricMaximum(sortedItems.value.map((item) => item[row.key]))])) as Record<MetricKey, number>)
const gradeRows = computed(() => (['A', 'B', 'C'] as const).map((grade) => ({
  grade,
  label: gradeLabel(grade),
  items: sortedItems.value.map((item) => {
    const detail = item.grades.find((row) => row.grade === grade)
    return { item, quantity: detail?.salesQuantity ?? 0, share: detail?.quantityShare ?? null, contribution: item.gradeContribution?.[grade] ?? null }
  }),
})))
function toggle(id: string) { selectedIds.value = toggleComparisonSelection(selectedIds.value, id) }
function gradeValue(item: ContainerComparisonItem, grade: 'A' | 'B' | 'C') { return item.grades.find((row) => row.grade === grade) }
function metricValue(item: ContainerComparisonItem, key: MetricKey): number | null { return item[key] }
function metricLabel(value: number | null, key: MetricKey): string { return key === 'salesQuantity' ? formatNumber(value) : key === 'salesAmount' ? formatCurrency(value) : formatPrice(value) }
</script>

<template>
  <section class="dashboard-section comparison-section" aria-labelledby="comparison-title">
    <header class="section-heading comparison-heading"><div><p class="eyebrow">CONTAINER BENCHMARK</p><h2 id="comparison-title">货柜重点对比</h2><p class="section-note">勾选 2～3 个货柜，比较销售规模、等级结构与贡献率</p></div><label class="compact-field">排序<select v-model="sortBy"><option value="salesAmount">销售额</option><option value="salesQuantity">销量</option><option value="weightedAvgPrice">加权均价</option></select></label></header>
    <p class="selection-hint" :class="{ warning: selectedIds.length < MIN_COMPARISON_CONTAINERS }" aria-live="polite">{{ selectionHint }}</p>
    <div v-if="loading" class="comparison-skeleton skeleton-block">正在加载货柜对比</div>
    <div v-else-if="!items.length" class="empty-state"><strong>当前范围没有货柜数据</strong><span>导入销售数据或调整筛选范围后再查看。</span></div>
    <template v-else>
      <div class="container-picker" role="group" aria-label="选择要对比的货柜"><label v-for="item in items" :key="item.containerId" class="picker-option"><input type="checkbox" :checked="selectedIds.includes(item.containerId)" :disabled="!selectedIds.includes(item.containerId) && selectedIds.length >= MAX_COMPARISON_CONTAINERS" @change="toggle(item.containerId)"><span><strong>{{ item.containerName }}</strong><small>{{ item.containerId }} · 销售额 {{ formatCurrency(item.salesAmount) }}</small></span></label></div>
      <div v-if="selectedIds.length >= MIN_COMPARISON_CONTAINERS" class="comparison-grid" role="table" aria-label="选中货柜重点指标对比">
        <div class="comparison-grid-row comparison-grid-header" role="row"><span>指标</span><span v-for="item in sortedItems" :key="item.containerId" role="columnheader">{{ item.containerName }}</span></div>
        <div v-for="row in [{ label: '销量', key: 'salesQuantity' }, { label: '销售额', key: 'salesAmount' }, { label: '加权均价', key: 'weightedAvgPrice' }]" :key="row.key" class="comparison-grid-row" role="row"><strong>{{ row.label }}</strong><span v-for="item in sortedItems" :key="item.containerId">{{ row.key === 'salesQuantity' ? formatNumber(item.salesQuantity) : row.key === 'salesAmount' ? formatCurrency(item.salesAmount) : formatPrice(item.weightedAvgPrice) }}</span></div>
        <div v-for="grade in (['A','B','C'] as const)" :key="grade" class="comparison-grid-row" role="row"><strong>{{ gradeLabel(grade) }}销量</strong><span v-for="item in sortedItems" :key="item.containerId">{{ formatNumber(gradeValue(item, grade)?.salesQuantity ?? 0) }}<small> · {{ formatPercent(gradeValue(item, grade)?.quantityShare) }}</small></span></div>
        <div v-for="grade in (['A','B','C'] as const)" :key="`${grade}-contribution`" class="comparison-grid-row contribution-row" role="row"><strong>{{ gradeLabel(grade) }}贡献率</strong><span v-for="item in sortedItems" :key="item.containerId">{{ formatPercent(item.gradeContribution?.[grade]) }}</span></div>
        <div class="comparison-grid-row" role="row"><strong>整体占比</strong><span v-for="item in sortedItems" :key="item.containerId">销量 {{ formatPercent(item.salesQuantityShare) }}<small> · 销售额 {{ formatPercent(item.salesAmountShare) }}</small></span></div>
      </div>
      <div v-if="selectedIds.length >= MIN_COMPARISON_CONTAINERS" class="comparison-charts">
        <section class="chart-card" aria-labelledby="metric-chart-title">
          <header class="chart-card-head"><div><p class="eyebrow">SCALE CHECK</p><h3 id="metric-chart-title">核心指标横向条形图</h3></div><span>各指标按当前最大值归一</span></header>
          <div class="metric-bars">
            <div v-for="row in metricRows" :key="row.key" class="metric-group">
              <div class="metric-group-label"><strong>{{ row.label }}</strong><small>{{ row.key === 'salesAmount' ? '元' : row.key === 'salesQuantity' ? '件' : '元/件' }}</small></div>
              <div v-for="item in sortedItems" :key="`${row.key}-${item.containerId}`" class="metric-lane">
                <span class="lane-name">{{ item.containerName }}</span><span class="bar-track"><i :style="{ width: `${relativeBarWidth(metricValue(item, row.key), metricMaximums[row.key])}%` }" /></span><strong>{{ metricLabel(metricValue(item, row.key), row.key) }}</strong>
              </div>
            </div>
          </div>
        </section>
        <section class="chart-card" aria-labelledby="grade-chart-title">
          <header class="chart-card-head"><div><p class="eyebrow">GRADE MIX</p><h3 id="grade-chart-title">等级结构与贡献率</h3></div><span>占比越高，条带越长</span></header>
          <div class="grade-bars">
            <div v-for="row in gradeRows" :key="row.grade" class="grade-chart-row"><div class="grade-chart-label"><span class="grade-badge" :class="`grade-${row.grade.toLowerCase()}`">{{ row.grade }}</span><strong>{{ row.label }}</strong></div><div v-for="entry in row.items" :key="entry.item.containerId" class="grade-lane"><span class="lane-name">{{ entry.item.containerName }}</span><div><small>销量占比 {{ formatPercent(entry.share) }}</small><span class="bar-track"><i :class="`fill-${row.grade.toLowerCase()}`" :style="{ width: `${relativeBarWidth(entry.share, 1)}%` }" /></span><small>贡献率 {{ formatPercent(entry.contribution) }}</small><span class="bar-track contribution-track"><i :class="`fill-${row.grade.toLowerCase()}`" :style="{ width: `${relativeBarWidth(entry.contribution, 1)}%` }" /></span></div></div></div>
          </div>
        </section>
      </div>
      <p v-else class="comparison-empty-hint">勾选至少两个货柜后，展示横向指标与等级贡献率。</p>
      <div class="comparison-actions"><button v-for="item in sortedItems" :key="item.containerId" type="button" class="secondary-button compact-button" @click="emit('select', item.containerId)">查看 {{ item.containerName }} 单柜诊断</button></div>
    </template>
  </section>
</template>

<style scoped>
.comparison-heading { align-items: flex-start; }.comparison-heading h2 { margin-bottom: 4px; }.selection-hint { margin: -8px 0 10px; color: var(--muted); font-size: .72rem; }.selection-hint.warning { color: var(--danger); }.container-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin-bottom: 12px; }.picker-option { display: flex; min-height: 52px; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }.picker-option:has(input:checked) { border-color: var(--primary); background: var(--primary-soft); }.picker-option input { width: 18px; height: 18px; accent-color: var(--primary); }.picker-option span { display: grid; min-width: 0; gap: 2px; }.picker-option strong { overflow-wrap: anywhere; font-size: .78rem; }.picker-option small { color: var(--muted); font-size: .64rem; }.comparison-grid { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); }.comparison-grid-row { display: grid; grid-template-columns: 120px repeat(3, minmax(150px, 1fr)); min-width: 430px; align-items: center; gap: 10px; min-height: 48px; padding: 8px 10px; border-top: 1px solid var(--line); }.comparison-grid-row:first-child { border-top: 0; }.comparison-grid-row > span { color: var(--ink); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .76rem; font-variant-numeric: tabular-nums; }.comparison-grid-row > span:not(:first-child) { text-align: right; }.comparison-grid-header { background: var(--surface-soft); color: var(--muted); }.comparison-grid-header span { color: var(--muted); font-family: inherit; font-weight: 700; }.comparison-grid-row strong { font-size: .75rem; }.comparison-grid-row small { color: var(--muted); font-family: inherit; font-size: .64rem; }.contribution-row { background: color-mix(in srgb, var(--primary-soft) 35%, var(--surface)); }.comparison-empty-hint { padding: 16px; border: 1px dashed var(--line-strong); color: var(--muted); text-align: center; font-size: .76rem; }.comparison-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }.compact-button { min-height: 44px; font-size: .72rem; }
.comparison-charts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .9fr); gap: 10px; margin-top: 12px; }.chart-card { min-width: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-soft); }.chart-card-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 10px; }.chart-card-head h3 { margin: 0; font-size: .86rem; }.chart-card-head span { color: var(--muted); font-size: .62rem; }.metric-bars, .grade-bars { display: grid; gap: 11px; }.metric-group { display: grid; gap: 5px; }.metric-group-label { display: flex; align-items: baseline; justify-content: space-between; }.metric-group-label strong { font-size: .72rem; }.metric-group-label small { color: var(--muted); font-size: .6rem; }.metric-lane { display: grid; grid-template-columns: 86px minmax(0, 1fr) auto; align-items: center; gap: 7px; }.lane-name { overflow: hidden; color: var(--muted); font-size: .62rem; text-overflow: ellipsis; white-space: nowrap; }.metric-lane > strong { min-width: 68px; color: var(--ink); font-family: Bahnschrift, 'Microsoft YaHei', sans-serif; font-size: .68rem; text-align: right; }.bar-track { display: block; height: 8px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--line) 68%, var(--surface)); }.bar-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--primary); }.grade-chart-row { display: grid; gap: 6px; }.grade-chart-label { display: flex; align-items: center; gap: 7px; }.grade-chart-label .grade-badge { width: 24px; height: 24px; flex-basis: 24px; font-size: .68rem; }.grade-chart-label strong { font-size: .72rem; }.grade-lane { display: grid; grid-template-columns: 74px minmax(0, 1fr); align-items: center; gap: 7px; }.grade-lane > div { display: grid; grid-template-columns: 72px minmax(0, 1fr) 72px; align-items: center; gap: 6px; }.grade-lane small { color: var(--muted); font-size: .58rem; white-space: nowrap; }.grade-lane .bar-track { height: 7px; }.grade-lane .bar-track i { background: var(--grade-a); }.grade-lane .bar-track i.fill-b { background: var(--grade-b); }.grade-lane .bar-track i.fill-c { background: var(--grade-c); }.contribution-track { opacity: .58; }
@media (max-width: 900px) { .comparison-charts { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .comparison-heading { display: grid; gap: 10px; }.comparison-heading .compact-field { width: 100%; grid-template-columns: auto 1fr; }.container-picker { grid-template-columns: 1fr; }.comparison-grid-row { grid-template-columns: 112px repeat(3, minmax(138px, 1fr)); }.comparison-actions { display: grid; grid-template-columns: 1fr; }.chart-card { padding: 10px; }.chart-card-head { align-items: flex-start; flex-direction: column; gap: 3px; }.metric-lane { grid-template-columns: 72px minmax(0, 1fr) auto; }.metric-lane > strong { min-width: 58px; font-size: .64rem; }.grade-lane { grid-template-columns: 66px minmax(0, 1fr); }.grade-lane > div { grid-template-columns: 68px minmax(0, 1fr) 68px; gap: 4px; }.grade-lane small { font-size: .54rem; } }
</style>
