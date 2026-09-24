<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EChartsOption } from 'echarts'

import type { TrendPoint } from '../api/client'
import { formatCurrency, formatDate, formatNumber, formatPrice } from '../utils/format'
import { echartTheme } from '../utils/echartTheme'
import DeferredEChart from './DeferredEChart.vue'
import ChartLegend from './ChartLegend.vue'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
  title?: string
}>()

const legendItems = [
  { label: '每日销量', color: 'var(--primary)', variant: 'line' as const },
  { label: '每件均价', color: 'var(--ink)', variant: 'dashed' as const },
]

const tablePageSize = 8
const tablePage = ref(1)

const tableColumns: DataTableColumn<TrendPoint>[] = [
  { key: 'date', label: '销售日期', rowHeader: true, emphasis: true },
  { key: 'salesQuantity', label: '销量', numeric: true, value: (point) => formatNumber(point.salesQuantity) },
  { key: 'salesAmount', label: '销售金额', numeric: true, value: (point) => formatCurrency(point.salesAmount) },
  { key: 'weightedAvgPrice', label: '每件均价', numeric: true, value: (point) => formatPrice(point.weightedAvgPrice) },
]

const totalTablePages = computed(() => Math.max(1, Math.ceil(props.points.length / tablePageSize)))
const pagedPoints = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return props.points.slice(start, start + tablePageSize)
})

const chartOption = computed<EChartsOption>(() => {
  const dates = props.points.map((point) => formatDate(point.date))
  const quantities = props.points.map((point) => point.salesQuantity)
  const prices = props.points.map((point) => point.weightedAvgPrice ?? 0)

  return {
    aria: { enabled: true },
    color: [echartTheme.primary, echartTheme.ink],
    grid: { left: 52, right: 58, top: 30, bottom: 34 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: echartTheme.lineStrong } },
      formatter: (params: unknown) => formatTrendTooltip(params),
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: echartTheme.lineStrong } },
      axisTick: { show: false },
      axisLabel: { color: echartTheme.muted },
    },
    yAxis: [
      {
        type: 'value',
        name: '销量',
        min: 0,
        max: (value: { max: number }) => Math.ceil(value.max * 1.2) || 1,
        axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
        splitLine: { lineStyle: { color: echartTheme.line, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '均价',
        min: 0,
        max: (value: { max: number }) => Math.ceil(value.max * 1.2) || 1,
        axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatPrice(value) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '每日销量',
        type: 'line',
        data: quantities,
        symbol: 'circle',
        symbolSize: props.points.length === 1 ? 8 : 6,
        color: echartTheme.primary,
        lineStyle: { color: echartTheme.primary, width: 2.5 },
        itemStyle: { color: echartTheme.primary },
      },
      {
        name: '每件均价',
        type: 'line',
        yAxisIndex: 1,
        data: prices,
        symbol: 'circle',
        symbolSize: props.points.length === 1 ? 8 : 6,
        color: echartTheme.ink,
        lineStyle: { color: echartTheme.ink, width: 2, type: 'dashed' },
        itemStyle: { color: echartTheme.ink },
      },
    ],
  }
})

function formatTrendTooltip(params: unknown): string {
  const rows = Array.isArray(params) ? params : [params]
  const point = props.points[rows[0]?.dataIndex ?? 0]
  if (!point) return ''
  return [
    `<strong>${formatDate(point.date)}</strong>`,
    `<span>销量：${formatNumber(point.salesQuantity)} 件</span>`,
    `<span>销售金额：${formatCurrency(point.salesAmount)}</span>`,
    `<span>每件均价：${formatPrice(point.weightedAvgPrice)}</span>`,
  ].join('<br/>')
}

function goTablePage(page: number) {
  tablePage.value = Math.min(Math.max(1, page), totalTablePages.value)
}

watch(() => props.points.length, () => {
  tablePage.value = 1
})
</script>

<template>
  <section class="dashboard-section trend-section" aria-labelledby="trend-title">
    <header class="section-heading">
      <h2 id="trend-title">{{ title ?? '销量与均价' }}</h2>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="trend-skeleton skeleton-block" aria-live="polite">正在加载趋势数据</div>
    <div v-else-if="!points.length" class="empty-state">
      <strong>当前范围没有趋势数据</strong>
      <span>调整销售日期或商号筛选后重试。</span>
    </div>
    <template v-else>
      <div class="trend-chart-shell">
        <DeferredEChart
          :option="chartOption"
          height="258px"
          :aria-label="`${points.length} 天销量与每件均价折线图`"
        />
      </div>
      <div class="scale-hint"><span>左轴：每日销量</span><span>右轴：每件均价</span></div>
      <p v-if="points.length === 1" class="single-point-hint">
        所选范围内只有 {{ formatDate(points[0].date) }} 一天数据。
      </p>

      <details class="data-details">
        <summary>查看趋势数据表</summary>
        <DataTable
          :columns="tableColumns"
          :rows="pagedPoints"
          :row-key="(point) => point.date"
          caption="所选范围的趋势数据"
          min-width="480px"
          cards-on-narrow
        >
          <template #footer>
            <div v-if="totalTablePages > 1" class="trend-table-pagination">
              <span>共 {{ points.length }} 条 · 第 {{ tablePage }} / {{ totalTablePages }} 页</span>
              <button type="button" :disabled="tablePage <= 1" @click="goTablePage(tablePage - 1)">上一页</button>
              <button type="button" :disabled="tablePage >= totalTablePages" @click="goTablePage(tablePage + 1)">下一页</button>
            </div>
          </template>
        </DataTable>
      </details>
    </template>
  </section>
</template>

<style scoped>
.trend-section { min-width: 0; }
.trend-chart-shell { min-height: 258px; margin-top: 5px; }
.single-point-hint { margin: 10px 0 0; color: var(--muted); font-size: .95rem; }
.scale-hint { display: flex; justify-content: space-between; margin: -2px 0 0; color: var(--muted); font-size: .85rem; }
.trend-skeleton { min-height: 258px; }
.data-details { margin-top: 13px; }
.trend-table-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: .59rem;
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
  .trend-chart-shell { min-height: 220px; }
}
</style>
