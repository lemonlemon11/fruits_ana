<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getSeriesComparison, getSettlements } from '../api/client'
import type { SeriesAggregate, SeriesComparisonData, SettlementListItem } from '../api/types'
import SeriesGradePriceChart from '../components/SeriesGradePriceChart.vue'
import SeriesGradeShareChart from '../components/SeriesGradeShareChart.vue'
import SeriesGradeTables from '../components/SeriesGradeTables.vue'
import SeriesOverviewTable from '../components/SeriesOverviewTable.vue'
import SeriesAiAnalysis from '../components/SeriesAiAnalysis.vue'
import { formatNumber, formatPrice } from '../utils/format'
import { settlementOptionLabel } from '../utils/settlementComparison'
import { friendlyErrorMessage } from '../utils/seriesAnalysis'
import {
  MAX_SERIES_COMPARISON,
  deselectSeries,
  groupBySeries,
  selectWholeSeries,
  toggleSelection,
} from '../utils/seriesComparison'

const DEFAULT_SELECTION = 3

const filters = reactive({ startDate: '', endDate: '' })
const options = ref<SettlementListItem[]>([])
const selected = ref<string[]>([])
const result = ref<SeriesComparisonData>(emptyComparison())
const loadingOptions = ref(true)
const loadingComparison = ref(false)
const error = ref('')
const notice = ref('')
let requestVersion = 0

const seriesGroups = computed(() => groupBySeries(options.value))
const selectedCount = computed(() => selected.value.length)
const canCompare = computed(() => selectedCount.value >= 2)

function emptyComparison(): SeriesComparisonData {
  return { settlements: [], series: [], total: emptyAggregate() }
}

function emptyAggregate(): SeriesAggregate {
  return {
    total: { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null },
    grades: [],
    gradeAmountShares: { A: null, B: null, C: null },
    spread: {
      aMinusB: null,
      bMinusC: null,
      bDiscountVsA: null,
      gradePrices: { A: null, B: null, C: null },
    },
  }
}

function seriesMerchantNos(series: string): string[] {
  return options.value.filter((item) => item.series === series).map((item) => item.merchantNo)
}

async function loadComparison() {
  const version = ++requestVersion
  if (!canCompare.value) {
    result.value = emptyComparison()
    notice.value = '请至少勾选两个结算单再对比；同一系列或不同系列都可以。'
    return
  }
  loadingComparison.value = true
  error.value = ''
  notice.value = ''
  try {
    const next = await getSeriesComparison(selected.value, { ...filters })
    if (version === requestVersion) result.value = next
  } catch (caught) {
    if (version === requestVersion) {
      error.value = friendlyErrorMessage(
        caught instanceof Error ? caught.message : '',
        '对比数据加载失败，请稍后重试',
      )
    }
  } finally {
    if (version === requestVersion) loadingComparison.value = false
  }
}

async function loadOptions() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '到达日期起不能晚于到达日期止'
    return
  }
  loadingOptions.value = true
  error.value = ''
  try {
    const data = await getSettlements({ ...filters })
    options.value = data.settlements
    const available = new Set(options.value.map((item) => item.merchantNo))
    const kept = selected.value.filter((merchantNo) => available.has(merchantNo))
    selected.value = kept.length
      ? kept
      : options.value.slice(0, DEFAULT_SELECTION).map((item) => item.merchantNo)
    await loadComparison()
  } catch (caught) {
    error.value = friendlyErrorMessage(
      caught instanceof Error ? caught.message : '',
      '结算单列表加载失败，请稍后重试',
    )
  } finally {
    loadingOptions.value = false
  }
}

function toggle(merchantNo: string) {
  selected.value = toggleSelection(selected.value, merchantNo)
  void loadComparison()
}

function pickSeries(series: string) {
  selected.value = selectWholeSeries(selected.value, seriesMerchantNos(series))
  void loadComparison()
}

function clearSeries(series: string) {
  selected.value = deselectSeries(selected.value, seriesMerchantNos(series))
  void loadComparison()
}

onMounted(loadOptions)
</script>

<template>
  <div class="page-stack series-page">
    <header class="page-header">
      <div>
        <h1>系列对比</h1>
        <p>勾选结算单后，按 A、B、C 等级分别核算件数、金额和平均每件售价，支持同一系列与不同系列对比。</p>
      </div>
    </header>

    <section class="how-to" aria-label="查看方法">
      <strong>怎么查看</strong>
      <span>第一步：选择到达日期范围并点击“查看结算单”。第二步：勾选两个及以上结算单，下方立即出现对比结果。</span>
    </section>

    <form class="filter-bar comparison-filter" @submit.prevent="loadOptions">
      <label>到达日期起<input v-model="filters.startDate" type="date"></label>
      <label>到达日期止<input v-model="filters.endDate" type="date"></label>
      <button class="primary-button" type="submit" :disabled="loadingOptions">
        {{ loadingOptions ? '正在查询' : '查看结算单' }}
      </button>
    </form>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span>
      <button type="button" @click="loadOptions">重新查询</button>
    </div>

    <section class="dashboard-section" aria-labelledby="series-picker-title">
      <header class="section-heading">
        <div>
          <h2 id="series-picker-title">选择要对比的结算单</h2>
          <p class="section-note">已选 {{ selectedCount }} / {{ MAX_SERIES_COMPARISON }}，至少勾选两个</p>
        </div>
      </header>

      <div v-if="loadingOptions" class="picker-skeleton skeleton-block">正在加载结算单</div>
      <div v-else-if="!options.length" class="empty-state compact">
        <strong>当前范围内没有结算单</strong>
        <span>请调整到达日期范围，或先导入结算单。</span>
      </div>
      <div v-else class="series-picker">
        <article v-for="group in seriesGroups" :key="group.series" class="series-group">
          <header class="series-group-head">
            <strong>{{ group.series }}</strong>
            <span>{{ group.items.length }} 张结算单</span>
            <span class="series-group-actions">
              <button type="button" class="text-button" @click="pickSeries(group.series)">全选本系列</button>
              <button type="button" class="text-button" @click="clearSeries(group.series)">取消本系列</button>
            </span>
          </header>
          <label v-for="item in group.items" :key="item.merchantNo" class="series-option">
            <input
              type="checkbox"
              :value="item.merchantNo"
              :checked="selected.includes(item.merchantNo)"
              @change="toggle(item.merchantNo)"
            >
            <span class="series-option-name">{{ settlementOptionLabel(item) }}</span>
            <span class="series-option-metric">{{ formatNumber(item.totalQuantity) }} 件</span>
            <span class="series-option-metric">{{ formatPrice(item.averagePrice) }}</span>
          </label>
        </article>
      </div>
      <p v-if="notice" class="section-note" aria-live="polite">{{ notice }}</p>
    </section>

    <SeriesOverviewTable :items="result.settlements" :total="result.total" :loading="loadingComparison" />
    <SeriesGradeTables v-if="result.settlements.length" :items="result.settlements" :total="result.total" />
    <SeriesGradePriceChart :items="result.settlements" :loading="loadingComparison" />
    <SeriesGradeShareChart :items="result.settlements" :loading="loadingComparison" />
    <SeriesAiAnalysis
      :merchant-nos="selected"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :disabled="loadingComparison"
    />
  </div>
</template>

<style scoped>
.series-page { gap: 18px; }
.comparison-filter { grid-template-columns: repeat(2, minmax(180px, 1fr)) auto; }
.picker-skeleton { min-height: 120px; }
.series-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.series-group { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.series-group-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.series-group-head strong { font-size: .95rem; }
.series-group-head span { color: var(--muted); font-size: .72rem; }
.series-group-actions { margin-left: auto; display: flex; gap: 10px; }
.series-option { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); font-size: .82rem; }
.series-option-name { overflow-wrap: anywhere; }
.series-option-metric { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }

@media (max-width: 720px) {
  .comparison-filter { grid-template-columns: 1fr; }
  .series-option { grid-template-columns: auto minmax(0, 1fr); }
  .series-option-metric { grid-column: 2; }
}
</style>
