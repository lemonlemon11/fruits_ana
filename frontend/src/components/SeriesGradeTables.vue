<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesAggregate, SeriesComparisonItem } from '../api/types'
import { activeGrades } from '../utils/grades'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'
import { gradeOf, gradeRow, shortLabel } from '../utils/seriesComparison'

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
const totalGrade = (grade: Grade) => gradeRow(props.total.grades, grade)
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
        <div class="table-wrap">
          <table>
            <caption class="sr-only">{{ gradeLabel(grade) }}在各结算单的件数、金额、平均每公斤售价与金额占比</caption>
            <thead>
              <tr>
                <th scope="col">单号</th>
                <th scope="col">件数</th>
                <th scope="col">金额</th>
                <th scope="col">平均每公斤售价</th>
                <th scope="col">金额占比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.merchantNo">
                <th scope="row" data-label="单号">{{ shortLabel(item) }}</th>
                <td data-label="件数">{{ formatNumber(gradeOf(item, grade)?.salesQuantity ?? 0) }}</td>
                <td data-label="金额">{{ formatCurrency(gradeOf(item, grade)?.salesAmount ?? 0) }}</td>
                <td data-label="平均每公斤售价">{{ formatPrice(gradeOf(item, grade)?.weightedAvgPrice ?? null) }}</td>
                <td data-label="金额占比">{{ percent(item.gradeAmountShares[grade]) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" data-label="单号">合计</th>
                <td data-label="件数">{{ formatNumber(totalGrade(grade).salesQuantity) }}</td>
                <td data-label="金额">{{ formatCurrency(totalGrade(grade).salesAmount) }}</td>
                <td data-label="平均每公斤售价">{{ formatPrice(totalGrade(grade).weightedAvgPrice) }}</td>
                <td data-label="金额占比">{{ percent(total.gradeAmountShares[grade]) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    </div>
  </section>

</template>

<style scoped>
/* 卡片要放得下 5 列（单号/件数/金额/平均每公斤售价/金额占比），否则最后一列会被挤出去。 */
.grade-tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 14px; }
.grade-table-card { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.grade-table-card h3 { margin: 0 0 8px; font-size: .92rem; }
table { width: 100%; min-width: 320px; border-collapse: collapse; }
th, td { padding: 7px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: .85rem; }
/* 5 列在 3 张并排的卡片里放不下时，「平均每公斤售价」允许折行，
   其余表头保持单行，否则会出现「金额占 / 比」这种断行。详见 compare 测试。 */
thead th:nth-child(4) { white-space: normal; text-wrap: balance; }
thead th { color: var(--muted); font-weight: 500; }
tbody th, tfoot th { text-align: left; }
tfoot td, tfoot th { border-top: 2px solid var(--line); border-bottom: 0; font-weight: 700; }

@media (max-width: 560px) {
  .grade-tables { grid-template-columns: minmax(0, 1fr); }
  .grade-table-card .table-wrap { overflow: visible; }

  .grade-table-card table { min-width: 0; width: 100%; display: block; }

  .grade-table-card thead { display: none; }

  .grade-table-card tbody,
  .grade-table-card tfoot { display: block; }

  .grade-table-card tr {
    display: grid;
    gap: .35rem;
    padding: .53rem 0;
    border-bottom: 1px solid var(--line);
  }

  .grade-table-card tbody tr:last-child,
  .grade-table-card tfoot tr:last-child { border-bottom: 0; }

  .grade-table-card th,
  .grade-table-card td {
    display: flex;
    width: 100%;
    align-items: baseline;
    justify-content: space-between;
    gap: .59rem;
    padding: .12rem 0;
    border: 0;
    text-align: right;
    white-space: normal;
  }

  .grade-table-card th::before,
  .grade-table-card td::before {
    flex: 0 0 auto;
    color: var(--muted);
    content: attr(data-label);
    font-weight: 500;
    text-align: left;
  }

  .grade-table-card tfoot th,
  .grade-table-card tfoot td {
    background: var(--surface-soft);
    font-weight: 700;
  }
}
</style>
