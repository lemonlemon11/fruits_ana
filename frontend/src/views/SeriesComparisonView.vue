<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getSeriesComparison, getSettlements } from '../api/client'
import type {
  GradeDetailData,
  SeriesAggregate,
  SeriesComparisonData,
  SettlementListItem,
} from '../api/types'
import SeriesGradePriceChart from '../components/SeriesGradePriceChart.vue'
import SeriesGradeShareChart from '../components/SeriesGradeShareChart.vue'
import SeriesGradeTables from '../components/SeriesGradeTables.vue'
import SeriesOverviewTable from '../components/SeriesOverviewTable.vue'
import SeriesAiAnalysis from '../components/SeriesAiAnalysis.vue'
import SeriesGradeDetail from '../components/SeriesGradeDetail.vue'
import GradeDetailAiAnalysis from '../components/GradeDetailAiAnalysis.vue'
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
// 视图切换：按系列看对比，或按等级号别看价格阶梯（ADR-013）。
const view = ref<'series' | 'grade'>('series')
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
  return { settlements: [], series: [], total: emptyAggregate(), gradeDetails: emptyGradeDetails() }
}

function emptyGradeDetails(): GradeDetailData {
  return {
    buckets: [],
    unrecognized: { label: '其他', recordCount: 0, salesQuantity: 0 },
    total: { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null },
  }
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
          <div class="series-options">
            <label
              v-for="item in group.items"
              :key="item.merchantNo"
              class="series-option"
              :class="{ selected: selected.includes(item.merchantNo) }"
            >
              <input
                type="checkbox"
                :value="item.merchantNo"
                :checked="selected.includes(item.merchantNo)"
                @change="toggle(item.merchantNo)"
              >
              <span class="series-option-name">{{ settlementOptionLabel(item) }}</span>
              <span class="series-option-metrics">
                <span>{{ formatNumber(item.totalQuantity) }} 件</span>
                <span>{{ formatPrice(item.averagePrice) }}</span>
              </span>
            </label>
          </div>
        </article>
      </div>
      <p v-if="notice" class="section-note" aria-live="polite">{{ notice }}</p>
    </section>

    <SeriesOverviewTable :items="result.settlements" :total="result.total" :loading="loadingComparison" />

    <div class="series-view-tabs" role="tablist" aria-label="对比视图切换">
      <button
        type="button"
        role="tab"
        class="view-tab"
        :aria-selected="view === 'series'"
        aria-controls="series-view-panel"
        @click="view = 'series'"
      >
        按系列
      </button>
      <button
        type="button"
        role="tab"
        class="view-tab"
        :aria-selected="view === 'grade'"
        aria-controls="grade-view-panel"
        @click="view = 'grade'"
      >
        按等级号别
      </button>
    </div>

    <div v-show="view === 'series'" id="series-view-panel" role="tabpanel" class="series-view-panel">
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

    <div v-show="view === 'grade'" id="grade-view-panel" role="tabpanel" class="series-view-panel">
      <SeriesGradeDetail :details="result.gradeDetails" :loading="loadingComparison" />
      <GradeDetailAiAnalysis
        :merchant-nos="selected"
        :start-date="filters.startDate"
        :end-date="filters.endDate"
        :disabled="loadingComparison"
      />
    </div>
  </div>
</template>

<style scoped>
.series-page { gap: 18px; }
.series-view-panel { display: grid; gap: 18px; }
.series-view-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.view-tab {
  min-height: 48px; padding: 0 18px;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink); font-size: 1rem; font-weight: 700;
}
.view-tab[aria-selected='true'] { border-color: var(--primary-dark); background: var(--primary); color: white; }
.comparison-filter { grid-template-columns: repeat(2, minmax(180px, 1fr)) auto; }
.picker-skeleton { min-height: 120px; }
.series-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.series-group { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.series-group-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.series-group-head strong { font-size: .95rem; }
.series-group-head span { color: var(--muted); font-size: .85rem; }
.series-group-actions { margin-left: auto; display: flex; gap: 10px; }
/* 结算单多选：窄屏一行一个，宽屏自动并排，选中态用主色描边 + 浅底 + 勾选框，避免整行拉出一条空白。 */
.series-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
.series-option {
  display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 10px;
  min-height: 58px; padding: 9px 12px;
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  background: var(--surface); cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.series-option:hover { border-color: var(--line-strong); background: var(--surface-soft); }
.series-option.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary-soft) 55%, white); }
.series-option input[type='checkbox'] {
  grid-row: 1 / span 2; width: 22px; height: 22px; margin: 0;
  border: 2px solid var(--line-strong); border-radius: 5px; background: var(--surface);
  appearance: none; cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.series-option input[type='checkbox']:checked {
  border-color: var(--primary); background: var(--primary) center / 15px no-repeat;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
}
.series-option-name { overflow-wrap: anywhere; font-size: .95rem; }
.series-option.selected .series-option-name { font-weight: 700; }
.series-option-metrics { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: .9rem; font-variant-numeric: tabular-nums; }

@media (max-width: 720px) {
  .comparison-filter { grid-template-columns: 1fr; }
  .series-options { grid-template-columns: minmax(0, 1fr); }
}
</style>
