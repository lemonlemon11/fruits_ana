<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import type { Grade, GradeMetric } from '../api/client'
import { gradeLabel } from '../api/client'
import { activeGrades, gradeColors } from '../utils/grades'
import { echartTheme } from '../utils/echartTheme'
import { formatNumber, formatPercent } from '../utils/format'
import BaseEChart from './BaseEChart.vue'

const props = defineProps<{
  grades: GradeMetric[]
  loading?: boolean
  gradeOrder?: Grade[]
}>()

const visibleGrades = computed(() => props.gradeOrder ?? activeGrades(props.grades))

const rows = computed(() => visibleGrades.value.map((grade) => {
  const source = props.grades.find((item) => item.grade === grade)
  return {
    grade,
    quantity: source?.salesQuantity ?? 0,
    share: source?.quantityShare ?? 0,
  }
}))

const totalQuantity = computed(() => rows.value.reduce((total, row) => total + row.quantity, 0))
const hasData = computed(() => totalQuantity.value > 0)

function shareValue(row: (typeof rows.value)[number]): number {
  if (row.share > 0) return row.share
  return totalQuantity.value ? row.quantity / totalQuantity.value : 0
}

const chartOption = computed<EChartsOption>(() => ({
  aria: { enabled: true },
  tooltip: {
    trigger: 'item',
    formatter: (params: unknown) => {
      const row = params as { data?: { grade: Grade; quantity: number; share: number } }
      const data = row.data
      if (!data) return ''
      return [
        `<strong>${gradeLabel(data.grade)}</strong>`,
        `<span>件数占比：${formatPercent(shareValue(data))}</span>`,
        `<span>件数：${formatNumber(data.quantity)} 件</span>`,
      ].join('<br/>')
    },
  },
  title: {
    text: formatNumber(totalQuantity.value),
    subtext: '总件数',
    left: 'center',
    top: '40%',
    textStyle: { color: echartTheme.ink, fontSize: 18, fontWeight: 800 },
    subtextStyle: { color: echartTheme.muted, fontSize: 12 },
  },
  series: [
    {
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
      data: rows.value.map((row) => ({
        name: gradeLabel(row.grade),
        value: row.quantity,
        grade: row.grade,
        quantity: row.quantity,
        share: shareValue(row),
        itemStyle: { color: gradeColors[row.grade] },
      })),
      label: { show: false },
      emphasis: { scaleSize: 4 },
    },
  ],
}))
</script>

<template>
  <section class="dashboard-section grade-pie-section" aria-labelledby="grade-pie-title">
    <header class="section-heading">
      <div>
        <h2 id="grade-pie-title">等级件数结构</h2>
      </div>
      <p class="section-note">按件数占比</p>
    </header>

    <div v-if="loading" class="pie-skeleton skeleton-block" aria-live="polite">正在加载等级结构</div>
    <div v-else-if="!hasData" class="empty-state compact">
      <strong>暂无等级销量数据</strong>
      <span>导入销售明细后即可查看结构。</span>
    </div>
    <div v-else class="pie-layout">
      <div class="pie-graphic">
        <BaseEChart
          :option="chartOption"
          height="116px"
          :aria-label="`${visibleGrades.map(gradeLabel).join('、')} 等级件数占比环形图`"
        />
      </div>
      <ul class="pie-legend" aria-label="等级销量明细">
        <li v-for="row in rows" :key="row.grade">
          <span class="pie-dot" :style="{ backgroundColor: gradeColors[row.grade] }" aria-hidden="true" />
          <span class="pie-grade">{{ gradeLabel(row.grade) }}</span>
          <strong>{{ formatPercent(shareValue(row)) }}</strong>
          <small>{{ formatNumber(row.quantity) }} 件</small>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.grade-pie-section { min-width: 0; }
.pie-layout { display: grid; grid-template-columns: minmax(96px, .8fr) minmax(150px, 1.2fr); align-items: center; gap: 10px; min-height: 116px; }
.pie-graphic { display: grid; place-items: center; min-width: 0; }
.pie-legend { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.pie-legend li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 6px; }
.pie-dot { width: 10px; height: 10px; border-radius: 50%; }
.pie-grade { font-weight: 700; }
.pie-legend strong { text-align: right; font-variant-numeric: tabular-nums; }
.pie-legend small { grid-column: 2 / 4; margin-top: -4px; color: var(--muted); font-size: .76rem; }
.pie-skeleton { min-height: 116px; }

@media (max-width: 560px) {
  .pie-layout { grid-template-columns: 100px minmax(0, 1fr); gap: 8px; }
}

@media (max-width: 380px) {
  .pie-layout { grid-template-columns: 1fr; gap: 8px; }
  .pie-legend { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
}
</style>
