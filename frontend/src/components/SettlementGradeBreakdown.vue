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

function priceBarWidth(value: number | null): string {
  if (!priceMax.value || value === null || value <= 0) return '0%'
  return `${Math.max((value / priceMax.value) * 100, 3)}%`
}

type SpecRow = {
  grade: Grade
  spec: string
  quantity: number
  amount: number
  share: number | null
  price: number | null
}

const totalQuantity = computed(() =>
  props.records.reduce((total, record) => total + record.quantity, 0),
)

const specRows = computed<SpecRow[]>(() => {
  const grouped = new Map<string, SpecRow>()
  props.records.forEach((record) => {
    const grade = record.grade
    if (!grade || !specGradeOrder.value.includes(grade)) return
    const spec = record.headCount?.trim() || '未标注规格'
    const key = `${grade}::${spec}`
    const current = grouped.get(key)
    if (current) {
      current.quantity += record.quantity
      current.amount += record.amount
      return
    }
    grouped.set(key, { grade, spec, quantity: record.quantity, amount: record.amount, share: null, price: null })
  })
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      share: totalQuantity.value ? row.quantity / totalQuantity.value : null,
      price: row.quantity ? row.amount / row.quantity : null,
    }))
    .sort((left, right) => {
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
      { label: '总件数', value: `${formatNumber(row.quantity)} 件`, color: gradeColors[row.grade] },
      { label: '占整张单总件数', value: formatPercent(row.share) },
      { label: '每件均价', value: formatPrice(row.price) },
    ],
    note: '规格（头数）为空时归入「未标注规格」',
  })
}
</script>

<template>
  <section class="dashboard-section settlement-grade-breakdown" aria-labelledby="settlement-grade-breakdown-title">
    <header class="section-heading">
      <div>
        <h2 id="settlement-grade-breakdown-title">等级图表</h2>
        <p class="section-note">饼图看件数结构，柱状图看各等级均价，横向柱图看不同规格（头数）的件数分布</p>
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
            <h3 id="grade-price-bar-title">等级均价</h3>
            <span>单位：元/件</span>
          </header>
          <div class="price-columns">
            <div v-for="row in gradeRows" :key="row.grade" class="price-column">
              <span class="price-grade">{{ gradeLabel(row.grade) }}</span>
              <div class="price-track">
                <div
                  class="price-bar"
                  :style="{ width: priceBarWidth(row.price), backgroundColor: gradeColors[row.grade] }"
                  :title="`${gradeLabel(row.grade)} ${formatPrice(row.price)}/件`"
                ></div>
              </div>
              <strong>{{ formatPrice(row.price) }}</strong>
            </div>
          </div>
        </section>

        <section class="chart-block spec-block" aria-labelledby="grade-spec-title">
          <header class="block-heading">
            <div>
              <h3 id="grade-spec-title">规格件数与均价</h3>
              <p>条越长代表该规格件数越多，并显示占比与每件均价</p>
            </div>
          </header>
          <div v-if="!specRows.length" class="empty-inline">当前结算单没有可统计的规格数据</div>
          <div v-else class="spec-list">
            <div class="spec-list-head" aria-hidden="true">
              <span>等级</span>
              <span>规格</span>
              <span>件数分布</span>
              <span>占比</span>
              <span>总件数</span>
              <span>每件均价</span>
            </div>
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
              <span class="spec-share">{{ formatPercent(row.share) }}</span>
              <strong class="spec-qty">{{ formatNumber(row.quantity) }} 件</strong>
              <span class="spec-price">{{ formatPrice(row.price) }}</span>
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
.breakdown-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: stretch; }
.chart-block { display: flex; min-width: 0; flex-direction: column; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.block-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.block-heading h3 { margin: 0; font-size: 1rem; }
.block-heading span,
.block-heading p { margin: 0; color: var(--muted); font-size: .82rem; }
.price-columns { display: grid; flex: 1; align-content: center; gap: 9px; min-height: 116px; }
.price-column { display: grid; grid-template-columns: 58px minmax(0, 1fr) 54px; align-items: center; gap: 10px; min-width: 0; }
.price-grade { overflow: hidden; font-size: .82rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.price-track { height: 11px; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.price-bar { display: block; height: 100%; border-radius: 999px; transition: width 260ms ease; }
.price-column strong { text-align: right; font-size: .88rem; font-variant-numeric: tabular-nums; }
.pie-chart-block :deep(.grade-pie-section) { display: flex; flex: 1; flex-direction: column; padding: 0; border-top: 0; }
.pie-chart-block :deep(.section-heading) { margin-bottom: 8px; }
.pie-chart-block :deep(.section-heading h2) { margin: 0; font-size: 1rem; }
.pie-chart-block :deep(.pie-layout) { flex: 1; align-content: center; min-height: 116px; gap: 8px; }
.spec-block { padding: 10px; }
.spec-list { display: grid; gap: 6px; }
.spec-list-head,
.spec-row { display: grid; grid-template-columns: 72px 76px minmax(0, 1fr) 56px 72px 88px; align-items: center; gap: 8px; }
.spec-row { min-height: 30px; }
.spec-list-head { color: var(--muted); font-size: .72rem; font-weight: 900; }
.spec-grade { font-size: .82rem; font-weight: 800; }
.spec-label { overflow: hidden; font-size: .82rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.spec-track { height: 11px; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.spec-bar { height: 100%; border-radius: 999px; transition: width 260ms ease; }
.spec-share { color: var(--muted); font-size: .76rem; font-variant-numeric: tabular-nums; text-align: right; }
.spec-qty,
.spec-price { text-align: left; font-size: .8rem; font-variant-numeric: tabular-nums; }
.spec-price { color: var(--primary-dark); font-size: .82rem; font-weight: 800; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }

@media (min-width: 900px) {
  .breakdown-grid { grid-template-columns: minmax(240px, .78fr) minmax(300px, 1.22fr); }
  .spec-block { grid-column: 1 / -1; }
}

@media (max-width: 820px) {
  /* 手机端规格表改为两行式：首行「等级 规格 + 占比」，次行整条进度条，末行「件数 + 均价」。
     不再横向滚动，避免关键列被挤出屏幕。 */
  .price-column { grid-template-columns: 44px minmax(0, 1fr) 52px; gap: 8px; }
  .spec-list { overflow-x: visible; }

  .spec-list-head { display: none; }

  .spec-row {
    min-width: 0;
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-areas:
      'grade label share'
      'track track track'
      'qty qty price';
    gap: 4px 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .spec-row:last-child { padding-bottom: 0; border-bottom: 0; }

  .spec-grade { grid-area: grade; font-size: .84rem; }
  .spec-label { grid-area: label; max-width: none; font-size: .84rem; }
  .spec-track { grid-area: track; height: 10px; }
  .spec-share {
    grid-area: share;
    color: var(--ink);
    font-size: .84rem;
    font-weight: 800;
    text-align: right;
  }
  .spec-qty {
    grid-area: qty;
    color: var(--muted);
    font-size: .74rem;
    font-weight: 700;
  }
  .spec-price {
    grid-area: price;
    font-size: .74rem;
    text-align: right;
  }
}
</style>
