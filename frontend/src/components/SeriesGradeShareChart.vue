<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { echartTheme } from '../utils/echartTheme'
import { formatNumber, formatPercent } from '../utils/format'
import { gradeOf, shortLabel } from '../utils/seriesComparison'
import DeferredEChart from './DeferredEChart.vue'
import ChartLegend from './ChartLegend.vue'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

const gradeOrder = computed(() => activeGrades(props.items.flatMap((item) => item.grades)))

const legendItems = computed(() => gradeOrder.value.map((grade) => ({
  label: gradeLabel(grade),
  color: gradeColors[grade],
  variant: 'block' as const,
})))

const rows = computed(() =>
  props.items.map((item) => {
    const total = gradeOrder.value.reduce(
      (sum, grade) => sum + (gradeOf(item, grade)?.salesQuantity ?? 0),
      0,
    )
    return {
      label: shortLabel(item),
      series: item.series,
      segments: gradeOrder.value.map((grade) => {
        const quantity = gradeOf(item, grade)?.salesQuantity ?? 0
        return {
          grade,
          quantity,
          share: total ? quantity / total : 0,
        }
      }),
    }
  }),
)

const chartOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  grid: { left: 84, right: 16, top: 30, bottom: 24, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: unknown) => {
      const parts = (Array.isArray(params) ? params : [params]) as Array<{
        dataIndex: number
        seriesName: string
        value: number
      }>
      if (!parts.length) return ''
      const row = rows.value[parts[0].dataIndex]
      if (!row) return ''
      const lines = parts.map((part) => {
        const grade = gradeOrder.value.find((item) => gradeLabel(item) === part.seriesName)
        const segment = grade ? row.segments.find((item) => item.grade === grade) : undefined
        return `<span>${part.seriesName}：${formatPercent(part.value / 100)} · ${formatNumber(segment?.quantity ?? 0)} 件</span>`
      })
      return [`<strong>${row.label}</strong>`, `<span>${row.series}</span>`, ...lines].join('<br/>')
    },
  },
  legend: { show: false },
  xAxis: {
    type: 'value',
    min: 0,
    max: 100,
    axisLabel: { color: echartTheme.muted, formatter: '{value}%' },
    splitLine: { lineStyle: { color: echartTheme.line, type: 'dashed' } },
  },
  yAxis: {
    type: 'category',
    data: rows.value.map((row) => row.label),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: echartTheme.lineStrong } },
    axisLabel: { color: echartTheme.ink, width: 78, overflow: 'truncate' },
  },
  series: gradeOrder.value.map((grade) => ({
    name: gradeLabel(grade),
    type: 'bar',
    stack: 'share',
    color: gradeColors[grade],
    barMaxWidth: 20,
    data: rows.value.map((row) => {
      const segment = row.segments.find((item) => item.grade === grade)
      return {
        value: Number(((segment?.share ?? 0) * 100).toFixed(2)),
      }
    }),
    emphasis: { focus: 'series' },
  })),
}))
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-share-title">
    <header class="section-heading">
      <div>
        <h2 id="series-share-title">等级件数占比</h2>
        <p class="section-note">条越长代表该等级件数越多；每行按等级顺序堆叠</p>
      </div>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="chart-skeleton skeleton-block">正在加载等级占比</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>勾选结算单后即可查看等级结构。</span>
    </div>
    <div v-else class="share-chart">
      <DeferredEChart
        :option="chartOption"
        :height="`${Math.max(items.length * 46 + 84, 172)}px`"
        :aria-label="`${items.length} 张结算单等级件数占比堆叠图`"
      />
    </div>
  </section>
</template>

<style scoped>
.share-chart { min-width: 0; }
.chart-skeleton { min-height: 172px; }
</style>
