<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { formatNumber, formatPercent } from '../utils/format'
import { gradeOf, shortLabel } from '../utils/seriesComparison'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }

const rows = computed(() =>
  props.items.map((item) => {
    const total = gradeOrder.reduce(
      (sum, grade) => sum + (gradeOf(item, grade)?.salesQuantity ?? 0),
      0,
    )
    return {
      label: shortLabel(item),
      series: item.series,
      segments: gradeOrder.map((grade) => {
        const quantity = gradeOf(item, grade)?.salesQuantity ?? 0
        return {
          grade,
          color: gradeColors[grade],
          quantity,
          share: total ? quantity / total : 0,
        }
      }),
    }
  }),
)
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-share-title">
    <header class="section-heading">
      <div>
        <h2 id="series-share-title">各结算单等级件数占比</h2>
        <p class="section-note">条越长代表该等级件数越多</p>
      </div>
    </header>

    <div v-if="loading" class="chart-skeleton skeleton-block">正在加载等级占比</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>勾选结算单后即可查看等级结构。</span>
    </div>
    <div v-else class="share-chart">
      <div v-for="row in rows" :key="row.label" class="share-row">
        <span class="share-label">
          <strong>{{ row.label }}</strong>
          <small>{{ row.series }}</small>
        </span>
        <span class="share-track">
          <span
            v-for="segment in row.segments"
            :key="segment.grade"
            class="share-segment"
            :style="{ width: `${segment.share * 100}%`, backgroundColor: segment.color }"
            :title="`${gradeLabel(segment.grade)} ${formatPercent(segment.share)} · ${formatNumber(segment.quantity)} 件`"
          />
        </span>
        <span class="share-legend">
          <span v-for="segment in row.segments" :key="segment.grade">
            <i :style="{ backgroundColor: segment.color }" aria-hidden="true" />{{ gradeLabel(segment.grade) }}
            {{ formatPercent(segment.share) }}
          </span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.share-chart { display: grid; gap: 14px; }
.share-row { display: grid; grid-template-columns: minmax(120px, .8fr) minmax(160px, 1.4fr) minmax(180px, 1.4fr); align-items: center; gap: 14px; min-width: 0; }
.share-label { display: grid; gap: 2px; min-width: 0; }
.share-label strong { overflow-wrap: anywhere; font-size: .92rem; }
.share-label small { color: var(--muted); font-size: .7rem; }
.share-track { display: flex; height: 16px; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.share-segment { height: 100%; transition: width 240ms ease; }
.share-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; min-width: 0; font-size: .72rem; }
.share-legend span { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); }
.share-legend i { width: 8px; height: 8px; border-radius: 50%; }
.chart-skeleton { min-height: 172px; }

@media (max-width: 720px) {
  .share-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
}
</style>
