<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  getOverview,
  getGradeBreakdown,
  getSettlementComparison,
  type AnalyticsFilters,
  type GradeBreakdownData,
  type OverviewData,
  type SettlementComparisonItem,
} from '../api/client'
import GradeSummary from '../components/GradeSummary.vue'
import SettlementGradeBreakdown from '../components/SettlementGradeBreakdown.vue'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import { settlementOptionLabel } from '../utils/settlementComparison'

const filters = reactive({ startDate: '', endDate: '', merchantNo: '' })
const overview = ref<OverviewData | null>(null)
const gradeBreakdown = ref<GradeBreakdownData | null>(null)
// 下拉框候选始终是筛选范围内的全部结算单，避免选中后无法切回。
const settlementOptions = ref<SettlementComparisonItem[]>([])
const overviewLoading = ref(true)
const gradeBreakdownLoading = ref(true)
const settlementOptionsLoading = ref(true)
const requestErrors = reactive({ overview: '', gradeBreakdown: '', settlementOptions: '' })
const validationError = ref('')
const alertPage = ref(1)
const alertPageSize = 5
let requestVersion = 0
let activeController: AbortController | null = null

const queryLoading = computed(() => (
  overviewLoading.value || gradeBreakdownLoading.value || settlementOptionsLoading.value
))
const error = computed(() => [
  validationError.value,
  requestErrors.overview && `核心指标：${requestErrors.overview}`,
  requestErrors.gradeBreakdown && `等级明细：${requestErrors.gradeBreakdown}`,
  requestErrors.settlementOptions && `商号列表：${requestErrors.settlementOptions}`,
].filter(Boolean).join('；'))
const merchantSelectOptions = computed(() =>
  [
    { value: '', label: '全部结算单' },
    ...settlementOptions.value.map((item) => ({
      value: item.merchantNo,
      label: settlementOptionLabel(item),
    })),
  ],
)
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

async function loadSettlementOptions(query: AnalyticsFilters, version: number, controller: AbortController) {
  settlementOptionsLoading.value = true
  requestErrors.settlementOptions = ''
  try {
    const nextSettlements = await getSettlementComparison({ ...query, includeAllSettlements: true }, { signal: controller.signal })
    if (version === requestVersion) settlementOptions.value = nextSettlements
  } catch (caught) {
    if (!controller.signal.aborted && version === requestVersion) requestErrors.settlementOptions = errorMessage(caught)
  } finally {
    if (version === requestVersion) settlementOptionsLoading.value = false
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
    loadSettlementOptions(query, version, controller),
  ])
}

onMounted(refresh)
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
      />
      <SearchableSelect
        v-model="filters.merchantNo"
        :options="merchantSelectOptions"
        label="商号"
        aria-label="商号"
        placeholder="全部结算单"
        :loading="settlementOptionsLoading"
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
      />
    </div>

    <SettlementGradeBreakdown
      :grades="gradeBreakdown?.grades ?? []"
      :records="gradeBreakdown?.records ?? []"
      :loading="gradeBreakdownLoading"
    />

  </div>
</template>

<style scoped>
.page-stack { gap: 18px; }
.overview-filter { grid-template-columns: repeat(2, minmax(160px, 1fr)) auto; }
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
