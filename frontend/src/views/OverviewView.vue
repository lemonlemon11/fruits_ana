<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  getOverview,
  getGradeBreakdown,
  getFilterOptions,
  getTrend,
  type AnalyticsFilters,
  type FilterOptionsData,
  type Grade,
  type GradeBreakdownData,
  type OverviewData,
  type TrendPoint,
} from '../api/client'
import GradeSummary from '../components/GradeSummary.vue'
import SettlementGradeBreakdown from '../components/SettlementGradeBreakdown.vue'
import MarketSalesAnalysis from '../components/MarketSalesAnalysis.vue'
import DailySalesTrendChart from '../components/DailySalesTrendChart.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import { activeGrades } from '../utils/grades'
import { yearBounds } from '../utils/salePeriods.ts'

const filters = reactive({ startDate: '', endDate: '', country: '', market: '' })
const overview = ref<OverviewData | null>(null)
const gradeBreakdown = ref<GradeBreakdownData | null>(null)
// 每日销售金额折线图（与等级销售分析饼图同行）复用 trend 接口，独立 loading / error。
const dailyTrend = ref<TrendPoint[]>([])
// 国家/市场选项与日期快捷选项：接口刻意不受这些筛选取值影响，加载一次即可。
const filterOptions = ref<FilterOptionsData | null>(null)
const filterOptionsLoading = ref(true)
// 日期快速筛选选项：有销售记录的年度/月度；加载失败不阻塞页面，可继续手动选择日期。
const quickYears = ref<number[]>([])
const quickMonths = ref<string[]>([])
const overviewLoading = ref(true)
const gradeBreakdownLoading = ref(true)
const dailyTrendLoading = ref(true)
const requestErrors = reactive({ overview: '', gradeBreakdown: '', dailyTrend: '', filterOptions: '' })
const validationError = ref('')
const alertPage = ref(1)
const alertPageSize = 5
let requestVersion = 0
let activeController: AbortController | null = null

const queryLoading = computed(() => (
  overviewLoading.value || gradeBreakdownLoading.value
))
const error = computed(() => [
  validationError.value,
  requestErrors.overview && `核心指标：${requestErrors.overview}`,
  requestErrors.gradeBreakdown && `等级明细：${requestErrors.gradeBreakdown}`,
  requestErrors.dailyTrend && `每日销售金额：${requestErrors.dailyTrend}`,
  requestErrors.filterOptions && `国家/市场选项：${requestErrors.filterOptions}`,
].filter(Boolean).join('；'))

const countrySelectOptions = computed(() => [
  { value: '', label: '全部国家' },
  ...(filterOptions.value?.countries ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  })),
])
const marketSelectOptions = computed(() => [
  { value: '', label: '全部市场' },
  ...(filterOptions.value?.markets ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  })),
])

// 「卖得怎么样」等级项不展示 AB / OTHER（总量仍按全量计算）。
const HIDDEN_OVERVIEW_GRADES = new Set<Grade>(['AB', 'OTHER'])

function visibleGradeOrder(rows: ReadonlyArray<{ grade?: unknown }>): Grade[] {
  return activeGrades(rows).filter((grade) => !HIDDEN_OVERVIEW_GRADES.has(grade))
}

const breakdownGradeOrder = computed(() => visibleGradeOrder(gradeBreakdown.value?.grades ?? []))

const totalAlertPages = computed(() => Math.max(1, Math.ceil((overview.value?.operatingAnomalies.length ?? 0) / alertPageSize)))
const pagedAnomalies = computed(() => {
  const anomalies = overview.value?.operatingAnomalies ?? []
  const start = (alertPage.value - 1) * alertPageSize
  return anomalies.slice(start, start + alertPageSize)
})

function goAlertPage(page: number) {
  alertPage.value = Math.min(Math.max(1, page), totalAlertPages.value)
}

watch(() => overview.value?.operatingAnomalies.length, () => {
  alertPage.value = 1
})

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : '看板数据加载失败'
}

async function loadOverviewData(query: AnalyticsFilters, version: number, controller: AbortController) {
  overviewLoading.value = true
  requestErrors.overview = ''
  try {
    const nextOverview = await getOverview(query, { signal: controller.signal })
    if (version === requestVersion) overview.value = nextOverview
  } catch (caught) {
    if (!controller.signal.aborted && version === requestVersion) requestErrors.overview = errorMessage(caught)
  } finally {
    if (version === requestVersion) overviewLoading.value = false
  }
}

async function loadGradeBreakdownData(query: AnalyticsFilters, version: number, controller: AbortController) {
  gradeBreakdownLoading.value = true
  requestErrors.gradeBreakdown = ''
  try {
    const nextGradeBreakdown = await getGradeBreakdown(query, { signal: controller.signal })
    if (version === requestVersion) gradeBreakdown.value = nextGradeBreakdown
  } catch (caught) {
    if (!controller.signal.aborted && version === requestVersion) requestErrors.gradeBreakdown = errorMessage(caught)
  } finally {
    if (version === requestVersion) gradeBreakdownLoading.value = false
  }
}

async function loadDailyTrendData(query: AnalyticsFilters, version: number, controller: AbortController) {
  dailyTrendLoading.value = true
  requestErrors.dailyTrend = ''
  try {
    const points = await getTrend(query, { signal: controller.signal })
    if (version === requestVersion) dailyTrend.value = points
  } catch (caught) {
    if (!controller.signal.aborted && version === requestVersion) requestErrors.dailyTrend = errorMessage(caught)
  } finally {
    if (version === requestVersion) dailyTrendLoading.value = false
  }
}

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    validationError.value = '销售日期起不能晚于销售日期止'
    return
  }
  validationError.value = ''
  const version = ++requestVersion
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  const query: AnalyticsFilters = { ...filters }
  await Promise.allSettled([
    loadOverviewData(query, version, controller),
    loadGradeBreakdownData(query, version, controller),
    loadDailyTrendData(query, version, controller),
  ])
}

async function loadFilterOptions() {
  filterOptionsLoading.value = true
  requestErrors.filterOptions = ''
  try {
    const options = await getFilterOptions()
    filterOptions.value = options
    quickYears.value = options.years
    quickMonths.value = options.months
  } catch (caught) {
    requestErrors.filterOptions = errorMessage(caught)
  } finally {
    filterOptionsLoading.value = false
  }
}

onMounted(() => {
  // 默认展示今年的数据（仅卖得怎么样，用户要求）；
  // 时间方式默认停在「自定义时间」，不因预填当年起止被回显成「按年度」（用户要求）。
  if (!filters.startDate && !filters.endDate) {
    const bounds = yearBounds(new Date().getFullYear())
    filters.startDate = bounds.start
    filters.endDate = bounds.end
  }
  void loadFilterOptions()
  void refresh()
})
onBeforeUnmount(() => {
  requestVersion += 1
  activeController?.abort()
})
</script>

<template>
  <div class="page-stack">
    <form class="filter-bar overview-filter" @submit.prevent="refresh">
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
        :years="quickYears"
        :months="quickMonths"
        :auto-match-mode="false"
        @change="refresh"
      />
      <SearchableSelect
        v-model="filters.country"
        :options="countrySelectOptions"
        label="国家"
        aria-label="国家"
        placeholder="全部国家"
        :loading="filterOptionsLoading"
        @change="refresh"
      />
      <SearchableSelect
        v-model="filters.market"
        :options="marketSelectOptions"
        label="市场"
        aria-label="市场"
        placeholder="全部市场"
        :loading="filterOptionsLoading"
        @change="refresh"
      />
      <button class="primary-button" type="submit" :disabled="queryLoading">{{ queryLoading ? '正在查询' : '查看结果' }}</button>
    </form>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据加载失败</strong>{{ error }}</span>
      <button type="button" @click="refresh">重新查询</button>
    </div>

    <div class="overview-grade-summary">
      <GradeSummary
        :grades="overview?.grades ?? []"
        :total="overview?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
        :loading="overviewLoading"
        title="销售情况"
        :hide-grade-cards="true"
      />
    </div>

    <MarketSalesAnalysis
      :rows="gradeBreakdown?.marketBrandContainers ?? []"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      :loading="gradeBreakdownLoading"
    />

    <SettlementGradeBreakdown
      :grades="gradeBreakdown?.grades ?? []"
      :records="gradeBreakdown?.records ?? []"
      :loading="gradeBreakdownLoading"
      title="等级销售分析"
      variant="overview"
      :grade-order="breakdownGradeOrder"
    >
      <template #overview-aside>
        <DailySalesTrendChart :points="dailyTrend" :loading="dailyTrendLoading" />
      </template>
    </SettlementGradeBreakdown>

  </div>
</template>

<style scoped>
.page-stack { gap: 18px; }
.overview-filter { grid-template-columns: minmax(280px, 1.5fr) minmax(140px, 1fr) minmax(140px, 1fr) auto; }
.overview-trend-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.overview-grade-summary,
.overview-trend-layout > .dashboard-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.overview-grade-summary :deep(.dashboard-section) {
  padding-top: 0;
  border-top: 0;
}

.overview-grade-summary :deep(.section-heading),
.overview-trend-layout :deep(.section-heading) {
  margin-bottom: 12px;
}

.overview-settlement-comparison {
  margin-top: 0;
  padding-top: 18px;
}

.overview-trend-layout > .dashboard-section {
  min-height: 100%;
}

.alerts-section { padding-bottom: 16px; }
.alert-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: .59rem;
  margin-top: .71rem;
  color: var(--muted);
  font-size: .9rem;
}
.alert-pagination button {
  min-height: 2.35rem;
  padding: 0 .71rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
}
.alert-pagination button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-dark); }
.alert-pagination button:disabled { cursor: not-allowed; opacity: .45; }
.mobile-detail-toggle { display: none; }
.overview-detail-sections { display: grid; gap: 18px; }

@media (max-width: 1180px) {
  .overview-filter { grid-template-columns: minmax(240px, 1.4fr) minmax(130px, 1fr) minmax(130px, 1fr) auto; }
}

@media (max-width: 1020px) {
  .overview-trend-layout { grid-template-columns: 1fr; }
}

@media (min-width: 561px) {
  .overview-detail-sections { display: grid !important; }
}

@media (max-width: 560px) {
  .page-stack { gap: 6px; }
  .mobile-detail-toggle { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--primary-dark); font-size: .95rem; font-weight: 800; }
  .overview-detail-sections { gap: 6px; }
  .overview-grade-summary,
  .overview-trend-layout > .dashboard-section { padding: 8px; }
}
</style>
