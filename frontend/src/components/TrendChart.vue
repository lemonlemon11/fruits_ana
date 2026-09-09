<script setup lang="ts">
import { computed } from 'vue'

import type { Grade, TrendPoint } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatCurrency, formatDate, formatNumber, formatPrice } from '../utils/format'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
  title?: string
}>()

const chart = { width: 760, height: 258, left: 42, right: 18, top: 20, bottom: 34 }
const plotWidth = chart.width - chart.left - chart.right
const plotHeight = chart.height - chart.top - chart.bottom
const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }

const maxQuantity = computed(() => Math.max(
  ...props.points.flatMap((point) => gradeOrder.map((grade) => point.grades.find((item) => item.grade === grade)?.salesQuantity ?? 0)),
  1,
))
const maxPrice = computed(() => Math.max(...props.points.map((point) => point.weightedAvgPrice ?? 0), 1))

const xStep = computed(() => props.points.length > 1 ? plotWidth / (props.points.length - 1) : plotWidth)
const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1])
const xLabels = computed(() => {
  if (props.points.length <= 7) return props.points.map((point, index) => ({ point, index }))
  const step = Math.ceil((props.points.length - 1) / 6)
  const indexes = new Set<number>([0, props.points.length - 1])
  for (let index = step; index < props.points.length - 1; index += step) indexes.add(index)
  return [...indexes].sort((left, right) => left - right).map((index) => ({ point: props.points[index], index }))
})

function xPosition(index: number): number {
  return props.points.length > 1 ? chart.left + index * xStep.value : chart.left + plotWidth / 2
}

function yPosition(value: number, max: number): number {
  return chart.top + plotHeight - (Math.max(value, 0) / max) * plotHeight
}

function gradeValue(point: TrendPoint, grade: Grade): number {
  return point.grades.find((item) => item.grade === grade)?.salesQuantity ?? 0
}

function linePoints(grade: Grade): string {
  return props.points.map((point, index) => `${xPosition(index)},${yPosition(gradeValue(point, grade), maxQuantity.value)}`).join(' ')
}

function priceLinePoints(): string {
  return props.points.map((point, index) => `${xPosition(index)},${yPosition(point.weightedAvgPrice ?? 0, maxPrice.value)}`).join(' ')
}

function yTickLabel(ratio: number): string {
  return formatNumber(maxQuantity.value * ratio)
}

function priceTickLabel(ratio: number): string {
  return formatPrice(maxPrice.value * ratio)
}
</script>

<template>
  <section class="dashboard-section trend-section" aria-labelledby="trend-title">
    <header class="section-heading">
      <div>
        <p class="eyebrow">DAILY PULSE</p>
        <h2 id="trend-title">{{ title ?? '每日量价趋势' }}</h2>
      </div>
      <div class="chart-legend" aria-label="图例">
        <span v-for="grade in gradeOrder" :key="grade" class="legend-item" :class="`legend-${grade.toLowerCase()}`">{{ gradeLabel(grade) }}</span>
        <span class="legend-item legend-price">加权均价</span>
      </div>
    </header>

    <div v-if="loading" class="trend-skeleton skeleton-block" aria-live="polite">正在加载趋势数据</div>
    <div v-else-if="!points.length" class="empty-state">
      <strong>当前范围没有趋势数据</strong>
      <span>调整日期或货柜筛选后重试。</span>
    </div>
    <template v-else>
      <div class="trend-chart-shell">
        <div class="chart-scale chart-scale-left" aria-hidden="true">
          <span v-for="ratio in [...yTicks].reverse()" :key="`qty-${ratio}`">{{ yTickLabel(ratio) }}</span>
        </div>
        <svg
          class="trend-chart"
          :viewBox="`0 0 ${chart.width} ${chart.height}`"
          role="img"
          :aria-label="`${points.length} 天等级销量与加权均价折线图。最高单等级销量 ${formatNumber(maxQuantity)}`"
        >
          <title>{{ title ?? '每日量价趋势' }}</title>
          <desc>实线表示 A、B、C 各等级每日销量，虚线表示每日加权均价。</desc>
          <g class="chart-grid" aria-hidden="true">
            <line
              v-for="ratio in yTicks"
              :key="`grid-${ratio}`"
              :x1="chart.left"
              :x2="chart.width - chart.right"
              :y1="yPosition(maxQuantity * ratio, maxQuantity)"
              :y2="yPosition(maxQuantity * ratio, maxQuantity)"
            />
          </g>
          <line class="chart-axis" :x1="chart.left" :x2="chart.left" :y1="chart.top" :y2="chart.height - chart.bottom" />
          <line class="chart-axis" :x1="chart.left" :x2="chart.width - chart.right" :y1="chart.height - chart.bottom" :y2="chart.height - chart.bottom" />
          <polyline
            v-for="grade in gradeOrder"
            :key="grade"
            class="trend-line"
            :class="`line-${grade.toLowerCase()}`"
            :points="linePoints(grade)"
            :stroke="gradeColors[grade]"
          />
          <polyline class="trend-line line-price" :points="priceLinePoints()" />
          <g v-for="grade in gradeOrder" :key="`dots-${grade}`" class="trend-dots">
            <circle
              v-for="(point, index) in points"
              :key="`${grade}-${point.date}`"
              :cx="xPosition(index)"
              :cy="yPosition(gradeValue(point, grade), maxQuantity)"
              r="3"
              :fill="gradeColors[grade]"
            >
              <title>{{ formatDate(point.date) }} · {{ gradeLabel(grade) }}销量 {{ formatNumber(gradeValue(point, grade)) }}</title>
            </circle>
          </g>
          <g class="price-dots">
            <circle
              v-for="(point, index) in points"
              :key="`price-${point.date}`"
              :cx="xPosition(index)"
              :cy="yPosition(point.weightedAvgPrice ?? 0, maxPrice)"
              r="3"
            >
              <title>{{ formatDate(point.date) }} · 加权均价 {{ formatPrice(point.weightedAvgPrice) }}</title>
            </circle>
          </g>
          <g class="chart-x-labels" aria-hidden="true">
            <text v-for="item in xLabels" :key="item.point.date" :x="xPosition(item.index)" :y="chart.height - 10" text-anchor="middle">{{ formatDate(item.point.date) }}</text>
          </g>
        </svg>
        <div class="chart-scale chart-scale-right" aria-hidden="true">
          <span v-for="ratio in [...yTicks].reverse()" :key="`price-${ratio}`">{{ priceTickLabel(ratio) }}</span>
        </div>
      </div>
      <div class="scale-hint"><span>左轴：各等级销量</span><span>右轴：加权均价</span></div>

      <details class="data-details">
        <summary>查看趋势数据表</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>销量</th><th>销售额</th><th>加权均价</th></tr></thead>
            <tbody>
              <tr v-for="point in points" :key="point.date">
                <td>{{ point.date }}</td><td>{{ formatNumber(point.salesQuantity) }}</td>
                <td>{{ formatCurrency(point.salesAmount) }}</td><td>{{ formatPrice(point.weightedAvgPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.trend-section { min-width: 0; }
.chart-legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px 12px; color: var(--muted); font-size: .68rem; }
.legend-item { display: inline-flex; align-items: center; white-space: nowrap; }
.legend-item::before { content: ''; width: 8px; height: 8px; margin-right: 5px; border-radius: 50%; background: currentColor; }
.legend-a { color: var(--grade-a); }.legend-b { color: var(--grade-b); }.legend-c { color: var(--grade-c); }.legend-price { color: var(--ink); }
.legend-price::before { border: 1px dashed var(--ink); background: transparent; }
.trend-chart-shell { display: grid; grid-template-columns: 44px minmax(0, 1fr) 54px; align-items: stretch; min-height: 260px; margin-top: 5px; }
.trend-chart { width: 100%; min-width: 0; height: 258px; overflow: visible; }
.chart-scale { display: flex; flex-direction: column; justify-content: space-between; padding: 17px 0 34px; color: var(--muted); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .58rem; line-height: 1; font-variant-numeric: tabular-nums; }
.chart-scale-left { align-items: flex-start; }.chart-scale-right { align-items: flex-end; }
.chart-grid line { stroke: var(--line); stroke-dasharray: 2 4; stroke-width: 1; }
.chart-axis { stroke: var(--line-strong); stroke-width: 1; }
.trend-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.5; vector-effect: non-scaling-stroke; }
.line-price { stroke: var(--ink); stroke-width: 2; stroke-dasharray: 5 4; }
.trend-dots circle, .price-dots circle { vector-effect: non-scaling-stroke; stroke: white; stroke-width: 1.5; }
.price-dots circle { fill: var(--ink); }
.chart-x-labels text { fill: var(--muted); font-size: 10px; }
.scale-hint { display: flex; justify-content: space-between; margin: -4px 44px 0; color: var(--muted); font-size: .62rem; }
.trend-skeleton { min-height: 258px; }
.data-details { margin-top: 13px; }

@media (max-width: 560px) {
  .chart-legend { justify-content: flex-start; }
  .trend-chart-shell { grid-template-columns: 35px minmax(0, 1fr) 44px; min-height: 220px; }
  .trend-chart { height: 220px; }
  .chart-scale { padding-bottom: 34px; font-size: .52rem; }
  .chart-x-labels text { font-size: 8px; }
  .scale-hint { margin-inline: 35px 44px; font-size: .57rem; }
}
</style>
