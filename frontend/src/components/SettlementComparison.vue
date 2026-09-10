<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SettlementComparisonItem } from '../api/client'
import { settlementOptionLabel } from '../utils/settlementComparison'
import { formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const props = defineProps<{ items: SettlementComparisonItem[]; loading?: boolean }>()
const sortBy = ref<'salesAmount' | 'salesQuantity' | 'weightedAvgPrice'>('salesAmount')
const sortedItems = computed(() => [...props.items].sort(
  (left, right) => (right[sortBy.value] ?? -1) - (left[sortBy.value] ?? -1),
))

function gradeShare(item: SettlementComparisonItem, grade: 'A' | 'B' | 'C') {
  return item.grades.find((row) => row.grade === grade)?.quantityShare
}
</script>

<template>
  <section class="dashboard-section comparison-section" aria-labelledby="comparison-title">
    <header class="section-heading comparison-heading">
      <div>
        <h2 id="comparison-title">结算单销售情况</h2>
        <p class="section-note">按销售额、销量或平均每件售价排序查看</p>
      </div>
      <label class="compact-field">排序
        <select v-model="sortBy">
          <option value="salesAmount">按销售额</option>
          <option value="salesQuantity">按销量</option>
          <option value="weightedAvgPrice">按均价</option>
        </select>
      </label>
    </header>

    <div v-if="loading" class="comparison-skeleton skeleton-block">正在加载结算单数据</div>
    <div v-else-if="!items.length" class="empty-state">
      <strong>当前没有结算单数据</strong>
      <span>请先导入销售数据，或调整到达日期范围。</span>
    </div>
    <div v-else class="simple-container-list">
      <article
        v-for="item in sortedItems"
        :key="item.merchantNo"
        class="simple-container-row"
      >
        <span class="simple-container-name">
          <strong>{{ settlementOptionLabel(item) }}</strong>
          <small>{{ item.containerNo ? `柜号 ${item.containerNo}` : '未登记柜号' }}</small>
        </span>
        <span class="simple-metric"><small>销售额</small><strong>{{ formatCurrency(item.salesAmount) }}</strong></span>
        <span class="simple-metric"><small>销量</small><strong>{{ formatNumber(item.salesQuantity) }}</strong></span>
        <span class="simple-metric"><small>平均售价</small><strong>{{ formatPrice(item.weightedAvgPrice) }}</strong></span>
        <span class="simple-grade-shares" aria-label="等级销量占比">
          <span>A果 {{ formatPercent(gradeShare(item, 'A')) }}</span>
          <span>B果 {{ formatPercent(gradeShare(item, 'B')) }}</span>
          <span>C果 {{ formatPercent(gradeShare(item, 'C')) }}</span>
        </span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.comparison-heading { align-items: flex-end; }
.comparison-heading h2 { margin-bottom: 4px; }
.simple-container-list { display: grid; gap: 10px; }
.simple-container-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.2fr) repeat(3, minmax(110px, .75fr)) minmax(220px, 1.2fr);
  min-height: 76px;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  text-align: left;
}
.simple-container-row:hover { border-color: var(--primary); background: #f8faf8; }
.simple-container-row > * { min-width: 0; }
.simple-container-name,
.simple-metric { display: grid; gap: 4px; }
.simple-container-name strong { overflow-wrap: anywhere; font-size: 1rem; }
.simple-container-name small,
.simple-metric small { color: var(--muted); font-size: .85rem; }
.simple-metric strong { overflow-wrap: anywhere; font-size: .9rem; }
.simple-grade-shares { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.simple-grade-shares span { padding: 7px 6px; background: var(--surface-soft); text-align: center; font-size: .85rem; }
@media (max-width: 1050px) {
  .simple-container-row { grid-template-columns: minmax(140px, 1fr) repeat(3, minmax(100px, .75fr)); }
  .simple-grade-shares { grid-column: 1 / -1; }
}

@media (max-width: 660px) {
  .comparison-heading { align-items: stretch; }
  .comparison-heading .compact-field { grid-template-columns: auto minmax(0, 1fr); }
  .simple-container-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 14px; }
  .simple-container-name { grid-column: 1 / -1; }
  .simple-metric:nth-of-type(4) { grid-column: 1 / -1; }
  .simple-grade-shares { grid-column: 1 / -1; }
}
</style>
