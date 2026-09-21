<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesAggregate, SeriesComparisonItem } from '../api/types'
import { activeGrades, gradeColors } from '../utils/grades'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatCurrency, formatDate, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { displayOrderNo, rawOrderNo } from '../utils/orderNo'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import { gradeOf, gradeRow } from '../utils/seriesComparison'
import ChartTooltip from './ChartTooltip.vue'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{
  items: SeriesComparisonItem[]
  total: SeriesAggregate
  loading?: boolean
}>()

const gradeOrder = computed(() =>
  activeGrades([
    ...props.items.flatMap((item) => item.grades),
    ...props.total.grades,
  ]),
)
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
const totalGrade = (grade: Grade) => gradeRow(props.total.grades, grade)

/** 占比条宽度：占比本身就是 0~1，直接当百分比用，零值留 2% 让空数据也能看见位置。 */
function shareWidth(value: number | null): string {
  if (value === null || value <= 0) return '0%'
  return `${Math.max(Math.min(value, 1) * 100, 2)}%`
}

const rowKey = (item: SeriesComparisonItem) => item.merchantNo

const SHARE_PREFIX = 'share-'
const shareKey = (grade: Grade) => `${SHARE_PREFIX}${grade}`
const isShareColumn = (column: DataTableColumn<SeriesComparisonItem>) => column.key.startsWith(SHARE_PREFIX)
const gradeOfShareColumn = (key: string) => key.slice(SHARE_PREFIX.length) as Grade

/** 列由等级动态生成：先身份列，再各等级件数、总计列，最后各等级占比。 */
const columns = computed<DataTableColumn<SeriesComparisonItem>[]>(() => {
  const quantityColumns: DataTableColumn<SeriesComparisonItem>[] = gradeOrder.value.map((grade) => ({
    key: `grade-${grade}`,
    label: `${gradeLabel(grade)}件数`,
    numeric: true,
    value: (item) => formatNumber(quantity(item, grade)),
    foot: () => formatNumber(totalGrade(grade).salesQuantity),
  }))
  const shareColumns: DataTableColumn<SeriesComparisonItem>[] = gradeOrder.value.map((grade) => ({
    key: shareKey(grade),
    label: `${gradeLabel(grade)}占比`,
    numeric: true,
    value: (item) => formatPercent(quantityShare(item, grade)),
    foot: () => formatPercent(totalGrade(grade).quantityShare),
  }))
  return [
    { key: 'merchant', label: '商号', rowHeader: true, emphasis: true, value: (item) => displayMerchantNo(item) },
    { key: 'series', label: '品牌', value: (item) => item.series, foot: () => `${props.items.length} 张结算单` },
    { key: 'startDate', label: '销售日期', value: (item) => formatDate(item.startDate) },
    ...quantityColumns,
    {
      key: 'totalQuantity',
      label: '总件数',
      numeric: true,
      value: (item) => formatNumber(item.total.salesQuantity),
      foot: () => formatNumber(props.total.total.salesQuantity),
    },
    {
      key: 'totalAmount',
      label: '总金额',
      numeric: true,
      value: (item) => formatCurrency(item.total.salesAmount),
      foot: () => formatCurrency(props.total.total.salesAmount),
    },
    {
      key: 'avgPrice',
      label: '每件均价',
      numeric: true,
      value: (item) => formatPrice(item.total.weightedAvgPrice),
      foot: () => formatPrice(props.total.total.weightedAvgPrice),
    },
    ...shareColumns,
  ]
})

function showShareTooltip(event: MouseEvent, item: SeriesComparisonItem, grade: Grade) {
  const orderNo = displayOrderNo(item)
  showTooltip(event, {
    title: `${displayMerchantNo(item)}${orderNo ? ` · ${orderNo}` : ''}`,
    rows: [
      { label: `${gradeLabel(grade)}占比`, value: formatPercent(quantityShare(item, grade)), color: gradeColors[grade] },
      { label: `${gradeLabel(grade)}件数`, value: `${formatNumber(quantity(item, grade))} 件` },
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
        <p class="section-note">按销售日期排列，末行为合计</p>
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
        caption="所选结算单（按商号识别）的各等级件数、金额与占比"
        min-width="900px"
        foot-label="合计"
      >
        <template #cell-merchant="{ row }">
          <span class="merchant-cell" :title="rawTrace(row)">
            <strong>{{ displayMerchantNo(row) }}</strong>
            <small>{{ displayOrderNo(row) || '—' }}</small>
          </span>
        </template>
        <template #cell="{ row, column, value }">
          <span
            v-if="isShareColumn(column)"
            class="share-cell"
            @mouseenter="showShareTooltip($event, row, gradeOfShareColumn(column.key))"
            @mousemove="moveTooltip"
            @mouseleave="hideTooltip"
          >
            <span class="share-track" aria-hidden="true">
              <i
                :style="{
                  width: shareWidth(quantityShare(row, gradeOfShareColumn(column.key))),
                  backgroundColor: gradeColors[gradeOfShareColumn(column.key)],
                }"
              />
            </span>
            <span>{{ value }}</span>
          </span>
          <template v-else>{{ value }}</template>
        </template>
      </DataTable>

      <div class="mobile-series-cards">
        <article v-for="item in items" :key="item.merchantNo" class="mobile-series-card">
          <header>
            <div><strong>{{ displayMerchantNo(item) }}</strong><small>{{ displayOrderNo(item) || '未登记单号' }} · {{ item.series }}</small></div>
            <span>{{ formatDate(item.startDate) }}</span>
          </header>
          <div class="mobile-series-kpis">
            <span><small>总件数</small><strong>{{ formatNumber(item.total.salesQuantity) }}</strong></span>
            <span><small>总金额</small><strong>{{ formatCurrency(item.total.salesAmount) }}</strong></span>
            <span><small>每件均价</small><strong>{{ formatPrice(item.total.weightedAvgPrice) }}</strong></span>
          </div>
          <dl>
            <div v-for="grade in gradeOrder" :key="grade">
              <dt>{{ gradeLabel(grade) }}件数</dt><dd>{{ formatNumber(quantity(item, grade)) }}</dd>
              <dt>{{ gradeLabel(grade) }}占比</dt><dd>{{ formatPercent(quantityShare(item, grade)) }}</dd>
            </div>
          </dl>
        </article>
        <article class="mobile-series-card mobile-series-total">
          <header><strong>合计</strong><span>{{ items.length }} 张结算单</span></header>
          <div class="mobile-series-kpis">
            <span><small>总件数</small><strong>{{ formatNumber(props.total.total.salesQuantity) }}</strong></span>
            <span><small>总金额</small><strong>{{ formatCurrency(props.total.total.salesAmount) }}</strong></span>
            <span><small>每件均价</small><strong>{{ formatPrice(props.total.total.weightedAvgPrice) }}</strong></span>
          </div>
          <dl>
            <div v-for="grade in gradeOrder" :key="grade">
              <dt>{{ gradeLabel(grade) }}件数</dt><dd>{{ formatNumber(totalGrade(grade).salesQuantity) }}</dd>
              <dt>{{ gradeLabel(grade) }}占比</dt><dd>{{ formatPercent(totalGrade(grade).quantityShare) }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </div>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.table-skeleton { min-height: 140px; }
/* 商号列：商号在上一行、单号在下，作为每行的阅读起点。 */
.merchant-cell { display: block; }
.merchant-cell strong { display: block; font-size: .88rem; }
.merchant-cell small { color: var(--muted); font-size: .85rem; }
/* 占比列：数字前面补一条占比条，把空出来的横向空间用起来。 */
.share-cell { display: inline-flex; align-items: center; gap: 8px; }
.share-track { width: 72px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.share-track i { display: block; height: 100%; border-radius: 999px; }
.mobile-series-cards { display: none; }

@media (max-width: 560px) {
  .series-overview-results { min-width: 0; }
  .series-overview-results :deep(.data-table) { display: none; }
  .mobile-series-cards { display: grid; gap: 8px; }
  .mobile-series-card { display: grid; gap: 7px; min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .mobile-series-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
  .mobile-series-card header div { display: grid; gap: 2px; min-width: 0; }
  .mobile-series-card header strong { overflow-wrap: anywhere; font-size: .92rem; line-height: 1.25; }
  .mobile-series-card header small { color: var(--muted); font-size: .7rem; line-height: 1.25; }
  .mobile-series-card header > span { flex: 0 0 auto; color: var(--primary-dark); font-size: .72rem; font-weight: 800; }
  .mobile-series-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
  .mobile-series-kpis span { display: grid; gap: 1px; min-width: 0; padding: 5px; border-radius: 7px; background: var(--surface-soft); }
  .mobile-series-kpis small { color: var(--muted); font-size: .68rem; }
  .mobile-series-kpis strong { overflow-wrap: anywhere; font-size: .82rem; }
  .mobile-series-card dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 0; }
  .mobile-series-card dl div { display: grid; gap: 2px; min-width: 0; }
  .mobile-series-card dt { color: var(--muted); font-size: .68rem; }
  .mobile-series-card dd { margin: 0; overflow-wrap: anywhere; font-size: .82rem; font-weight: 800; }
  .mobile-series-total { border-color: var(--primary); background: var(--primary-soft); }
}
</style>
