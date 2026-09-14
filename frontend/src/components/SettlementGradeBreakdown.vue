<script setup lang="ts">
import { computed } from 'vue'

import type { Grade, GradeMetric, SettlementRecord } from '../api/client'
import { gradeLabel } from '../api/client'
import { activeGrades, gradeColors } from '../utils/grades'
import GradePieChart from './GradePieChart.vue'
import ChartTooltip from './ChartTooltip.vue'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatNumber, formatPercent, formatPrice } from '../utils/format'

const props = defineProps<{
  grades: GradeMetric[]
  records: SettlementRecord[]
  loading?: boolean
  gradeOrder?: Grade[]
}>()

const priceGradeOrder = computed(() => props.gradeOrder ?? activeGrades(props.grades))
const specGradeOrder = computed(() => props.gradeOrder ?? activeGrades(props.records))

const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()

type GradeRow = {
  grade: Grade
  quantity: number
  price: number | null
  share: number | null
}

const gradeRows = computed<GradeRow[]>(() =>
  priceGradeOrder.value.map((grade) => {
    const source = props.grades.find((item) => item.grade === grade)
    return {
      grade,
      quantity: source?.salesQuantity ?? 0,
      price: source?.weightedAvgPrice ?? null,
      share: source?.quantityShare ?? null,
    }
  }),
)

const priceMax = computed(() =>
  Math.max(0, ...gradeRows.value.map((row) => row.price ?? 0)),
)

function barHeight(value: number | null): string {
  if (!priceMax.value || value === null || value <= 0) return '0%'
  return `${Math.max((value / priceMax.value) * 100, 3)}%`
}

type SpecRow = {
  grade: Grade
  spec: string
  quantity: number
}

const specRows = computed<SpecRow[]>(() => {
  const grouped = new Map<string, SpecRow>()
  props.records.forEach((record) => {
    const grade = record.grade
    if (!grade || !specGradeOrder.value.includes(grade)) return
    const spec = record.specRaw?.trim() || '未标注规格'
    const key = `${grade}::${spec}`
    const current = grouped.get(key)
    if (current) {
      current.quantity += record.quantity
      return
    }
    grouped.set(key, { grade, spec, quantity: record.quantity })
  })
  return [...grouped.values()].sort((left, right) => {
    if (left.grade !== right.grade) return specGradeOrder.value.indexOf(left.grade) - specGradeOrder.value.indexOf(right.grade)
    return left.spec.localeCompare(right.spec, 'zh-Hans-CN', { numeric: true })
  })
})

const specMax = computed(() =>
  Math.max(0, ...specRows.value.map((row) => row.quantity)),
)

function specBarWidth(quantity: number): string {
  if (!specMax.value) return '0%'
  return `${Math.max((quantity / specMax.value) * 100, 2)}%`
}

function showSpecTooltip(event: MouseEvent, row: SpecRow) {
  showTooltip(event, {
    title: `${gradeLabel(row.grade)} · ${row.spec}`,
    rows: [
      { label: '件数', value: `${formatNumber(row.quantity)} 件`, color: gradeColors[row.grade] },
      {
        label: '占本等级件数',
        value: formatPercent(
          specRows.value
            .filter((item) => item.grade === row.grade)
            .reduce((total, item) => total + item.quantity, 0)
            ? row.quantity /
                specRows.value
                  .filter((item) => item.grade === row.grade)
                  .reduce((total, item) => total + item.quantity, 0)
            : null,
        ),
      },
    ],
    note: '规格为空时归入「未标注规格」',
  })
}
</script>

<template>
  <section class="dashboard-section settlement-grade-breakdown" aria-labelledby="settlement-grade-breakdown-title">
    <header class="section-heading">
      <div>
        <h2 id="settlement-grade-breakdown-title">等级图表</h2>
        <p class="section-note">饼图看件数结构，柱状图看各等级均价，横向柱图看不同规格的件数分布</p>
      </div>
    </header>

    <div v-if="loading" class="breakdown-skeleton skeleton-block">正在加载等级图表</div>
    <template v-else>
      <div class="breakdown-grid">
        <div class="chart-block pie-chart-block">
          <GradePieChart :grades="grades" :loading="false" :grade-order="priceGradeOrder" />
        </div>

        <section class="chart-block price-chart-block" aria-labelledby="grade-price-bar-title">
          <header class="block-heading">
            <h3 id="grade-price-bar-title">各等级平均每公斤售价</h3>
            <span>单位：元/公斤</span>
          </header>
          <div class="price-columns">
            <div v-for="row in gradeRows" :key="row.grade" class="price-column">
              <div class="price-bar-area">
                <div
                  class="price-bar"
                  :style="{ height: barHeight(row.price), backgroundColor: gradeColors[row.grade] }"
                  :title="`${gradeLabel(row.grade)} ${formatPrice(row.price)}/公斤`"
                ></div>
              </div>
              <strong>{{ formatPrice(row.price) }}</strong>
              <span>{{ gradeLabel(row.grade) }}</span>
            </div>
          </div>
        </section>

        <section class="chart-block spec-block" aria-labelledby="grade-spec-title">
          <header class="block-heading">
            <div>
              <h3 id="grade-spec-title">各等级各规格件数</h3>
              <p>条越长代表该规格件数越多，颜色对应等级</p>
            </div>
          </header>
          <div v-if="!specRows.length" class="empty-inline">当前结算单没有可统计的规格数据</div>
          <div v-else class="spec-list">
            <div
              v-for="row in specRows"
              :key="`${row.grade}-${row.spec}`"
              class="spec-row"
              @mouseenter="showSpecTooltip($event, row)"
              @mousemove="moveTooltip"
              @mouseleave="hideTooltip"
            >
              <span class="spec-grade" :style="{ color: gradeColors[row.grade] }">{{ gradeLabel(row.grade) }}</span>
              <span class="spec-label">{{ row.spec }}</span>
              <div class="spec-track">
                <div
                  class="spec-bar"
                  :style="{ width: specBarWidth(row.quantity), backgroundColor: gradeColors[row.grade] }"
                  :aria-label="`${gradeLabel(row.grade)} ${row.spec} ${formatNumber(row.quantity)} 件`"
                ></div>
              </div>
              <strong class="spec-qty">{{ formatNumber(row.quantity) }} 件</strong>
            </div>
          </div>
        </section>
      </div>
    </template>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.settlement-grade-breakdown { gap: 14px; }
.breakdown-skeleton { min-height: 180px; }
.breakdown-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: stretch; }
.chart-block { display: flex; min-width: 0; flex-direction: column; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.block-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.block-heading h3 { margin: 0; font-size: 1rem; }
.block-heading span,
.block-heading p { margin: 0; color: var(--muted); font-size: .82rem; }
.price-columns { display: grid; flex: 1; align-content: center; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 12px; align-items: end; min-height: 190px; }
.price-column { display: grid; justify-items: center; gap: 6px; min-width: 0; }
.price-bar-area { display: flex; width: 100%; height: 130px; align-items: flex-end; justify-content: center; }
.price-bar { width: min(52px, 62%); border-radius: 5px 5px 0 0; transition: height 260ms ease; }
.price-column strong { font-size: .9rem; font-variant-numeric: tabular-nums; }
.price-column span { color: var(--muted); font-size: .8rem; font-weight: 800; }
.pie-chart-block :deep(.grade-pie-section) { display: flex; flex: 1; flex-direction: column; padding: 0; border-top: 0; }
.pie-chart-block :deep(.section-heading) { margin-bottom: 10px; }
.pie-chart-block :deep(.section-heading h2) { margin: 0; font-size: 1rem; }
.pie-chart-block :deep(.pie-layout) { flex: 1; align-content: center; min-height: 150px; gap: 12px; }
.spec-block { padding: 12px; }
.spec-list { display: grid; gap: 9px; }
.spec-row { display: grid; grid-template-columns: 86px 110px minmax(0, 1fr) 96px; align-items: center; gap: 10px; }
.spec-grade { font-size: .85rem; font-weight: 800; }
.spec-label { overflow: hidden; font-size: .88rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.spec-track { height: 18px; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.spec-bar { height: 100%; border-radius: 999px; transition: width 260ms ease; }
.spec-qty { text-align: right; font-size: .85rem; font-variant-numeric: tabular-nums; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }

@media (min-width: 1100px) {
  .breakdown-grid { grid-template-columns: minmax(250px, .85fr) minmax(250px, .9fr) minmax(330px, 1.2fr); }
  .pie-chart-block :deep(.pie-layout) { grid-template-columns: minmax(120px, .9fr) minmax(140px, 1.1fr); }
}

@media (max-width: 560px) {
  .price-columns { grid-template-columns: repeat(auto-fit, minmax(76px, 1fr)); gap: 8px; min-height: 150px; }
  .price-bar-area { height: 100px; }
  .price-bar { width: min(44px, 64%); }
  .spec-row { grid-template-columns: 70px minmax(0, 1fr) 76px; }
  .spec-label { grid-column: 2; }
  .spec-track { grid-column: 2 / -1; }
  .spec-qty { grid-column: 3; }
}
</style>
