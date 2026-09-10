<script setup lang="ts">
import { gradeLabel } from '../api/client'
import type { Grade, SeriesAggregate, SeriesComparisonItem } from '../api/types'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { gradeOf, gradeRow, shortLabel } from '../utils/seriesComparison'

const props = defineProps<{
  items: SeriesComparisonItem[]
  total: SeriesAggregate
}>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const percent = (value: number | null | undefined) => formatPercent(value ?? null)
const totalGrade = (grade: Grade) => gradeRow(props.total.grades, grade)
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-grade-title">
    <header class="section-heading">
      <div>
        <h2 id="series-grade-title">A/B/C 独立对比</h2>
        <p class="section-note">每个等级单独核算件数、金额、平均每件售价与金额占比</p>
      </div>
    </header>

    <div class="grade-tables">
      <article v-for="grade in gradeOrder" :key="grade" class="grade-table-card">
        <h3>{{ gradeLabel(grade) }}</h3>
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{{ gradeLabel(grade) }}在各结算单的件数、金额、平均每件售价与金额占比</caption>
            <thead>
              <tr>
                <th scope="col">单号</th>
                <th scope="col">件数</th>
                <th scope="col">金额</th>
                <th scope="col">平均每件售价</th>
                <th scope="col">金额占比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.merchantNo">
                <th scope="row">{{ shortLabel(item) }}</th>
                <td>{{ formatNumber(gradeOf(item, grade)?.salesQuantity ?? 0) }}</td>
                <td>{{ formatCurrency(gradeOf(item, grade)?.salesAmount ?? 0) }}</td>
                <td>{{ formatPrice(gradeOf(item, grade)?.weightedAvgPrice ?? null) }}</td>
                <td>{{ percent(item.gradeAmountShares[grade]) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">合计</th>
                <td>{{ formatNumber(totalGrade(grade).salesQuantity) }}</td>
                <td>{{ formatCurrency(totalGrade(grade).salesAmount) }}</td>
                <td>{{ formatPrice(totalGrade(grade).weightedAvgPrice) }}</td>
                <td>{{ percent(total.gradeAmountShares[grade]) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    </div>
  </section>

  <section class="dashboard-section" aria-labelledby="series-spread-title">
    <header class="section-heading">
      <div>
        <h2 id="series-spread-title">等级价差</h2>
        <p class="section-note">按平均每件售价计算，缺等级的结算单显示暂无数据</p>
      </div>
    </header>
    <div class="table-wrap">
      <table>
        <caption class="sr-only">各结算单的 A、B、C 平均每件售价与价差</caption>
        <thead>
          <tr>
            <th scope="col">单号</th>
            <th v-for="grade in gradeOrder" :key="grade" scope="col">{{ gradeLabel(grade) }}均价</th>
            <th scope="col">A-B 价差</th>
            <th scope="col">B-C 价差</th>
            <th scope="col">B 比 A 折价</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.merchantNo">
            <th scope="row">{{ shortLabel(item) }}</th>
            <td v-for="grade in gradeOrder" :key="grade">{{ formatPrice(item.spread.gradePrices[grade]) }}</td>
            <td>{{ formatPrice(item.spread.aMinusB) }}</td>
            <td>{{ formatPrice(item.spread.bMinusC) }}</td>
            <td>{{ percent(item.spread.bDiscountVsA) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">合计</th>
            <td v-for="grade in gradeOrder" :key="grade">{{ formatPrice(total.spread.gradePrices[grade]) }}</td>
            <td>{{ formatPrice(total.spread.aMinusB) }}</td>
            <td>{{ formatPrice(total.spread.bMinusC) }}</td>
            <td>{{ percent(total.spread.bDiscountVsA) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>

<style scoped>
.grade-tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.grade-table-card { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.grade-table-card h3 { margin: 0 0 8px; font-size: .92rem; }
table { width: 100%; min-width: 320px; border-collapse: collapse; }
th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: .8rem; }
thead th { color: var(--muted); font-weight: 500; }
tbody th, tfoot th { text-align: left; }
tfoot td, tfoot th { border-top: 2px solid var(--line); border-bottom: 0; font-weight: 700; }
</style>
