<script setup lang="ts">
import { computed, ref } from 'vue'
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

// 柱＝件数（等级色），折线＝每件均价（统一黑色，与等级区分靠柱色与图例文字）。
const legendItems = computed(() => gradeOrder.value.flatMap((grade) => [
  { label: `${gradeLabel(grade)}·件数`, color: gradeColors[grade], variant: 'block' as const },
  { label: `${gradeLabel(grade)}·均价`, color: echartTheme.ink, variant: 'line' as const },
]))

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
  grid: { left: gridMargin, right: gridMargin, top: 34, bottom: 46, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
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
  yAxis: [
    {
      type: 'value',
      name: '件',
      min: 0,
      axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
      splitLine: { lineStyle: { color: echartTheme.line, type: 'dashed' } },
    },
    {
      type: 'value',
      name: '元/件',
      min: priceAxisBounds.value.min,
      max: priceAxisBounds.value.max,
      axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
      splitLine: { show: false },
    },
  ],
  // 每个等级一组柱（件数，左轴）+ 一条黑色折线（每件均价，右轴）；某张单缺该等级时
  // 柱缺失、折线断开，不造假。
  series: gradeOrder.value.flatMap((grade) => [
    {
      name: `${gradeLabel(grade)}·件数`,
      type: 'bar',
      data: props.items.map((item) => gradeOf(item, grade)?.salesQuantity ?? null),
      barMaxWidth: 26,
      itemStyle: { color: gradeColors[grade], borderRadius: [3, 3, 0, 0] },
      emphasis: { focus: 'series' },
    },
    {
      name: `${gradeLabel(grade)}·均价`,
      type: 'line',
      yAxisIndex: 1,
      data: props.items.map((item) => gradePrice(item, grade)),
      connectNulls: false,
      symbol: 'circle',
      symbolSize: 7,
      color: echartTheme.ink,
      lineStyle: { width: 2.5 },
      itemStyle: { color: echartTheme.ink },
      emphasis: { focus: 'series' },
    },
  ]),
}))
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-price-title">
    <header class="section-heading">
      <div>
        <h2 id="series-price-title">等级均价对比</h2>
        <p class="section-note">柱为件数（左轴），折线为每件均价（右轴，元/件）；横轴为所选结算单</p>
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
        :aria-label="`${items.length} 张结算单等级件数柱状与每件均价折线组合图`"
      />
    </div>
  </section>
</template>

<style scoped>
.price-figure { min-width: 0; }
.chart-skeleton { min-height: 250px; }

</style>
