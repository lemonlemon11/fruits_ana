<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'

import type { TrendPoint } from '../api/client'
import { formatCurrency, formatDate, formatNumber } from '../utils/format'
import { echartTheme } from '../utils/echartTheme'
import DeferredEChart from './DeferredEChart.vue'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
}>()

// 参考稿的极简灰调折线：隐藏 Y 轴、淡面积渐变、只标末点空心圆，悬停按日看数值。
const LINE_COLOR = '#6b7280'

type TrendMode = 'amount' | 'quantity'
const mode = ref<TrendMode>('amount')
const modeOptions: Array<{ value: TrendMode; label: string }> = [
  { value: 'amount', label: '金额' },
  { value: 'quantity', label: '件数' },
]

const isAmount = computed(() => mode.value === 'amount')
const metricLabel = computed(() => (isAmount.value ? '销售金额' : '销售件数'))

function formatValue(value: number): string {
  return isAmount.value ? formatCurrency(value) : `${formatNumber(value)} 件`
}

const chartOption = computed<EChartsOption>(() => {
  const dates = props.points.map((point) => formatDate(point.date))
  const values = props.points.map((point) => (isAmount.value ? point.salesAmount : point.salesQuantity))
  const lastIndex = props.points.length - 1
  return {
    aria: { enabled: true },
    grid: { left: 10, right: 18, top: 16, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: echartTheme.lineStrong } },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? (params as Array<{ dataIndex?: number; value?: number }>) : []
        const item = items.find((entry) => entry.value != null)
        if (!item) return ''
        const point = props.points[item.dataIndex ?? 0]
        return `<strong>${point?.date ?? ''}</strong><br/><span>${metricLabel.value}：${formatValue(item.value ?? 0)}</span>`
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: echartTheme.lineStrong } },
      axisTick: { show: false },
      axisLabel: { color: echartTheme.muted, hideOverlap: true },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: LINE_COLOR },
        itemStyle: { color: LINE_COLOR },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(107, 114, 128, 0.18)' },
              { offset: 1, color: 'rgba(107, 114, 128, 0)' },
            ],
          },
        },
      },
      // 末点空心圆标记（参考稿）。
      {
        type: 'scatter',
        data: lastIndex >= 0 ? [{ value: [dates[lastIndex], values[lastIndex]] }] : [],
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#fff', borderColor: LINE_COLOR, borderWidth: 2 },
        tooltip: { show: false },
      },
    ],
  }
})

const ariaLabel = computed(() =>
  props.points.length
    ? `${props.points.map((point) => `${point.date} ${formatValue(isAmount.value ? point.salesAmount : point.salesQuantity)}`).join('、')}，每日${metricLabel.value}折线图`
    : '暂无每日销售数据',
)
</script>

<template>
  <div class="daily-sales-chart" aria-labelledby="daily-sales-trend-title">
    <header class="daily-sales-heading">
      <div>
        <h3 id="daily-sales-trend-title">每日{{ metricLabel }}</h3>
      </div>
      <div class="daily-mode-toggle" role="group" aria-label="切换每日销售指标">
        <button
          v-for="option in modeOptions"
          :key="option.value"
          type="button"
          :class="{ 'is-active': mode === option.value }"
          :aria-pressed="mode === option.value"
          @click="mode = option.value"
        >{{ option.label }}</button>
      </div>
    </header>
    <div v-if="loading" class="daily-skeleton skeleton-block" aria-live="polite">正在加载每日销售数据</div>
    <div v-else-if="!points.length" class="empty-inline">当前筛选范围没有每日销售数据</div>
    <DeferredEChart v-else :option="chartOption" height="180px" :aria-label="ariaLabel" />
  </div>
</template>

<style scoped>
.daily-sales-chart { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6px; }
.daily-sales-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.daily-sales-heading h3 { margin: 0; font-size: 1rem; }
.daily-sales-heading p { margin: 0; color: var(--muted); font-size: .82rem; }
/* 参考稿右上角「金额 / 件数」分段切换：激活项深底白字，与规格表表头同调。 */
.daily-mode-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-soft);
}
.daily-mode-toggle button {
  min-height: 24px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--muted);
  font-size: .78rem;
  font-weight: 700;
  cursor: pointer;
}
.daily-mode-toggle button.is-active { background: #1f2923; color: #fff; }
.daily-mode-toggle button:not(.is-active):hover { color: var(--ink); }
.daily-skeleton { flex: 1; min-height: 180px; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }

@media (max-width: 560px) {
  .daily-sales-heading { flex-direction: column; align-items: stretch; }
  .daily-mode-toggle { align-self: flex-end; }
}
</style>
