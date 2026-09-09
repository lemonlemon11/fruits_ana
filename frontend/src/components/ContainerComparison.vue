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
        <h2 id="comparison-title">货柜等级结构与均价对比</h2>
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
    <div v-else class="comparison-list">
      <button
        v-for="item in sortedItems"
        :key="item.containerId"
        type="button"
        class="container-row"
        :aria-label="`查看 ${item.containerName} 单柜诊断`"
        @click="emit('select', item.containerId)"
      >
        <span class="container-identity">
          <strong>销售额第{{ item.rank?.salesAmount ?? '—' }}名 · {{ item.containerName }}</strong>
          <small>{{ formatNumber(item.salesQuantity) }} 销量 · {{ formatCurrency(item.salesAmount) }}</small>
        </span>
        <span class="grade-structure">
          <span class="structure-track" aria-hidden="true">
            <i
              v-for="grade in item.grades"
              :key="grade.grade"
              :class="`fill-${grade.grade.toLowerCase()}`"
              :style="{ width: `${Math.max(0, (grade.quantityShare ?? 0) * 100)}%` }"
            />
          </span>
          <small>{{ item.grades.map((grade) => `${grade.grade} ${formatPercent(grade.quantityShare)}`).join(' · ') }} · 整体销量贡献 {{ formatPercent(item.salesQuantityShare) }}</small>
        </span>
        <span class="grade-prices">
          <span v-for="grade in item.grades" :key="grade.grade">
            <small>{{ gradeLabel(grade.grade) }}</small><strong>{{ formatPrice(grade.weightedAvgPrice) }}</strong>
          </span>
        </span>
        <span class="row-arrow" aria-hidden="true">›</span>
      </button>
    </div>
  </section>
</template>
