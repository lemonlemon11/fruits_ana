<script setup lang="ts">
import { computed } from 'vue'

import type { Grade, GradeMetric } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatNumber, formatPercent } from '../utils/format'

const props = defineProps<{
  grades: GradeMetric[]
  loading?: boolean
}>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }
const radius = 48
const circumference = 2 * Math.PI * radius

const rows = computed(() => gradeOrder.map((grade) => {
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

function dashArray(share: number): string {
  return `${Math.max(share, 0) * circumference} ${circumference}`
}

function dashOffset(index: number): number {
  const preceding = rows.value.slice(0, index).reduce((total, row) => total + shareValue(row), 0)
  return -preceding * circumference
}
</script>

<template>
  <section class="dashboard-section grade-pie-section" aria-labelledby="grade-pie-title">
    <header class="section-heading">
      <div>
        <p class="eyebrow">GRADE MIX</p>
        <h2 id="grade-pie-title">等级销量结构</h2>
      </div>
      <p class="section-note">按销量占比</p>
    </header>

    <div v-if="loading" class="pie-skeleton skeleton-block" aria-live="polite">正在加载等级结构</div>
    <div v-else-if="!hasData" class="empty-state compact">
      <strong>暂无等级销量数据</strong>
      <span>导入销售明细后即可查看结构。</span>
    </div>
    <div v-else class="pie-layout">
      <div class="pie-graphic">
        <svg class="pie-chart" viewBox="0 0 136 136" role="img" aria-label="A、B、C 等级销量占比环形图">
          <title>等级销量结构</title>
          <desc>环形面积按 A、B、C 等级销量占比绘制。</desc>
          <circle class="pie-track" cx="68" cy="68" :r="radius" />
          <circle
            v-for="(row, index) in rows"
            :key="row.grade"
            class="pie-segment"
            cx="68"
            cy="68"
            :r="radius"
            :stroke="gradeColors[row.grade]"
            :stroke-dasharray="dashArray(shareValue(row))"
            :stroke-dashoffset="dashOffset(index)"
          >
            <title>{{ gradeLabel(row.grade) }} {{ formatPercent(shareValue(row)) }} · {{ formatNumber(row.quantity) }}</title>
          </circle>
          <text class="pie-total" x="68" y="64" text-anchor="middle">{{ formatNumber(totalQuantity) }}</text>
          <text class="pie-caption" x="68" y="79" text-anchor="middle">总销量</text>
        </svg>
      </div>
      <ul class="pie-legend" aria-label="等级销量明细">
        <li v-for="row in rows" :key="row.grade">
          <span class="pie-dot" :style="{ backgroundColor: gradeColors[row.grade] }" aria-hidden="true" />
          <span class="pie-grade">{{ gradeLabel(row.grade) }}</span>
          <strong>{{ formatPercent(shareValue(row)) }}</strong>
          <small>{{ formatNumber(row.quantity) }}</small>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.grade-pie-section { min-width: 0; }
.pie-layout { display: grid; grid-template-columns: minmax(136px, .9fr) minmax(145px, 1.1fr); align-items: center; gap: 16px; min-height: 172px; }
.pie-graphic { display: grid; place-items: center; }
.pie-chart { width: min(100%, 178px); height: auto; overflow: visible; transform: rotate(-90deg); }
.pie-chart text { transform: rotate(90deg); transform-origin: 68px 68px; }
.pie-track, .pie-segment { fill: none; stroke-width: 15; }
.pie-track { stroke: var(--surface-soft); }
.pie-segment { stroke-linecap: butt; transition: stroke-dasharray 260ms ease, stroke-dashoffset 260ms ease; }
.pie-total { fill: var(--ink); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: 17px; font-weight: 800; }
.pie-caption { fill: var(--muted); font-size: 9px; }
.pie-legend { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }
.pie-legend li { display: grid; grid-template-columns: 9px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; }
.pie-dot { width: 8px; height: 8px; border-radius: 50%; }
.pie-grade { color: var(--ink); font-size: .76rem; }
.pie-legend strong { font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .77rem; font-variant-numeric: tabular-nums; }
.pie-legend small { grid-column: 2 / 4; margin-top: -5px; color: var(--muted); font-size: .65rem; }
.pie-skeleton { min-height: 172px; }

@media (max-width: 560px) {
  .pie-layout { grid-template-columns: 136px minmax(0, 1fr); gap: 10px; }
  .pie-chart { width: 136px; }
}

@media (max-width: 380px) {
  .pie-layout { grid-template-columns: 1fr; gap: 10px; }
  .pie-chart { width: 136px; }
  .pie-legend { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
}
</style>
