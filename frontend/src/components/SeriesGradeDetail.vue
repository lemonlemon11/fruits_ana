<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, GradeDetailBucket, GradeDetailData } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import ChartLegend from './ChartLegend.vue'
import ChartTooltip from './ChartTooltip.vue'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{
  details: GradeDetailData
  loading?: boolean
}>()

const gradeOrder = computed(() => activeGrades(props.details.buckets))

interface GradeGroup {
  grade: Grade
  items: GradeDetailBucket[]
  quantity: number
  amount: number
  avgPrice: number | null
}

const groups = computed<GradeGroup[]>(() =>
  gradeOrder.value.map((grade) => {
    const items = props.details.buckets.filter((row) => row.grade === grade)
    const quantity = items.reduce((total, row) => total + row.salesQuantity, 0)
    const amount = items.reduce((total, row) => total + row.salesAmount, 0)
    return { grade, items, quantity, amount, avgPrice: quantity ? amount / quantity : null }
  }).filter((group) => group.items.length > 0),
)

const maxPrice = computed(() =>
  Math.max(1, ...props.details.buckets.map((row) => row.weightedAvgPrice ?? 0)),
)

const barWidth = (row: GradeDetailBucket) =>
  `${Math.max(2, ((row.weightedAvgPrice ?? 0) / maxPrice.value) * 100).toFixed(1)}%`

const hasUnrecognized = computed(() => props.details.unrecognized.recordCount > 0)

const bucketRowKey = (row: GradeDetailBucket) => row.label

const bucketColumns: DataTableColumn<GradeDetailBucket>[] = [
  { key: 'label', label: '等级', rowHeader: true, emphasis: true },
  { key: 'quantity', label: '件数', numeric: true, value: (row) => formatNumber(row.salesQuantity) },
  { key: 'amount', label: '金额', numeric: true, value: (row) => formatCurrency(row.salesAmount) },
  { key: 'price', label: '平均每公斤售价', numeric: true, value: (row) => formatPrice(row.weightedAvgPrice) },
  { key: 'quantityShare', label: '件数占比', numeric: true, value: (row) => formatPercent(row.quantityShare) },
  { key: 'amountShare', label: '金额占比', numeric: true, value: (row) => formatPercent(row.amountShare) },
]

const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()
const legendItems = computed(() => gradeOrder.value.map((grade) => ({
  label: gradeLabel(grade),
  color: gradeColors[grade],
  variant: 'dot' as const,
})))

function showBucketTooltip(event: MouseEvent, row: GradeDetailBucket) {
  showTooltip(event, {
    title: `${row.label} · ${gradeLabel(row.grade)}`,
    rows: [
      { label: '平均每公斤售价', value: formatPrice(row.weightedAvgPrice), color: gradeColors[row.grade] },
      { label: '件数', value: `${formatNumber(row.salesQuantity)} 件` },
      { label: '金额', value: formatCurrency(row.salesAmount) },
      { label: '件数占比', value: formatPercent(row.quantityShare) },
    ],
    note: row.qualityMarks.length ? `品质标记：${row.qualityMarks.join('、')}` : '条形长度按平均每公斤售价绘制',
  })
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="grade-detail-title">
    <header class="section-heading">
      <div>
        <h2 id="grade-detail-title">按等级号别看价格</h2>
        <p class="section-note">
          把等级再拆成号别。带斜杠的（如 B6/7）是一段区间，原样保留，不拆分；条形长度代表平均每公斤售价。
        </p>
      </div>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="skeleton-block grade-detail-skeleton" aria-live="polite">
      正在加载等级阶梯
    </div>

    <div v-else-if="!details.buckets.length" class="empty-state compact">
      <strong>暂时没有可细分的等级</strong>
      <span>勾选结算单后，这里会按号别列出件数、金额与平均每公斤售价。</span>
    </div>

    <template v-else>
      <div class="grade-ladder">
        <article
          v-for="group in groups"
          :key="group.grade"
          class="ladder-group"
          :class="`ladder-${group.grade.toLowerCase()}`"
        >
          <p class="ladder-head">
            <span class="ladder-dot" aria-hidden="true"></span>
            <strong>{{ gradeLabel(group.grade) }}</strong>
            <span class="ladder-sum">
              {{ formatNumber(group.quantity) }} 件 · {{ formatCurrency(group.amount) }} ·
              平均每公斤售价 {{ formatPrice(group.avgPrice) }}
            </span>
          </p>
          <div
            v-for="row in group.items"
            :key="row.label"
            class="ladder-row"
            @mouseenter="showBucketTooltip($event, row)"
            @mousemove="moveTooltip"
            @mouseleave="hideTooltip"
          >
            <span class="ladder-label">{{ row.label }}</span>
            <div class="ladder-track">
              <div
                class="ladder-bar"
                :style="{ width: barWidth(row) }"
                role="img"
                :aria-label="`${row.label} 平均每公斤售价 ${formatPrice(row.weightedAvgPrice)}`"
              ></div>
            </div>
            <span class="ladder-price">{{ formatPrice(row.weightedAvgPrice) }}</span>
            <span class="ladder-qty">
              {{ formatNumber(row.salesQuantity) }} 件
              <span v-if="row.qualityMarks.length" class="ladder-marks">
                {{ row.qualityMarks.join('、') }}
              </span>
            </span>
          </div>
        </article>
      </div>

      <p v-if="hasUnrecognized" class="grade-detail-warning">
        有 {{ formatNumber(details.unrecognized.recordCount) }} 行等级写法无法识别，
        已单独归入「{{ details.unrecognized.label }}」，未计入上面的阶梯。
      </p>

      <details class="table-details">
        <summary>查看数据表</summary>
        <DataTable
          :columns="bucketColumns"
          :rows="details.buckets"
          :row-key="bucketRowKey"
          caption="各细分等级的件数、金额、平均每公斤售价与占比"
          min-width="480px"
          cards-on-narrow
        />
      </details>
    </template>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.grade-detail-skeleton { min-height: 160px; }
.grade-ladder { display: grid; gap: 14px; }
.ladder-group { min-width: 0; display: grid; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.ladder-group + .ladder-group { margin-top: 0; }
.ladder-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 0 0 4px; }
.ladder-sum { color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
.ladder-dot { width: 10px; height: 10px; border-radius: 50%; }
.ladder-a .ladder-dot, .ladder-a .ladder-bar { background: var(--grade-a); }
.ladder-b .ladder-dot, .ladder-b .ladder-bar { background: var(--grade-b); }
.ladder-c .ladder-dot, .ladder-c .ladder-bar { background: var(--grade-c); }
.ladder-row { display: grid; grid-template-columns: 76px minmax(0, 1fr) 108px 168px; align-items: center; gap: 10px; }
.ladder-label { font-size: .9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.ladder-track { height: 20px; border-radius: 3px; background: var(--surface-soft); overflow: hidden; }
.ladder-bar { height: 100%; border-radius: 3px 0 0 3px; }
.ladder-price { text-align: right; white-space: nowrap; font-size: .9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.ladder-qty { text-align: right; white-space: nowrap; color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
.ladder-marks { margin-left: 6px; padding: 1px 6px; border: 1px solid var(--line-strong); border-radius: 999px; font-size: .78rem; white-space: nowrap; }
.grade-detail-warning { margin: 0; padding: 10px 12px; border-left: 4px solid var(--warning); background: #fff7df; font-size: .9rem; }
.table-details summary { display: flex; align-items: center; min-height: 44px; color: var(--primary-dark); font-weight: 700; cursor: pointer; }

@media (max-width: 720px) {
  .ladder-row { grid-template-columns: 62px minmax(0, 1fr) 96px; }
  .ladder-qty { grid-column: 2 / -1; text-align: right; margin-top: -4px; }
}
</style>
