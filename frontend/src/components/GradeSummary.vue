<script setup lang="ts">
import type { GradeMetric, MetricTotal } from '../api/client'
import { gradeLabel } from '../api/client'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import ChartTooltip from './ChartTooltip.vue'

defineProps<{
  grades: GradeMetric[]
  total: MetricTotal
  loading?: boolean
  title?: string
}>()

const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()

const gradeColors: Record<string, string> = {
  A: 'var(--grade-a)',
  B: 'var(--grade-b)',
  C: 'var(--grade-c)',
}

function showShareTooltip(event: MouseEvent, item: GradeMetric) {
  showTooltip(event, {
    title: gradeLabel(item.grade),
    rows: [
      { label: '销量占比', value: formatPercent(item.quantityShare), color: gradeColors[item.grade] },
      { label: '销量', value: `${formatNumber(item.salesQuantity)} 件` },
      { label: '销售额', value: formatCurrency(item.salesAmount) },
      { label: '平均每千克售价', value: formatPrice(item.weightedAvgPrice) },
    ],
    note: '占比 = 该等级销量 ÷ 总销量',
  })
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="grade-summary-title">
    <header class="section-heading">
      <h2 id="grade-summary-title">{{ title ?? '等级销售情况' }}</h2>
      <p class="section-note">平均每千克售价 = 销售额 ÷ 销量（千克）</p>
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
          <span>平均每千克售价</span>
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
          <div
            class="share-track"
            role="img"
            :aria-label="`${gradeLabel(item.grade)} 销量占比 ${formatPercent(item.quantityShare)}`"
            @mouseenter="showShareTooltip($event, item)"
            @mousemove="moveTooltip"
            @mouseleave="hideTooltip"
          >
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
              <dt>平均每千克售价</dt>
              <dd>{{ formatPrice(item.weightedAvgPrice) }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </template>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
/* 占比条只有 5px 高，用透明覆盖层把悬浮命中区放大到可点范围。 */
.grade-card .share-track { position: relative; }
.grade-card .share-track::after { content: ''; position: absolute; inset: -10px 0; }
</style>
