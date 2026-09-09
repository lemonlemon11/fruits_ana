<script setup lang="ts">
import { computed } from 'vue'

import type { TrendPoint } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatCurrency, formatDate, formatNumber, formatPrice } from '../utils/format'

const props = defineProps<{
  points: TrendPoint[]
  loading?: boolean
  title?: string
}>()

const maxQuantity = computed(() => Math.max(...props.points.map((point) => point.salesQuantity), 1))
const maxPrice = computed(() => Math.max(...props.points.map((point) => point.weightedAvgPrice ?? 0), 1))

function quantityWidth(quantity: number): string {
  return `${Math.max((quantity / maxQuantity.value) * 100, quantity ? 1.5 : 0)}%`
}

function pricePosition(price: number | null): string {
  return `${Math.min(((price ?? 0) / maxPrice.value) * 100, 100)}%`
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="trend-title">
    <header class="section-heading">
      <div>
        <p class="eyebrow">DAILY PULSE</p>
        <h2 id="trend-title">{{ title ?? '每日量价趋势' }}</h2>
      </div>
      <div class="chart-legend" aria-label="图例">
        <span class="legend-a">A果</span><span class="legend-b">B果</span><span class="legend-c">C果（含BC）</span>
      </div>
    </header>

    <div v-if="loading" class="trend-skeleton skeleton-block" aria-live="polite">正在加载趋势数据</div>
    <div v-else-if="!points.length" class="empty-state">
      <strong>当前范围没有趋势数据</strong>
      <span>调整日期或货柜筛选后重试。</span>
    </div>
    <template v-else>
      <div
        class="trend-plot"
        role="img"
        :aria-label="`${points.length} 天销量及加权均价趋势。最高日销量 ${formatNumber(maxQuantity)}`"
      >
        <div class="trend-axis" aria-hidden="true"><span>日期</span><span>销量（按最高日归一）</span><span>均价</span></div>
        <div v-for="point in points" :key="point.date" class="trend-row">
          <time :datetime="point.date">{{ formatDate(point.date) }}</time>
          <div class="volume-track" :title="`总销量 ${formatNumber(point.salesQuantity)}`">
            <span
              v-for="grade in point.grades"
              :key="grade.grade"
              :class="`fill-${grade.grade.toLowerCase()}`"
              :style="{ width: quantityWidth(grade.salesQuantity) }"
              :title="`${gradeLabel(grade.grade)} ${formatNumber(grade.salesQuantity)}`"
            />
          </div>
          <div class="price-track" :title="`加权均价 ${formatPrice(point.weightedAvgPrice)}`">
            <span :style="{ left: pricePosition(point.weightedAvgPrice) }" />
            <strong>{{ formatPrice(point.weightedAvgPrice) }}</strong>
          </div>
        </div>
      </div>

      <details class="data-details">
        <summary>查看趋势数据表</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>销量</th><th>销售额</th><th>加权均价</th></tr></thead>
            <tbody>
              <tr v-for="point in points" :key="point.date">
                <td>{{ point.date }}</td><td>{{ formatNumber(point.salesQuantity) }}</td>
                <td>{{ formatCurrency(point.salesAmount) }}</td><td>{{ formatPrice(point.weightedAvgPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </section>
</template>
