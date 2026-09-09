<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ContainerComparisonItem } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const props = defineProps<{
  items: ContainerComparisonItem[]
  loading?: boolean
}>()
const emit = defineEmits<{ select: [containerId: string] }>()
const sortBy = ref<'salesAmount' | 'salesQuantity' | 'weightedAvgPrice'>('salesAmount')

const sortedItems = computed(() => [...props.items].sort((left, right) => (
  (right[sortBy.value] ?? -1) - (left[sortBy.value] ?? -1)
)))
</script>

<template>
  <section class="dashboard-section" aria-labelledby="comparison-title">
    <header class="section-heading">
      <div>
        <p class="eyebrow">CONTAINER BENCHMARK</p>
        <h2 id="comparison-title">货柜横向对比（同一筛选范围）</h2>
      </div>
      <label class="compact-field">排序
        <select v-model="sortBy">
          <option value="salesAmount">销售额</option>
          <option value="salesQuantity">销量</option>
          <option value="weightedAvgPrice">加权均价</option>
        </select>
      </label>
    </header>

    <div v-if="loading" class="comparison-skeleton skeleton-block" aria-live="polite">正在加载货柜对比</div>
    <div v-else-if="!items.length" class="empty-state">
      <strong>当前范围没有货柜数据</strong>
      <span>导入结算单或调整筛选范围后再查看。</span>
    </div>
    <div v-else class="comparison-table-wrap">
      <div class="comparison-table" role="table" aria-label="不同货柜销售表现对比">
        <div class="comparison-table-row comparison-table-header" role="row">
          <span role="columnheader">货柜</span><span role="columnheader">销售额</span><span role="columnheader">销量</span><span role="columnheader">加权均价</span><span role="columnheader">A/B/C 销量结构</span><span role="columnheader">整体销量贡献</span>
        </div>
      <button
        v-for="item in sortedItems"
        :key="item.containerId"
        type="button"
        class="comparison-table-row container-row"
        :aria-label="`查看 ${item.containerName} 单柜诊断`"
        @click="emit('select', item.containerId)"
      >
        <span class="container-identity"><strong>销售额第{{ item.rank?.salesAmount ?? '—' }}名 · {{ item.containerName }}</strong><small>{{ item.containerId }}</small></span>
        <strong class="compare-amount">{{ formatCurrency(item.salesAmount) }}</strong>
        <strong class="compare-quantity">{{ formatNumber(item.salesQuantity) }}</strong>
        <strong class="compare-price">{{ formatPrice(item.weightedAvgPrice) }}</strong>
        <span class="grade-structure">
          <span class="structure-track" aria-hidden="true">
            <i
              v-for="grade in item.grades"
              :key="grade.grade"
              :class="`fill-${grade.grade.toLowerCase()}`"
              :style="{ width: `${Math.max(0, (grade.quantityShare ?? 0) * 100)}%` }"
            />
          </span>
          <small>{{ item.grades.map((grade) => `${grade.grade} ${formatPercent(grade.quantityShare)}`).join(' · ') }}</small>
        </span>
        <strong class="compare-share">{{ formatPercent(item.salesQuantityShare) }}</strong>
        <span class="row-arrow" aria-hidden="true">›</span>
      </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.comparison-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.comparison-table { min-width: 860px; }
.comparison-table-row { display: grid; grid-template-columns: 1.35fr .9fr .7fr .8fr 1.55fr .85fr 24px; align-items: center; gap: 12px; min-height: 68px; padding: 10px 12px; border-top: 1px solid var(--line); }
.comparison-table-header { min-height: 38px; border-top: 0; background: var(--surface-soft); color: var(--muted); font-size: .68rem; font-weight: 700; }
.comparison-table-header span:not(:first-child) { text-align: right; }
.comparison-table-row > strong { text-align: right; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .78rem; font-variant-numeric: tabular-nums; }
.comparison-table-row .grade-structure { min-width: 0; }
.comparison-table-row .grade-structure small { white-space: nowrap; }
.comparison-table-row .container-identity small { color: var(--muted); font-size: .65rem; }
.comparison-table-row .row-arrow { text-align: center; }
@media (max-width: 560px) {
  .comparison-table { min-width: 820px; }
  .comparison-table-row { gap: 9px; padding-inline: 10px; }
}
</style>
