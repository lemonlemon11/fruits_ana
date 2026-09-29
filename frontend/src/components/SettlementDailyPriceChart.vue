<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import type { Grade, SettlementRecord } from '../api/client'
import { activeGrades } from '../utils/grades'
import { echartTheme } from '../utils/echartTheme'
import { formatDate, formatNumber, formatPrice } from '../utils/format'
import DeferredEChart from './DeferredEChart.vue'

const props = defineProps<{
  records: SettlementRecord[]
  loading?: boolean
  gradeOrder?: Grade[]
  /** 区块标题；详情页传入带单号前缀的标题。 */
  title?: string
}>()

const sectionTitle = computed(() => props.title ?? '按日均价走势')

const dailyGradeOrder = computed(() => props.gradeOrder ?? activeGrades(props.records))

/** 按销售日期聚合，每件均价 = 当日金额 ÷ 当日件数（金额加权）；跟随页面上方的等级筛选。 */
const dailyPoints = computed(() => {
  const grouped = new Map<string, { date: string; quantity: number; amount: number }>()
  props.records.forEach((record) => {
    if (!record.grade || !dailyGradeOrder.value.includes(record.grade)) return
    const current = grouped.get(record.saleDate) ?? { date: record.saleDate, quantity: 0, amount: 0 }
    current.quantity += record.quantity
    current.amount += record.amount
    grouped.set(record.saleDate, current)
  })
  return [...grouped.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({ ...point, price: point.quantity ? point.amount / point.quantity : null }))
})

const sectionNote = computed(() =>
  dailyPoints.value.length === 1 ? '本单销售集中在 1 天' : '每件均价 = 当日金额 ÷ 当日件数',
)

/** 主题色转 rgba（柱体浅色用）；非 #rrggbb 写法原样返回兜底。 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (hex.length === 7 && hex[0] === '#') {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return hex
}

const chartOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  grid: { left: 46, right: 52, top: 34, bottom: 36, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: unknown) => {
      const rows = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>
      const point = dailyPoints.value[rows[0]?.dataIndex ?? -1]
      if (!point) return ''
      return [
        `<strong>${formatDate(point.date)}</strong>`,
        `<span>当日件数：${formatNumber(point.quantity)} 件</span>`,
        `<span>每件均价：${formatPrice(point.price)}</span>`,
      ].join('<br/>')
    },
  },
  legend: { show: false },
  xAxis: {
    type: 'category',
    data: dailyPoints.value.map((point) => formatDate(point.date)),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: echartTheme.lineStrong } },
    axisLabel: { color: echartTheme.muted },
    boundaryGap: true,
  },
  // 双轴：左=当日件数（柱），右=每件均价（线）；右轴不画网格线避免与左轴刻度错位。
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
      min: 0,
      axisLabel: { color: echartTheme.muted, formatter: (value: number) => formatNumber(value) },
      splitLine: { show: false },
    },
  ],
  // 柱线组合（量+价）：浅色圆角柱看当日件数，主线看均价走势；单柜常见 1~3 个销售日，
  // 折线始终带圆点并直接标注价格，只有 1 天也能读出数值。
  series: [
    {
      name: '当日件数',
      type: 'bar',
      yAxisIndex: 0,
      data: dailyPoints.value.map((point) => point.quantity),
      barWidth: 44,
      itemStyle: { color: withAlpha(echartTheme.primary, 0.28), borderRadius: [5, 5, 0, 0] },
      emphasis: { focus: 'series' },
    },
    {
      name: '每件均价',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      color: echartTheme.primary,
      data: dailyPoints.value.map((point) => point.price),
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3 },
      z: 3,
      label: {
        show: true,
        color: echartTheme.ink,
        fontWeight: 700,
        formatter: (params: unknown) => {
          const value = (params as { value: number | null }).value
          return value == null ? '—' : formatPrice(value)
        },
      },
      emphasis: { focus: 'series' },
    },
  ],
}))
</script>

<template>
  <section class="dashboard-section settlement-daily-price" aria-labelledby="settlement-daily-price-title">
    <header class="section-heading">
      <div>
        <h2 id="settlement-daily-price-title">{{ sectionTitle }}</h2>
        <p class="section-note">{{ sectionNote }}</p>
      </div>
    </header>

    <div v-if="loading" class="daily-price-skeleton skeleton-block">正在加载按日均价</div>
    <div v-else-if="!dailyPoints.length" class="empty-inline">当前筛选范围没有可统计的销售记录</div>
    <!-- height 100% + flex 拉伸：与右侧规格表同行时随其等高撑满；单列/移动端回落 min-height。 -->
    <div v-else class="daily-price-figure">
      <DeferredEChart
        :option="chartOption"
        height="100%"
        :aria-label="`按销售日期的当日件数柱状与每件均价折线组合图，共 ${dailyPoints.length} 个销售日`"
      />
    </div>
  </section>
</template>

<style scoped>
.settlement-daily-price { display: flex; flex-direction: column; }
.daily-price-figure { display: flex; flex: 1 1 auto; min-height: 280px; }
.daily-price-figure :deep(.deferred-echart) { flex: 1; min-height: 280px; }
.daily-price-skeleton { min-height: 280px; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }
</style>
