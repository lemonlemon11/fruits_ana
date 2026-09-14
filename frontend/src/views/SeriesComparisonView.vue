<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
import SettlementPicker from '../components/SettlementPicker.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import { friendlyErrorMessage } from '../utils/seriesAnalysis'
import { MAX_SERIES_COMPARISON } from '../utils/seriesComparison'
import {
  parseSelectedParam,
  serializeSelectedParam,
} from '../utils/settlementPicker'

const DEFAULT_SELECTION = 3

const route = useRoute()
const router = useRouter()
const filters = reactive({ startDate: '', endDate: '' })
// 视图切换：按品牌看对比，或按等级号别看价格阶梯（ADR-013）。
const view = ref<'series' | 'grade'>('series')
const options = ref<SettlementListItem[]>([])
// 地址栏带 selected 时按分享链接还原，方便把同一组对比直接发给别人。
const selected = ref<string[]>(
  parseSelectedParam(route.query.selected, MAX_SERIES_COMPARISON),
)
// 手机端默认只保留“选择 + 总览”，详细分析按需展开；桌面端始终显示详细分析。
const detailOpen = ref(false)
const result = ref<SeriesComparisonData>(emptyComparison())
const loadingOptions = ref(true)
const loadingComparison = ref(false)
const error = ref('')
const notice = ref('')
let requestVersion = 0

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

async function loadComparison() {
  const version = ++requestVersion
  if (!canCompare.value) {
    result.value = emptyComparison()
    notice.value = '请至少勾选两个结算单再对比；同一品牌或不同品牌都可以。'
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
    syncSelectedQuery()
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

/** 选择面板点「确定」才走到这里，一次刷新即可，不会每勾一下请求一次。 */
function applySelection(merchantNos: string[]) {
  selected.value = merchantNos
  syncSelectedQuery()
  void loadComparison()
}

/** 把已选写回地址栏；没选任何结算单时删掉该参数，保持地址干净。 */
function syncSelectedQuery() {
  const next = serializeSelectedParam(selected.value)
  const current = typeof route.query.selected === 'string' ? route.query.selected : ''
  if (next === current) return
  const query = { ...route.query }
  if (next) query.selected = next
  else delete query.selected
  void router.replace({ query })
}

onMounted(loadOptions)
</script>

<template>
  <div class="page-stack series-page">
    <header class="page-header">
      <div>
        <h1>品牌对比</h1>
        <p>勾选结算单后，按各等级分别核算件数、金额和平均每千克售价，支持同一品牌与不同品牌对比。</p>
      </div>
    </header>

    <section class="how-to" aria-label="查看方法">
      <strong>怎么查看</strong>
      <span>第一步：选择到达日期范围并点击“查看结算单”。第二步：点“选择结算单”挑两张及以上，下方立即出现对比结果。</span>
    </section>

    <form class="filter-bar comparison-filter" @submit.prevent="loadOptions">
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
      />
      <button class="primary-button" type="submit" :disabled="loadingOptions">
        {{ loadingOptions ? '正在查询' : '查看结算单' }}
      </button>
    </form>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span>
      <button type="button" @click="loadOptions">重新查询</button>
    </div>

    <SettlementPicker
      :options="options"
      :selected="selected"
      :max="MAX_SERIES_COMPARISON"
      :loading="loadingOptions"
      @apply="applySelection"
    />
    <p v-if="notice" class="section-note" aria-live="polite">{{ notice }}</p>

    <SeriesOverviewTable :items="result.settlements" :total="result.total" :loading="loadingComparison" />

    <button
      type="button"
      class="mobile-detail-toggle"
      :aria-expanded="detailOpen"
      aria-controls="series-detail-sections"
      @click="detailOpen = !detailOpen"
    >
      {{ detailOpen ? '收起详细对比' : '展开详细对比' }}
    </button>

    <div v-show="detailOpen" id="series-detail-sections" class="series-detail-sections">
      <div class="series-view-tabs" role="tablist" aria-label="对比视图切换">
        <button
          type="button"
          role="tab"
          class="view-tab"
          :aria-selected="view === 'series'"
          aria-controls="series-view-panel"
          @click="view = 'series'"
        >
          按品牌
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
  </div>
</template>

<style scoped>
.series-page { gap: 18px; }
.series-view-panel { display: grid; gap: 18px; }
.series-view-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.mobile-detail-toggle { display: none; }
.series-detail-sections { display: grid; gap: 18px; }
.view-tab {
  min-height: 48px; padding: 0 18px;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink); font-size: 1rem; font-weight: 700;
}
.view-tab[aria-selected='true'] { border-color: var(--primary-dark); background: var(--primary); color: white; }
.comparison-filter { grid-template-columns: repeat(2, minmax(180px, 1fr)) auto; }

@media (max-width: 720px) {
  .comparison-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comparison-filter .primary-button { grid-column: 1 / -1; }
}

@media (min-width: 561px) {
  .series-detail-sections { display: grid !important; }
}

@media (max-width: 560px) {
  .mobile-detail-toggle { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--primary-dark); font-size: 1rem; font-weight: 800; }
  .series-detail-sections { gap: 16px; }
}
</style>
