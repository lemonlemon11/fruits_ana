<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel, type Grade, type GradeMetric, type MetricTotal } from '../api/client'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const gradeOrder: Grade[] = ['A', 'B', 'C']
type ContributionRow = {
  grade: Grade
  global: GradeMetric | null
  selected: GradeMetric | null
}

const props = defineProps<{
  /** 当前筛选范围的等级汇总，作为结构与贡献的统一口径。 */
  globalGrades?: GradeMetric[]
  globalTotal?: MetricTotal | null
  /** 可选：单柜诊断页传入的当前货柜等级汇总。 */
  selectedGrades?: GradeMetric[] | null
  selectedTotal?: MetricTotal | null
}>()

const globalTotalValue = computed<MetricTotal>(() => props.globalTotal ?? {
  salesQuantity: 0,
  salesAmount: 0,
  weightedAvgPrice: null,
})

const rows = computed<ContributionRow[]>(() => {
  const global = new Map((props.globalGrades ?? []).map((item) => [item.grade, item]))
  const selected = new Map((props.selectedGrades ?? []).map((item) => [item.grade, item]))
  return gradeOrder.map((grade) => ({
    grade,
    global: global.get(grade) ?? null,
    selected: selected.get(grade) ?? null,
  }))
})

const hasData = computed(() => Boolean(props.globalGrades?.length || props.selectedGrades?.length))
const hasSelected = computed(() => Boolean(props.selectedTotal || props.selectedGrades?.length))

function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null
}

function globalAmountShare(row: ContributionRow): number | null {
  return row.global ? ratio(row.global.salesAmount, globalTotalValue.value.salesAmount) : null
}

function contributionQuantity(row: ContributionRow): number | null {
  if (!row.selected || !row.global) return null
  return ratio(row.selected.salesQuantity, row.global.salesQuantity)
}

function contributionAmount(row: ContributionRow): number | null {
  if (!row.selected || !row.global) return null
  return ratio(row.selected.salesAmount, row.global.salesAmount)
}

function totalContribution(part: number, total: number): number | null {
  return hasSelected.value ? ratio(part, total) : null
}
</script>

<template>
  <section class="comparison-panel" aria-labelledby="comparison-panel-title">
    <header class="comparison-panel__heading">
      <div>
        <p class="comparison-panel__eyebrow">GRADE CONTRIBUTION</p>
        <h2 id="comparison-panel-title">货柜横向表现与等级贡献</h2>
      </div>
      <p class="comparison-panel__note">等级贡献结构概览 · 货柜横向排名待接入货柜清单</p>
    </header>

    <div v-if="!hasData" class="comparison-panel__empty" role="status">
      <strong>暂无等级贡献数据</strong>
      <span>导入销售数据或调整筛选范围后再查看结构。</span>
    </div>

    <template v-else>
      <div class="comparison-panel__totals" aria-label="筛选范围与当前单柜贡献">
        <div>
          <span>筛选范围销量</span>
          <strong>{{ formatNumber(globalTotalValue.salesQuantity) }}</strong>
          <small>{{ formatCurrency(globalTotalValue.salesAmount) }}</small>
        </div>
        <div>
          <span>筛选范围均价</span>
          <strong>{{ formatPrice(globalTotalValue.weightedAvgPrice) }}</strong>
          <small>整体销售额口径</small>
        </div>
        <div v-if="hasSelected && selectedTotal">
          <span>当前单柜销量</span>
          <strong>{{ formatNumber(selectedTotal.salesQuantity) }}</strong>
          <small>占整体 {{ formatPercent(totalContribution(selectedTotal.salesQuantity, globalTotalValue.salesQuantity)) }}</small>
        </div>
        <div v-if="hasSelected && selectedTotal">
          <span>当前单柜销售额</span>
          <strong>{{ formatCurrency(selectedTotal.salesAmount) }}</strong>
          <small>占整体 {{ formatPercent(totalContribution(selectedTotal.salesAmount, globalTotalValue.salesAmount)) }}</small>
        </div>
        <div v-else class="comparison-panel__total-placeholder">
          <span>单柜贡献</span>
          <strong>选择货柜后查看</strong>
          <small>进入单柜诊断即可补充</small>
        </div>
      </div>

      <div class="comparison-panel__pending" role="note">
        <span class="comparison-panel__pending-mark" aria-hidden="true">↗</span>
        <div>
          <strong>货柜横向排名待接入</strong>
          <p>当前组件未接收货柜明细，因此只展示 A/B/C 等级贡献，不虚构货柜排名。</p>
        </div>
      </div>

      <div class="comparison-panel__rows" role="table" aria-label="A、B、C 等级贡献结构">
        <div class="comparison-panel__row comparison-panel__row--header" role="row">
          <span role="columnheader">等级</span>
          <span role="columnheader">整体销量 / 占比</span>
          <span role="columnheader">销售额贡献 / 占比</span>
          <span role="columnheader">加权均价</span>
          <span role="columnheader">当前单柜贡献</span>
        </div>
        <div
          v-for="row in rows"
          :key="row.grade"
          class="comparison-panel__row"
          :class="`grade-${row.grade.toLowerCase()}`"
          role="row"
        >
          <div class="comparison-panel__grade" role="cell">
            <span class="comparison-panel__badge">{{ row.grade }}</span>
            <strong>{{ gradeLabel(row.grade) }}</strong>
          </div>
          <div class="comparison-panel__metric" role="cell">
            <strong>{{ row.global ? formatNumber(row.global.salesQuantity) : '—' }}</strong>
            <small>{{ formatPercent(row.global?.quantityShare ?? null) }}</small>
          </div>
          <div class="comparison-panel__metric" role="cell">
            <strong>{{ row.global ? formatCurrency(row.global.salesAmount) : '—' }}</strong>
            <small>{{ formatPercent(globalAmountShare(row)) }}</small>
          </div>
          <div class="comparison-panel__metric" role="cell">
            <strong>{{ formatPrice(row.global?.weightedAvgPrice ?? null) }}</strong>
            <small>整体等级均价</small>
          </div>
          <div class="comparison-panel__metric comparison-panel__metric--selected" role="cell">
            <template v-if="hasSelected && row.selected">
              <strong>{{ formatNumber(row.selected.salesQuantity) }} · {{ formatCurrency(row.selected.salesAmount) }}</strong>
              <small>占整体销量 {{ formatPercent(contributionQuantity(row)) }} · 销售额 {{ formatPercent(contributionAmount(row)) }}</small>
            </template>
            <template v-else-if="hasSelected">
              <strong>—</strong>
              <small>当前单柜暂无该等级数据</small>
            </template>
            <template v-else>
              <strong>—</strong>
              <small>选择货柜后查看</small>
            </template>
          </div>
        </div>
      </div>
      <p class="comparison-panel__hint">贡献占比 = 当前单柜该等级 ÷ 筛选范围该等级；用于判断单柜对整体等级销量与销售额的贡献。</p>
    </template>
  </section>
</template>

<style scoped>
.comparison-panel { min-width: 0; padding-top: 18px; border-top: 2px solid var(--ink); }
.comparison-panel__heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.comparison-panel__eyebrow { margin: 0 0 3px; color: var(--primary); font-family: Bahnschrift, sans-serif; font-size: .66rem; font-weight: 700; letter-spacing: .1em; }
.comparison-panel h2 { margin: 0; font-size: 1.05rem; line-height: 1.35; }
.comparison-panel__note, .comparison-panel__hint { margin: 0; color: var(--muted); font-size: .7rem; line-height: 1.45; }
.comparison-panel__empty { display: flex; min-height: 148px; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px dashed var(--line-strong); color: var(--muted); text-align: center; font-size: .75rem; }
.comparison-panel__empty strong { color: var(--ink); font-size: .82rem; }
.comparison-panel__totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.comparison-panel__totals > div { display: grid; gap: 3px; min-width: 0; padding: 9px 11px; border-right: 1px solid var(--line); }
.comparison-panel__totals > div:last-child { border-right: 0; }
.comparison-panel__totals span { color: var(--muted); font-size: .64rem; }
.comparison-panel__totals strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .84rem; font-variant-numeric: tabular-nums; }
.comparison-panel__totals small { color: var(--muted); font-size: .62rem; }
.comparison-panel__total-placeholder strong { color: var(--muted); font-family: inherit; font-size: .72rem; }
.comparison-panel__pending { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 9px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--warning) 35%, var(--line)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--warning) 7%, var(--surface)); }
.comparison-panel__pending-mark { display: grid; width: 18px; height: 18px; flex: 0 0 18px; place-items: center; border-radius: 50%; background: var(--warning); color: white; font-size: .72rem; font-weight: 800; }
.comparison-panel__pending strong { color: var(--ink); font-size: .72rem; }
.comparison-panel__pending p { margin: 2px 0 0; color: var(--muted); font-size: .66rem; line-height: 1.4; }
.comparison-panel__rows { overflow-x: auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.comparison-panel__row { display: grid; grid-template-columns: minmax(108px, .82fr) repeat(4, minmax(128px, 1fr)); align-items: center; min-width: 760px; min-height: 62px; gap: 10px; padding: 8px 9px; border-top: 1px solid var(--line); background: var(--surface); }
.comparison-panel__row--header { min-height: 34px; border-top: 0; background: var(--surface-soft); color: var(--muted); font-size: .62rem; font-weight: 700; }
.comparison-panel__row--header span:not(:first-child) { text-align: right; }
.comparison-panel__row.grade-a { --grade-color: var(--grade-a); }.comparison-panel__row.grade-b { --grade-color: var(--grade-b); }.comparison-panel__row.grade-c { --grade-color: var(--grade-c); }
.comparison-panel__grade { display: flex; align-items: center; gap: 8px; min-width: 0; }.comparison-panel__grade strong { overflow-wrap: anywhere; font-size: .76rem; }
.comparison-panel__badge { display: inline-flex; width: 28px; height: 28px; flex: 0 0 28px; align-items: center; justify-content: center; border: 1px solid color-mix(in srgb, var(--grade-color, var(--line)) 50%, white); border-radius: 50%; background: color-mix(in srgb, var(--grade-color, var(--line)) 12%, white); color: var(--grade-color, var(--ink)); font-family: Bahnschrift, sans-serif; font-size: .78rem; font-weight: 800; }
.comparison-panel__metric { display: grid; justify-items: end; gap: 2px; min-width: 0; text-align: right; }.comparison-panel__metric strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .72rem; font-variant-numeric: tabular-nums; }.comparison-panel__metric small { overflow-wrap: anywhere; color: var(--muted); font-size: .62rem; line-height: 1.35; }
.comparison-panel__metric--selected { padding-left: 6px; border-left: 1px solid var(--line); }.comparison-panel__metric--selected strong { color: var(--primary-dark); }
.comparison-panel__hint { margin-top: 8px; }
@media (max-width: 720px) { .comparison-panel__heading { align-items: flex-start; flex-direction: column; gap: 5px; }.comparison-panel__totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }.comparison-panel__totals > div:nth-child(2) { border-right: 0; }.comparison-panel__totals > div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }.comparison-panel__pending { margin-bottom: 8px; } }
@media (max-width: 430px) { .comparison-panel__totals > div { padding: 8px 9px; }.comparison-panel__totals strong { font-size: .79rem; } }
</style>
