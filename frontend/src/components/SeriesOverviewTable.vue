<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { displayOrderNo, rawOrderNo } from '../utils/orderNo'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import { gradeOf } from '../utils/seriesComparison'
import ChartTooltip from './ChartTooltip.vue'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{
  items: SeriesComparisonItem[]
  loading?: boolean
}>()

const gradeOrder = computed(() => activeGrades(props.items.flatMap((item) => item.grades)))
const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()
const quantity = (item: SeriesComparisonItem, grade: Grade) => gradeOf(item, grade).salesQuantity
/** 表格与提示里回溯填写人员原始写法的 tooltip 文案。 */
function rawTrace(item: SeriesComparisonItem): string {
  const parts = []
  if (rawMerchantNo(item) && rawMerchantNo(item) !== displayMerchantNo(item)) {
    parts.push(`原始商号：${rawMerchantNo(item)}`)
  }
  if (rawOrderNo(item) && rawOrderNo(item) !== displayOrderNo(item)) {
    parts.push(`原始单号：${rawOrderNo(item)}`)
  }
  return parts.join(' / ')
}
const quantityShare = (item: SeriesComparisonItem, grade: Grade) => gradeOf(item, grade).quantityShare

/** 占比条宽度：占比本身就是 0~1，直接当百分比用，零值留 2% 让空数据也能看见位置。 */
function shareWidth(value: number | null): string {
  if (value === null || value <= 0) return '0%'
  return `${Math.max(Math.min(value, 1) * 100, 2)}%`
}

const rowKey = (item: SeriesComparisonItem) => item.merchantNo

const GRADE_PREFIX = 'grade-'
const isGradeColumn = (column: DataTableColumn<SeriesComparisonItem>) => column.key.startsWith(GRADE_PREFIX)
const gradeOfColumn = (key: string) => key.slice(GRADE_PREFIX.length) as Grade

/** 列由等级动态生成：身份列在前，各等级一列同时给出件数与占比，最后是总量列。 */
const columns = computed<DataTableColumn<SeriesComparisonItem>[]>(() => [
  { key: 'merchant', label: '商号', emphasis: true, align: 'center', value: (item) => displayMerchantNo(item) },
  { key: 'series', label: '品牌', align: 'center', value: (item) => item.series },
  ...gradeOrder.value.map((grade) => ({
    key: `grade-${grade}`,
    label: gradeLabel(grade),
    numeric: true,
    align: 'center',
    value: (item: SeriesComparisonItem) => formatNumber(quantity(item, grade)),
  })),
  {
    key: 'totalQuantity',
    label: '总件数',
    numeric: true,
    align: 'center',
    value: (item) => formatNumber(item.total.salesQuantity),
  },
  {
    key: 'totalAmount',
    label: '总金额',
    numeric: true,
    align: 'center',
    value: (item) => formatCurrency(item.total.salesAmount),
  },
])

function showGradeTooltip(event: MouseEvent, item: SeriesComparisonItem, grade: Grade) {
  const orderNo = displayOrderNo(item)
  showTooltip(event, {
    title: `${displayMerchantNo(item)}${orderNo ? ` · ${orderNo}` : ''}`,
    rows: [
      { label: `${gradeLabel(grade)}件数`, value: `${formatNumber(quantity(item, grade))} 件`, color: gradeColors[grade] },
      { label: `${gradeLabel(grade)}占比`, value: formatPercent(quantityShare(item, grade)) },
    ],
    note: '占比 = 该等级件数 ÷ 该结算单总件数',
  })
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-overview-title">
    <header class="section-heading">
      <div>
        <h2 id="series-overview-title">所选结算单总览</h2>
        <p class="section-note">等级列为件数与占比（占比 = 该等级件数 ÷ 该单总件数）</p>
      </div>
    </header>

    <div v-if="loading" class="table-skeleton skeleton-block">正在加载总览</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>没有可展示的结算单</strong>
      <span>请调整销售日期范围或勾选结算单。</span>
    </div>
    <div v-else class="series-overview-results">
      <DataTable
        :columns="columns"
        :rows="items"
        :row-key="rowKey"
        caption="所选结算单（按商号识别）的各等级件数、占比与金额"
        min-width="560px"
        compact
      >
        <template #cell-merchant="{ row }">
          <span class="merchant-cell" :title="rawTrace(row)">
            <strong>{{ displayMerchantNo(row) }}</strong>
            <small>{{ displayOrderNo(row) || '—' }}</small>
          </span>
        </template>
        <template #cell="{ row, column, value }">
          <span
            v-if="isGradeColumn(column)"
            class="grade-cell"
            @mouseenter="showGradeTooltip($event, row, gradeOfColumn(column.key))"
            @mousemove="moveTooltip"
            @mouseleave="hideTooltip"
          >
            <strong>{{ value }}</strong>
            <span class="share-bar" aria-hidden="true">
              <i
                :style="{
                  width: shareWidth(quantityShare(row, gradeOfColumn(column.key))),
                  backgroundColor: gradeColors[gradeOfColumn(column.key)],
                }"
              />
            </span>
            <small>{{ formatPercent(quantityShare(row, gradeOfColumn(column.key))) }}</small>
          </span>
          <template v-else>{{ value }}</template>
        </template>
      </DataTable>
    </div>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.table-skeleton { min-height: 140px; }
/* 商号列：商号与单号同行展示，整表保持单行行高不换行。 */
.merchant-cell { display: inline-flex; align-items: baseline; gap: 6px; white-space: nowrap; }
.merchant-cell strong { font-size: .88rem; }
.merchant-cell small { color: var(--muted); font-size: .85rem; }
/* 等级列：件数、占比条、占比同行居中排布，一格紧凑给出两个数。
   占比条类名用 share-bar：全局 .share-track（GradeSummary 竖排卡片）自带 .88rem 上下边距，会撑高单行单元格。 */
.grade-cell { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.grade-cell strong { font-size: .88rem; }
.grade-cell .share-bar { width: 48px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.grade-cell .share-bar i { display: block; height: 100%; border-radius: 999px; }
.grade-cell small { color: var(--muted); font-size: .78rem; }
</style>
