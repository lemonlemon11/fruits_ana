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
        <p class="section-note">按到达日期排列，末行为合计</p>
      </div>
    </header>

    <div v-if="loading" class="table-skeleton skeleton-block">正在加载总览</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>没有可展示的结算单</strong>
      <span>请调整到达日期范围或勾选结算单。</span>
    </div>
    <div v-else class="series-overview-results">
      <div class="table-wrap">
        <table>
          <caption class="sr-only">所选结算单（按商号识别）的各等级件数、金额与占比</caption>
          <thead>
            <tr>
              <th scope="col">商号</th>
              <th scope="col">品牌</th>
              <th scope="col">到达日期</th>
              <th v-for="grade in gradeOrder" :key="grade" scope="col">{{ gradeLabel(grade) }}件数</th>
              <th scope="col">总件数</th>
              <th scope="col">总金额</th>
              <th scope="col">平均每公斤售价</th>
              <th v-for="grade in gradeOrder" :key="`share-${grade}`" scope="col">{{ gradeLabel(grade) }}占比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.merchantNo">
              <th scope="row" :title="rawTrace(item)">
                <strong>{{ displayMerchantNo(item) }}</strong>
                <small>{{ displayOrderNo(item) || '—' }}</small>
              </th>
              <td>{{ item.series }}</td>
              <td>{{ formatDate(item.startDate) }}</td>
              <td v-for="grade in gradeOrder" :key="grade">{{ formatNumber(quantity(item, grade)) }}</td>
              <td>{{ formatNumber(item.total.salesQuantity) }}</td>
              <td>{{ formatCurrency(item.total.salesAmount) }}</td>
              <td>{{ formatPrice(item.total.weightedAvgPrice) }}</td>
              <td v-for="grade in gradeOrder" :key="`share-${grade}`">
                <span
                  class="share-cell"
                  @mouseenter="showShareTooltip($event, item, grade)"
                  @mousemove="moveTooltip"
                  @mouseleave="hideTooltip"
                >
                  <span class="share-track" aria-hidden="true">
                    <i
                      :style="{ width: shareWidth(quantityShare(item, grade)), backgroundColor: gradeColors[grade] }"
                    />
                  </span>
                  <span>{{ formatPercent(quantityShare(item, grade)) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合计</th>
              <td colspan="2">{{ items.length }} 张结算单</td>
              <td v-for="grade in gradeOrder" :key="grade">{{ formatNumber(totalGrade(grade).salesQuantity) }}</td>
              <td>{{ formatNumber(props.total.total.salesQuantity) }}</td>
              <td>{{ formatCurrency(props.total.total.salesAmount) }}</td>
              <td>{{ formatPrice(props.total.total.weightedAvgPrice) }}</td>
              <td v-for="grade in gradeOrder" :key="`total-share-${grade}`">
                {{ formatPercent(totalGrade(grade).quantityShare) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="mobile-series-cards">
        <article v-for="item in items" :key="item.merchantNo" class="mobile-series-card">
          <header>
            <div><strong>{{ displayMerchantNo(item) }}</strong><small>{{ displayOrderNo(item) || '未登记单号' }} · {{ item.series }}</small></div>
            <span>{{ formatDate(item.startDate) }}</span>
          </header>
          <div class="mobile-series-kpis">
            <span><small>总件数</small><strong>{{ formatNumber(item.total.salesQuantity) }}</strong></span>
            <span><small>总金额</small><strong>{{ formatCurrency(item.total.salesAmount) }}</strong></span>
            <span><small>平均每公斤售价</small><strong>{{ formatPrice(item.total.weightedAvgPrice) }}</strong></span>
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
            <span><small>平均每公斤售价</small><strong>{{ formatPrice(props.total.total.weightedAvgPrice) }}</strong></span>
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
table { width: 100%; min-width: 900px; border-collapse: collapse; }
th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: 1rem; }
thead th { color: var(--muted); font-weight: 500; }
tbody th, tfoot th { text-align: left; }
/* 「品牌」「到达日期」是文字列，和其余页面的到达日期一样左对齐，避免数字表里夹着右对齐的文字。 */
tbody td:nth-child(2), tbody td:nth-child(3) { text-align: left; }
tbody th strong { display: block; font-size: .88rem; }
tbody th small { color: var(--muted); font-size: .85rem; }
tfoot td, tfoot th { border-top: 2px solid var(--line); border-bottom: 0; font-weight: 700; }
tbody tr:hover { background: var(--surface-soft); }
/* 13 列在宽屏上容易散成一片数字，用竖线把「身份 / 件数 / 金额 / 占比」分成四组。 */
thead th:nth-child(4), thead th:nth-child(8), thead th:nth-child(10),
tbody td:nth-child(4), tbody td:nth-child(8), tbody td:nth-child(10) { border-left: 1px solid var(--line); }
/* 占比列：数字前面补一条占比条，把空出来的横向空间用起来。 */
.share-cell { display: inline-flex; align-items: center; gap: 8px; }
.share-track { width: 72px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.share-track i { display: block; height: 100%; border-radius: 999px; }
.mobile-series-cards { display: none; }

@media (max-width: 560px) {
  .series-overview-results { min-width: 0; }
  .series-overview-results .table-wrap { display: none; }
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
