<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { echartTheme } from '../utils/echartTheme'
import { formatNumber, formatPrice } from '../utils/format'
import { displayMerchantNo } from '../utils/merchantNo'
import { displayOrderNo } from '../utils/orderNo'
import { gradePrice } from '../utils/seriesComparison'
import DeferredEChart from './DeferredEChart.vue'
import ChartLegend from './ChartLegend.vue'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

const gradeOrder = computed(() => activeGrades(props.items.flatMap((item) => item.grades)))

const legendItems = computed(() => gradeOrder.value.map((grade) => ({
  label: gradeLabel(grade),
  color: gradeColors[grade],
  variant: 'block' as const,
})))

const groups = computed(() =>
  props.items.map((item) => ({
    merchantNo: displayMerchantNo(item),
    orderNo: displayOrderNo(item),
    prices: gradeOrder.value.map((grade) => gradePrice(item, grade)),
  })),
)

const bestPrices = computed(() => {
  const best = {} as Record<Grade, number>
  gradeOrder.value.forEach((grade) => {
    best[grade] = Math.max(0, ...props.items.map((item) => gradePrice(item, grade) ?? 0))
  })
  return best
})

const chartOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  grid: { left: 46, right: 16, top: 34, bottom: 46, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: unknown) => {
      const rows = (Array.isArray(params) ? params : [params]) as Array<{
        dataIndex: number
        seriesName: string
        value: number | null
      }>
      if (!rows.length) return ''
      const group = groups.value[rows[0].dataIndex]
      if (!group) return ''
      const lines = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map((row) => `<span>${row.seriesName}：${formatPrice(row.value)}</span>`)
      return [`<strong>${group.merchantNo}${group.orderNo ? ` · ${group.orderNo}` : ''}</strong>`, ...lines].join('<br/>')
    },
  },
  legend: { show: false },
  xAxis: {
    type: 'category',
    data: groups.value.map((group) => `${group.merchantNo}\n${group.orderNo || '—'}`),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: echartTheme.lineStrong } },
    axisLabel: { color: echartTheme.muted, interval: 0, overflow: 'truncate', width: 90 },
  },
  yAxis: {
    type: 'value',
    name: '元/件',
    min: 0,
    axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
    splitLine: { lineStyle: { color: echartTheme.line, type: 'dashed' } },
  },
  series: gradeOrder.value.map((grade) => ({
    name: gradeLabel(grade),
    type: 'bar',
    color: gradeColors[grade],
    data: props.items.map((item) => {
      const value = gradePrice(item, grade)
      return {
        value,
        itemStyle: {
          borderWidth: value !== null && value === bestPrices.value[grade] ? 2 : 0,
          borderColor: '#ffffff',
        },
      }
    }),
    barMaxWidth: 26,
    emphasis: { focus: 'series' },
  })),
}))
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-price-title">
    <header class="section-heading">
      <div>
        <h2 id="series-price-title">等级均价对比</h2>
        <p class="section-note">每张结算单一组，柱内按等级排列；单位：元/件，白色描边为该等级最高价</p>
      </div>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="chart-skeleton skeleton-block">正在加载价格对比</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>在上方勾选两个及以上结算单后即可对比。</span>
    </div>
    <div v-else class="price-figure">
      <DeferredEChart
        :option="chartOption"
        height="250px"
        :aria-label="`${items.length} 张结算单等级均价对比柱状图`"
      />
    </div>
  </section>
</template>

<style scoped>
.price-figure { min-width: 0; }
.chart-skeleton { min-height: 250px; }

@media (max-width: 720px) {
  .section-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
}
</style>
