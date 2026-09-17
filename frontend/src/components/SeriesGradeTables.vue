<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesAggregate, SeriesComparisonItem } from '../api/types'
import { activeGrades } from '../utils/grades'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { gradeOf, gradeRow, shortLabel } from '../utils/seriesComparison'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{
  items: SeriesComparisonItem[]
  total: SeriesAggregate
}>()

const gradeOrder = computed(() =>
  activeGrades([
    ...props.items.flatMap((item) => item.grades),
    ...props.total.grades,
  ]),
)
const percent = (value: number | null | undefined) => formatPercent(value ?? null)
const rowKey = (item: SeriesComparisonItem) => item.merchantNo
const totalGrade = (grade: Grade) => gradeRow(props.total.grades, grade)

/** 每张卡片只服务一个等级，列取值按等级闭包，表格结构交给通用列表组件。 */
function columnsFor(grade: Grade): DataTableColumn<SeriesComparisonItem>[] {
  const gradeTotal = totalGrade(grade)
  return [
    { key: 'order', label: '单号', rowHeader: true, emphasis: true, value: (item) => shortLabel(item) },
    {
      key: 'quantity',
      label: '件数',
      numeric: true,
      value: (item) => formatNumber(gradeOf(item, grade)?.salesQuantity ?? 0),
      foot: () => formatNumber(gradeTotal.salesQuantity),
    },
    {
      key: 'amount',
      label: '金额',
      numeric: true,
      value: (item) => formatCurrency(gradeOf(item, grade)?.salesAmount ?? 0),
      foot: () => formatCurrency(gradeTotal.salesAmount),
    },
    {
      key: 'price',
      label: '平均每公斤售价',
      numeric: true,
      value: (item) => formatPrice(gradeOf(item, grade)?.weightedAvgPrice ?? null),
      foot: () => formatPrice(gradeTotal.weightedAvgPrice),
    },
    {
      key: 'share',
      label: '金额占比',
      numeric: true,
      value: (item) => percent(item.gradeAmountShares[grade]),
      foot: () => percent(props.total.gradeAmountShares[grade]),
    },
  ]
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-grade-title">
    <header class="section-heading">
      <div>
        <h2 id="series-grade-title">等级独立对比</h2>
        <p class="section-note">每个等级单独核算件数、金额、平均每公斤售价与金额占比</p>
      </div>
    </header>

    <div class="grade-tables">
      <article v-for="grade in gradeOrder" :key="grade" class="grade-table-card">
        <h3>{{ gradeLabel(grade) }}</h3>
        <DataTable
          :columns="columnsFor(grade)"
          :rows="items"
          :row-key="rowKey"
          :caption="`${gradeLabel(grade)}在各结算单的件数、金额、平均每公斤售价与金额占比`"
          min-width="320px"
          foot-label="合计"
          cards-on-narrow
        />
      </article>
    </div>
  </section>

</template>

<style scoped>
/* 卡片要放得下 5 列（单号/件数/金额/平均每公斤售价/金额占比），否则最后一列会被挤出去。 */
.grade-tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 14px; }
.grade-table-card { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.grade-table-card h3 { margin: 0 0 8px; font-size: .92rem; }

@media (max-width: 560px) {
  .grade-tables { grid-template-columns: minmax(0, 1fr); }
}
</style>
