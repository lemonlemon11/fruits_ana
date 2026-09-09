<script setup lang="ts">
import type { GradeMetric, MetricTotal } from '../api/client'
import { gradeLabel } from '../api/client'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

defineProps<{
  grades: GradeMetric[]
  total: MetricTotal
  loading?: boolean
  title?: string
}>()
</script>

<template>
  <section class="dashboard-section" aria-labelledby="grade-summary-title">
    <header class="section-heading">
      <div>
        <p class="eyebrow">GRADE MIX</p>
        <h2 id="grade-summary-title">{{ title ?? '等级经营概览' }}</h2>
      </div>
      <p class="section-note">均价按销售额 ÷ 销量加权计算</p>
    </header>

    <div v-if="loading" class="grade-grid" aria-live="polite" aria-busy="true">
      <div v-for="grade in ['A', 'B', 'C']" :key="grade" class="grade-card skeleton-block">
        <span class="sr-only">正在加载{{ grade }}果数据</span>
      </div>
    </div>

    <template v-else>
      <div class="total-strip" aria-label="筛选范围汇总">
        <div>
          <span>总销量</span>
          <strong>{{ formatNumber(total.salesQuantity) }}</strong>
        </div>
        <div>
          <span>总销售额</span>
          <strong>{{ formatCurrency(total.salesAmount) }}</strong>
        </div>
        <div>
          <span>整体加权均价</span>
          <strong>{{ formatPrice(total.weightedAvgPrice) }}</strong>
        </div>
      </div>

      <div class="grade-grid">
        <article
          v-for="item in grades"
          :key="item.grade"
          class="grade-card"
          :class="`grade-${item.grade.toLowerCase()}`"
        >
          <header>
            <span class="grade-badge">{{ item.grade }}</span>
            <div>
              <h3>{{ gradeLabel(item.grade) }}</h3>
              <p>销量占比 {{ formatPercent(item.quantityShare) }}</p>
            </div>
          </header>
          <div class="share-track" aria-hidden="true">
            <span :style="{ width: `${Math.max(0, (item.quantityShare ?? 0) * 100)}%` }" />
          </div>
          <dl class="metric-list">
            <div>
              <dt>销量</dt>
              <dd>{{ formatNumber(item.salesQuantity) }}</dd>
            </div>
            <div>
              <dt>销售额</dt>
              <dd>{{ formatCurrency(item.salesAmount) }}</dd>
            </div>
            <div>
              <dt>加权均价</dt>
              <dd>{{ formatPrice(item.weightedAvgPrice) }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </template>
  </section>
</template>
