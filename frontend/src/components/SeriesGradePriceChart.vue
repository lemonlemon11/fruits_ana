<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { formatPrice } from '../utils/format'
import { gradePrice, shortLabel } from '../utils/seriesComparison'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }

const maxPrice = computed(() =>
  Math.max(
    0,
    ...props.items.flatMap((item) =>
      gradeOrder.map((grade) => gradePrice(item, grade) ?? 0),
    ),
  ),
)

const groups = computed(() =>
  gradeOrder.map((grade) => ({
    grade,
    color: gradeColors[grade],
    bars: props.items.map((item) => ({
      label: shortLabel(item),
      value: gradePrice(item, grade),
    })),
  })),
)

function barHeight(value: number | null): string {
  if (!maxPrice.value || value === null) return '0%'
  return `${Math.max((value / maxPrice.value) * 100, 3)}%`
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-price-title">
    <header class="section-heading">
      <div>
        <h2 id="series-price-title">A/B/C 平均每件售价对比</h2>
        <p class="section-note">同一等级内比较所选结算单，柱越高售价越高</p>
      </div>
    </header>

    <div v-if="loading" class="chart-skeleton skeleton-block">正在加载价格对比</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>在上方勾选两个及以上结算单后即可对比。</span>
    </div>
    <div v-else class="price-chart">
      <div v-for="group in groups" :key="group.grade" class="price-group">
        <span class="price-group-label">{{ gradeLabel(group.grade) }}</span>
        <div class="price-bars">
          <div v-for="bar in group.bars" :key="bar.label" class="price-bar-item">
            <span class="price-bar-value">{{ formatPrice(bar.value) }}</span>
            <span
              class="price-bar"
              :style="{ height: barHeight(bar.value), backgroundColor: group.color }"
            />
            <small>{{ bar.label }}</small>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.price-chart { display: grid; gap: 18px; }
.price-group { display: grid; gap: 8px; min-width: 0; }
.price-group-label { color: var(--muted); font-size: .78rem; }
.price-bars { display: flex; align-items: flex-end; gap: 10px; min-height: 132px; min-width: 0; overflow-x: auto; }
.price-bar-item { display: grid; grid-template-rows: auto 1fr auto; align-items: end; justify-items: center; gap: 4px; min-width: 62px; flex: 1 1 62px; }
.price-bar-value { font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .72rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.price-bar { width: 100%; max-width: 54px; min-height: 2px; border-radius: 4px 4px 0 0; transition: height 240ms ease; }
.price-bar-item small { overflow-wrap: anywhere; color: var(--muted); font-size: .68rem; text-align: center; }
.chart-skeleton { min-height: 172px; }
</style>
