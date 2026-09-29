<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import type { TrendPoint } from '../api/client'
import { formatCurrency, formatDate } from '../utils/format'
import { echartTheme } from '../utils/echartTheme'
import DeferredEChart from './DeferredEChart.vue'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
}>()

// 参考稿的极简灰调折线：隐藏 Y 轴、淡面积渐变、只标末点空心圆，悬停按日看金额。
const LINE_COLOR = '#6b7280'

const chartOption = computed<EChartsOption>(() => {
  const dates = props.points.map((point) => formatDate(point.date))
  const amounts = props.points.map((point) => point.salesAmount)
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
        return `<strong>${point?.date ?? ''}</strong><br/><span>销售金额：${formatCurrency(item.value ?? 0)}</span>`
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
        data: amounts,
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
        data: lastIndex >= 0 ? [{ value: [dates[lastIndex], amounts[lastIndex]] }] : [],
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
    ? `${props.points.map((point) => `${point.date} ${formatCurrency(point.salesAmount)}`).join('、')}，每日销售金额折线图`
    : '暂无每日销售金额数据',
)
</script>

<template>
  <div class="daily-amount-chart">
    <header class="daily-amount-heading">
      <div>
        <h3>每日销售金额</h3>
        <p>按销售日期汇总当日销售金额，悬停查看具体金额</p>
      </div>
    </header>
    <div v-if="loading" class="daily-skeleton skeleton-block" aria-live="polite">正在加载每日销售金额</div>
    <div v-else-if="!points.length" class="empty-inline">当前筛选范围没有每日销售数据</div>
    <DeferredEChart v-else :option="chartOption" height="180px" :aria-label="ariaLabel" />
  </div>
</template>

<style scoped>
.daily-amount-chart { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6px; }
.daily-amount-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.daily-amount-heading h3 { margin: 0; font-size: 1rem; }
.daily-amount-heading p { margin: 0; color: var(--muted); font-size: .82rem; }
.daily-skeleton { flex: 1; min-height: 180px; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }
</style>
