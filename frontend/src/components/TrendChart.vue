<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TrendPoint } from '../api/client'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatCurrency, formatDate, formatNumber, formatPrice } from '../utils/format'
import ChartLegend from './ChartLegend.vue'
import ChartTooltip from './ChartTooltip.vue'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
  title?: string
}>()

const chart = { width: 760, height: 258, left: 42, right: 18, top: 20, bottom: 34 }
const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()
const legendItems = [
  { label: '每日销量', color: 'var(--primary)', variant: 'line' as const },
  { label: '平均每公斤售价', color: 'var(--ink)', variant: 'dashed' as const },
]
const tablePageSize = 8
const tablePage = ref(1)

const plotWidth = chart.width - chart.left - chart.right
const plotHeight = chart.height - chart.top - chart.bottom
const maxQuantity = computed(() => Math.max(...props.points.map((point) => point.salesQuantity), 1))
const maxPrice = computed(() => Math.max(...props.points.map((point) => point.weightedAvgPrice ?? 0), 1))
const isSinglePoint = computed(() => props.points.length === 1)
const singlePoint = computed(() => props.points[0])
const totalTablePages = computed(() => Math.max(1, Math.ceil(props.points.length / tablePageSize)))
const pagedPoints = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return props.points.slice(start, start + tablePageSize)
})

const xStep = computed(() => props.points.length > 1 ? plotWidth / (props.points.length - 1) : plotWidth)
const yTicks = computed(() => [0, 0.25, 0.5, 0.75, 1])
const xLabels = computed(() => props.points.map((point, index) => ({ point, index })))

function xPosition(index: number): number {
  return props.points.length > 1 ? chart.left + index * xStep.value : chart.left + plotWidth / 2
}

function yPosition(value: number, max: number): number {
  return chart.top + plotHeight - (Math.max(value, 0) / max) * plotHeight
}

function linePoints(): string {
  return props.points.map((point, index) => `${xPosition(index)},${yPosition(point.salesQuantity, maxQuantity.value)}`).join(' ')
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

function goTablePage(page: number) {
  tablePage.value = Math.min(Math.max(1, page), totalTablePages.value)
}

/** 销量点与均价点共用同一份悬浮内容，方便对着同一天两个值一起看。 */
function showPointTooltip(event: MouseEvent, point: TrendPoint) {
  showTooltip(event, {
    title: formatDate(point.date),
    rows: [
      { label: '销量', value: `${formatNumber(point.salesQuantity)} 件`, color: 'var(--primary)' },
      { label: '销售额', value: formatCurrency(point.salesAmount) },
      { label: '平均每公斤售价', value: formatPrice(point.weightedAvgPrice), color: 'var(--ink)' },
    ],
  })
}

watch(() => props.points.length, () => {
  tablePage.value = 1
})
</script>

<template>
  <section class="dashboard-section trend-section" aria-labelledby="trend-title">
    <header class="section-heading">
      <h2 id="trend-title">{{ title ?? '每日销量和平均每公斤售价' }}</h2>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="trend-skeleton skeleton-block" aria-live="polite">正在加载趋势数据</div>
    <div v-else-if="!points.length" class="empty-state">
      <strong>当前范围没有趋势数据</strong>
      <span>调整到达日期或商号筛选后重试。</span>
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
          :aria-label="`${points.length} 天销量与平均每公斤售价折线图。最高日销量 ${formatNumber(maxQuantity)}`"
        >
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
            key="quantity-line"
            class="trend-line"
            :points="linePoints()"
            stroke="var(--primary)"
          />
          <polyline class="trend-line line-price" :points="priceLinePoints()" />
          <g v-if="isSinglePoint" class="single-point-guides" aria-hidden="true">
            <line
              class="guide-line guide-quantity"
              :x1="chart.left"
              :x2="chart.width - chart.right"
              :y1="yPosition(singlePoint.salesQuantity, maxQuantity)"
              :y2="yPosition(singlePoint.salesQuantity, maxQuantity)"
            />
            <line
              class="guide-line guide-price"
              :x1="chart.left"
              :x2="chart.width - chart.right"
              :y1="yPosition(singlePoint.weightedAvgPrice ?? 0, maxPrice)"
              :y2="yPosition(singlePoint.weightedAvgPrice ?? 0, maxPrice)"
            />
          </g>
          <g class="trend-dots">
            <circle
              v-for="(point, index) in points"
              :key="`quantity-${point.date}`"
              :cx="xPosition(index)"
              :cy="yPosition(point.salesQuantity, maxQuantity)"
              :r="isSinglePoint ? 5 : 3"
              fill="var(--primary)"
            />
            <circle
              v-for="(point, index) in points"
              :key="`quantity-hit-${point.date}`"
              class="trend-hit"
              :cx="xPosition(index)"
              :cy="yPosition(point.salesQuantity, maxQuantity)"
              r="11"
              @mouseenter="showPointTooltip($event, point)"
              @mousemove="moveTooltip"
              @mouseleave="hideTooltip"
            />
          </g>
          <g class="price-dots">
            <circle
              v-for="(point, index) in points"
              :key="`price-${point.date}`"
              :cx="xPosition(index)"
              :cy="yPosition(point.weightedAvgPrice ?? 0, maxPrice)"
              :r="isSinglePoint ? 5 : 3"
            />
            <circle
              v-for="(point, index) in points"
              :key="`price-hit-${point.date}`"
              class="trend-hit"
              :cx="xPosition(index)"
              :cy="yPosition(point.weightedAvgPrice ?? 0, maxPrice)"
              r="11"
              @mouseenter="showPointTooltip($event, point)"
              @mousemove="moveTooltip"
              @mouseleave="hideTooltip"
            />
          </g>
          <g class="chart-x-labels" aria-hidden="true">
            <text v-for="item in xLabels" :key="item.point.date" :x="xPosition(item.index)" :y="chart.height - 10" text-anchor="middle">{{ formatDate(item.point.date) }}</text>
          </g>
        </svg>
        <div class="chart-scale chart-scale-right" aria-hidden="true">
          <span v-for="ratio in [...yTicks].reverse()" :key="`price-${ratio}`">{{ priceTickLabel(ratio) }}</span>
        </div>
      </div>
      <div class="scale-hint"><span>左轴：每日销量</span><span>右轴：平均每公斤售价</span></div>
      <p v-if="isSinglePoint" class="single-point-hint">
        所选范围内只有 {{ formatDate(singlePoint.date) }} 一天数据，图中以虚线标出当天水平。
      </p>

      <details class="data-details">
        <summary>查看趋势数据表</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>到达日期</th><th>销量</th><th>销售额</th><th>平均每公斤售价</th></tr></thead>
            <tbody>
              <tr v-for="point in pagedPoints" :key="point.date">
                <td>{{ point.date }}</td><td>{{ formatNumber(point.salesQuantity) }}</td>
                <td>{{ formatCurrency(point.salesAmount) }}</td><td>{{ formatPrice(point.weightedAvgPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="totalTablePages > 1" class="trend-table-pagination">
          <span>共 {{ points.length }} 条 · 第 {{ tablePage }} / {{ totalTablePages }} 页</span>
          <button type="button" :disabled="tablePage <= 1" @click="goTablePage(tablePage - 1)">上一页</button>
          <button type="button" :disabled="tablePage >= totalTablePages" @click="goTablePage(tablePage + 1)">下一页</button>
        </div>
      </details>
    </template>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.trend-section { min-width: 0; }
.trend-hit { fill: transparent; pointer-events: all; }
.trend-chart-shell { display: grid; grid-template-columns: 44px minmax(0, 1fr) 54px; align-items: stretch; min-height: 260px; margin-top: 5px; }
.trend-chart { width: 100%; min-width: 0; height: 258px; overflow: visible; }
.chart-scale { display: flex; flex-direction: column; justify-content: space-between; padding: 17px 0 34px; color: var(--muted); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .85rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.chart-scale-left { align-items: flex-start; }.chart-scale-right { align-items: flex-end; }
.chart-grid line { stroke: var(--line); stroke-dasharray: 2 4; stroke-width: 1; }
.chart-axis { stroke: var(--line-strong); stroke-width: 1; }
.trend-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.5; vector-effect: non-scaling-stroke; }
.line-price { stroke: var(--ink); stroke-width: 2; stroke-dasharray: 5 4; }
.trend-dots circle, .price-dots circle { vector-effect: non-scaling-stroke; stroke: white; stroke-width: 1.5; }
.price-dots circle { fill: var(--ink); }
.guide-line { stroke-width: 1.5; stroke-dasharray: 6 5; opacity: .45; vector-effect: non-scaling-stroke; }
.guide-quantity { stroke: var(--primary); }
.guide-price { stroke: var(--ink); }
.single-point-hint { margin: 10px 0 0; color: var(--muted); font-size: .95rem; }
.chart-x-labels text { fill: var(--muted); font-size: 15px; }
.scale-hint { display: flex; justify-content: space-between; margin: -4px 44px 0; color: var(--muted); font-size: .85rem; }
.trend-skeleton { min-height: 258px; }
.data-details { margin-top: 13px; }
.data-details .table-wrap { overflow: visible; }
.data-details table { width: 100%; table-layout: fixed; }
.trend-table-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: .59rem;
  margin-top: .71rem;
  color: var(--muted);
  font-size: .9rem;
}
.trend-table-pagination button {
  min-height: 2.35rem;
  padding: 0 .71rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
}
.trend-table-pagination button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-dark); }
.trend-table-pagination button:disabled { cursor: not-allowed; opacity: .45; }

@media (max-width: 560px) {
  .trend-chart-shell { grid-template-columns: 35px minmax(0, 1fr) 44px; min-height: 220px; }
  .trend-chart { height: 220px; }
  .chart-scale { padding-bottom: 34px; font-size: .85rem; }
  .chart-x-labels text { font-size: 14px; }
  .scale-hint { margin-inline: 35px 44px; font-size: .85rem; }
}
</style>
