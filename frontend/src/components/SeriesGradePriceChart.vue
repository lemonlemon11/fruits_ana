<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import { gradeLabel } from '../api/client'
import type { SeriesComparisonItem } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { echartTheme } from '../utils/echartTheme'
import { formatNumber, formatPrice } from '../utils/format'
import { displayMerchantNo } from '../utils/merchantNo'
import { displayOrderNo } from '../utils/orderNo'
import { gradeOf, gradePrice } from '../utils/seriesComparison'
import DeferredEChart from './DeferredEChart.vue'
import ChartLegend from './ChartLegend.vue'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

// 「其他」是未识别等级的兜底档，不进这张均价对比图；总览表仍保留该列。
const gradeOrder = computed(() =>
  activeGrades(props.items.flatMap((item) => item.grades)).filter((grade) => grade !== 'OTHER'),
)

// 每个等级一条折线（等级色）：折线走向即该等级在各张结算单的均价走势，颜色区分等级。
const legendItems = computed(() => gradeOrder.value.map((grade) => ({
  label: `${gradeLabel(grade)}均价`, color: gradeColors[grade], variant: 'line' as const,
})))

const groups = computed(() =>
  props.items.map((item) => ({
    merchantNo: displayMerchantNo(item),
    orderNo: displayOrderNo(item),
  })),
)

// 横轴标签列宽 150：放不下时换行成多行仍完整显示单号，避免相邻标签横向叠压。
const labelWidth = 150
const gridMargin = 46

/** 均价 Y 轴范围（用户要求不从 0 开始）：取全部均价的最小/最大各放宽 15%（跨度为 0 时
 *  按值 8%），取整到 5 的倍数保证刻度标签为整数；下限不越过 0。 */
const priceAxisBounds = computed(() => {
  const values = props.items
    .flatMap((item) => gradeOrder.value.map((grade) => gradePrice(item, grade)))
    .filter((value): value is number => value != null)
  if (!values.length) return { min: undefined, max: undefined }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = max > min ? (max - min) * 0.15 : Math.max(min * 0.08, 1)
  const toStep = (value: number, mode: 'floor' | 'ceil') => Math[mode](value / 5) * 5
  return { min: Math.max(0, toStep(min - pad, 'floor')), max: toStep(max + pad, 'ceil') }
})

const chartOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  // 顶部留高一些：折线点上方要标均价数字。
  grid: { left: gridMargin, right: gridMargin, top: 40, bottom: 46, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'line' },
    formatter: (params: unknown) => {
      const rows = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>
      if (!rows.length) return ''
      const index = rows[0].dataIndex
      const item = props.items[index]
      const group = groups.value[index]
      if (!item || !group) return ''
      const lines = gradeOrder.value.map((grade) => {
        const metric = gradeOf(item, grade)
        if (!metric || !metric.salesQuantity) return `<span>${gradeLabel(grade)}：该单没有</span>`
        return `<span>${gradeLabel(grade)}：${formatNumber(metric.salesQuantity)} 件 · 均价 ${formatPrice(metric.weightedAvgPrice)}</span>`
      })
      return [`<strong>${group.merchantNo}${group.orderNo ? ` · ${group.orderNo}` : ''}</strong>`, ...lines].join('<br/>')
    },
  },
  legend: { show: false },
  xAxis: {
    type: 'category',
    data: groups.value.map((group) => `${group.merchantNo}\n${group.orderNo || '—'}`),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: echartTheme.lineStrong } },
    // 横轴标签（商号+单号，单号最长 17 字符 ≈132px）完整显示：放不下换行，不截断成「…」。
    axisLabel: { color: echartTheme.muted, interval: 0, overflow: 'break', width: labelWidth },
    boundaryGap: true,
  },
  yAxis: {
    type: 'value',
    name: '元/件',
    min: priceAxisBounds.value.min,
    max: priceAxisBounds.value.max,
    axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
    splitLine: { lineStyle: { color: echartTheme.line, type: 'dashed' } },
  },
  // 每个等级一条折线（等级色），每点上方标注该单均价数字；某张单缺该等级时折线断开，
  // 不造假；多线近点用 hideOverlap 防数字叠压。
  series: gradeOrder.value.map((grade) => ({
    name: `${gradeLabel(grade)}均价`,
    type: 'line',
    data: props.items.map((item) => gradePrice(item, grade)),
    connectNulls: false,
    symbol: 'circle',
    symbolSize: 8,
    color: gradeColors[grade],
    lineStyle: { width: 2.5 },
    itemStyle: { color: gradeColors[grade] },
    label: {
      show: true,
      color: gradeColors[grade],
      fontWeight: 700,
      formatter: (params: unknown) => {
        const value = (params as { value: number | null }).value
        return value == null ? '' : formatPrice(value)
      },
    },
    labelLayout: { hideOverlap: true },
    emphasis: { focus: 'series' },
  })),
}))
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-price-title">
    <header class="section-heading">
      <div>
        <h2 id="series-price-title">等级均价对比</h2>
        <p class="section-note">折线为各等级每件均价（元/件），点旁数字为该单均价；横轴为所选结算单</p>
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
        :aria-label="`${items.length} 张结算单各等级每件均价折线图`"
      />
    </div>
  </section>
</template>

<style scoped>
.price-figure { min-width: 0; }
.chart-skeleton { min-height: 250px; }

</style>
