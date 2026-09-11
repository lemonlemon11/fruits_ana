<script setup lang="ts">
import { gradeLabel } from '../api/client'
import type { Grade, SeriesAggregate, SeriesComparisonItem } from '../api/types'
import { formatCurrency, formatDate, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { gradeOf, gradeRow } from '../utils/seriesComparison'

const props = defineProps<{
  items: SeriesComparisonItem[]
  total: SeriesAggregate
  loading?: boolean
}>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }
const quantity = (item: SeriesComparisonItem, grade: Grade) => gradeOf(item, grade).salesQuantity
const quantityShare = (item: SeriesComparisonItem, grade: Grade) => gradeOf(item, grade).quantityShare
const totalGrade = (grade: Grade) => gradeRow(props.total.grades, grade)

/** 占比条宽度：占比本身就是 0~1，直接当百分比用，零值留 2% 让空数据也能看见位置。 */
function shareWidth(value: number | null): string {
  if (value === null || value <= 0) return '0%'
  return `${Math.max(Math.min(value, 1) * 100, 2)}%`
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
    <div v-else class="table-wrap">
      <table>
        <caption class="sr-only">所选结算单（按商号识别）的 A、B、C 件数、金额与占比</caption>
        <thead>
          <tr>
            <th scope="col">商号</th>
            <th scope="col">系列</th>
            <th scope="col">到达日期</th>
            <th v-for="grade in gradeOrder" :key="grade" scope="col">{{ gradeLabel(grade) }}件数</th>
            <th scope="col">总件数</th>
            <th scope="col">总金额</th>
            <th scope="col">平均每件售价</th>
            <th v-for="grade in gradeOrder" :key="`share-${grade}`" scope="col">{{ gradeLabel(grade) }}占比</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.merchantNo">
            <th scope="row">
              <strong>{{ item.merchantNo }}</strong>
              <small>{{ item.orderNo || '—' }}</small>
            </th>
            <td>{{ item.series }}</td>
            <td>{{ formatDate(item.startDate) }}</td>
            <td v-for="grade in gradeOrder" :key="grade">{{ formatNumber(quantity(item, grade)) }}</td>
            <td>{{ formatNumber(item.total.salesQuantity) }}</td>
            <td>{{ formatCurrency(item.total.salesAmount) }}</td>
            <td>{{ formatPrice(item.total.weightedAvgPrice) }}</td>
            <td v-for="grade in gradeOrder" :key="`share-${grade}`">
              <span class="share-cell">
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
  </section>
</template>

<style scoped>
.table-skeleton { min-height: 140px; }
table { width: 100%; min-width: 900px; border-collapse: collapse; }
th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: 1rem; }
thead th { color: var(--muted); font-weight: 500; }
tbody th, tfoot th { text-align: left; }
/* 「系列」「到达日期」是文字列，和其余页面的到达日期一样左对齐，避免数字表里夹着右对齐的文字。 */
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
</style>
