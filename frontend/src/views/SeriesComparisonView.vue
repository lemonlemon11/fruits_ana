<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getSeriesComparison } from '../api/client'
import { emptyGradeRecord } from '../utils/grades'
import type {
  SeriesAggregate,
  SeriesComparisonData,
  SettlementListItem,
} from '../api/types'
import SeriesGradePriceChart from '../components/SeriesGradePriceChart.vue'
import SeriesGradeTables from '../components/SeriesGradeTables.vue'
import SeriesOverviewTable from '../components/SeriesOverviewTable.vue'
import SeriesAiAnalysis from '../components/SeriesAiAnalysis.vue'
import SettlementPicker from '../components/SettlementPicker.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import { friendlyErrorMessage } from '../utils/seriesAnalysis'
import {
  normalizeSameSeriesSelection,
  parseSelectedParam,
  serializeSelectedParam,
} from '../utils/settlementPicker'
import { getCachedSettlements } from '../utils/settlementCandidateCache'
import { useQuickPeriods } from '../utils/quickPeriods'

const { quickYears, quickMonths, loadQuickPeriods } = useQuickPeriods()
const DEFAULT_SELECTION = 3

const route = useRoute()
const router = useRouter()
const filters = reactive({ startDate: '', endDate: '' })
const options = ref<SettlementListItem[]>([])
// 地址栏带 selected 时按分享链接还原，方便把同一组对比直接发给别人。
const selected = ref<string[]>(parseSelectedParam(route.query.selected))
const result = ref<SeriesComparisonData>(emptyComparison())
const loadingOptions = ref(true)
const loadingComparison = ref(false)
const error = ref('')
const notice = ref('')
let requestVersion = 0
let optionsRequestVersion = 0
let activeController: AbortController | null = null
let comparisonController: AbortController | null = null

const selectedCount = computed(() => selected.value.length)
const canCompare = computed(() => selectedCount.value >= 2)

function emptyComparison(): SeriesComparisonData {
  return { settlements: [], series: [], total: emptyAggregate() }
}

function emptyAggregate(): SeriesAggregate {
  return {
    total: { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null },
    grades: [],
    gradeAmountShares: emptyGradeRecord(null),
  }
}

async function loadComparison(signal?: AbortSignal) {
  const version = ++requestVersion
  comparisonController?.abort()
  const controller = signal ? null : new AbortController()
  if (controller) comparisonController = controller
  const activeSignal = signal ?? controller?.signal
  if (!canCompare.value) {
    result.value = emptyComparison()
    notice.value = '请至少勾选两个结算单再对比；只能在同一个品牌内选择。'
    return
  }
  loadingComparison.value = true
  error.value = ''
  notice.value = ''
  try {
    const next = await getSeriesComparison(selected.value, { ...filters }, { signal: activeSignal })
    if (version === requestVersion) result.value = next
  } catch (caught) {
    if (activeSignal?.aborted) return
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
    error.value = '销售日期起不能晚于销售日期止'
    loadingOptions.value = false
    return
  }
  const version = ++optionsRequestVersion
  loadingOptions.value = true
  error.value = ''
  activeController?.abort()
  comparisonController?.abort()
  const controller = new AbortController()
  activeController = controller
  try {
    const data = await getCachedSettlements({ ...filters }, { signal: controller.signal })
    if (version !== optionsRequestVersion || controller.signal.aborted) return
    options.value = data.settlements
    selected.value = normalizeSameSeriesSelection(
      options.value,
      selected.value,
      DEFAULT_SELECTION,
    )
    syncSelectedQuery()
  } catch (caught) {
    if (controller.signal.aborted) return
    if (version !== optionsRequestVersion) return
    error.value = friendlyErrorMessage(
      caught instanceof Error ? caught.message : '',
      '结算单列表加载失败，请稍后重试',
    )
  } finally {
    if (version === optionsRequestVersion) loadingOptions.value = false
  }
  if (version === optionsRequestVersion && !controller.signal.aborted) {
    await loadComparison(controller.signal)
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

onMounted(() => {
  void loadQuickPeriods()
  void loadOptions()
})
onBeforeUnmount(() => {
  optionsRequestVersion += 1
  requestVersion += 1
  activeController?.abort()
  comparisonController?.abort()
})
</script>

<template>
  <div class="page-stack series-page">
    <form class="filter-bar comparison-filter" @submit.prevent="loadOptions">
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
        :years="quickYears"
        :months="quickMonths"
        @change="loadOptions"
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
      :loading="loadingOptions || loadingComparison"
      @apply="applySelection"
    />
    <p v-if="notice" class="section-note" aria-live="polite">{{ notice }}</p>
    <p v-if="loadingComparison" class="comparison-updating" role="status" aria-live="polite">正在更新对比结果…</p>

    <SeriesOverviewTable :items="result.settlements" :loading="loadingComparison" />

    <div id="series-view-panel" role="tabpanel" class="series-view-panel">
      <SeriesGradeTables v-if="result.settlements.length" :items="result.settlements" :total="result.total" />
      <SeriesGradePriceChart :items="result.settlements" :loading="loadingComparison" />
      <SeriesAiAnalysis
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
.comparison-updating { margin: -8px 0 0; color: var(--primary-dark); font-size: .88rem; font-weight: 700; }
.series-view-panel { display: grid; gap: 18px; }
/* 日期筛选整块占一格自适应伸缩、按钮取内容宽（旧三轨模板会把按钮塞进 1fr 轨道拉伸、
   日期编辑器被挤到占位符截字）。 */
.comparison-filter { grid-template-columns: minmax(0, 1fr) auto; }
</style>
