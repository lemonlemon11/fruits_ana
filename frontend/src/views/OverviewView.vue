<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import {
  getContainerComparison,
  getOverview,
  getTrend,
  type AnalyticsFilters,
  type ContainerComparisonItem,
  type OverviewData,
  type TrendPoint,
} from '../api/client'
import ContainerComparison from '../components/ContainerComparison.vue'
import GradeSummary from '../components/GradeSummary.vue'
import TrendChart from '../components/TrendChart.vue'
import { formatAnomalyValue } from '../utils/format'

const filters = reactive<Required<AnalyticsFilters>>({ startDate: '', endDate: '', containerId: '' })
const overview = ref<OverviewData | null>(null)
const trend = ref<TrendPoint[]>([])
const containers = ref<ContainerComparisonItem[]>([])
const loading = ref(true)
const error = ref('')
let requestVersion = 0

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '开始日期不能晚于结束日期'
    return
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const query = { ...filters }
    const [nextOverview, nextTrend, nextContainers] = await Promise.all([
      getOverview(query), getTrend(query), getContainerComparison({ ...query, includeAllContainers: true }),
    ])
    if (version !== requestVersion) return
    overview.value = nextOverview
    trend.value = nextTrend
    containers.value = nextContainers
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '看板数据加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <h1>销售总览</h1>
        <p>查看所有货柜卖了多少、卖了多少钱，以及各等级水果的销售情况。</p>
      </div>
    </header>

    <section class="how-to" aria-label="查看方法">
      <strong>怎么查看</strong>
      <span>第一步：选择日期和货柜。第二步：点击“查看结果”。不选择日期就是查看全部数据。</span>
    </section>

    <form class="filter-bar" @submit.prevent="refresh">
      <label>开始日期<input v-model="filters.startDate" type="date"></label>
      <label>结束日期<input v-model="filters.endDate" type="date"></label>
      <label>货柜
        <select v-model="filters.containerId">
          <option value="">全部货柜</option>
          <option v-for="item in containers" :key="item.containerId" :value="item.containerId">{{ item.containerName }}</option>
        </select>
      </label>
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '正在查询' : '查看结果' }}</button>
    </form>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据加载失败</strong>{{ error }}</span>
      <button type="button" @click="refresh">重新查询</button>
    </div>

    <div class="overview-grade-summary">
      <GradeSummary
        :grades="overview?.grades ?? []"
        :total="overview?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
        :loading="loading"
      />
    </div>

    <ContainerComparison
      class="overview-container-comparison"
      :items="containers"
      :loading="loading"
    />

    <div class="overview-trend-layout">
      <TrendChart :points="trend" :loading="loading" />
      <section class="dashboard-section alerts-section" aria-labelledby="alerts-title">
        <header class="section-heading">
          <h2 id="alerts-title">需要关注</h2>
          <span class="section-note">数据问题会在本页显示</span>
        </header>
        <div v-if="loading" class="alerts-skeleton skeleton-block">正在检查异常</div>
        <div v-else-if="!overview?.issueCounts.total && !overview?.operatingAnomalies.length" class="empty-state compact">
          <strong>当前没有待处理异常</strong><span>经营指标与数据质量均未触发提示。</span>
        </div>
        <ul v-else class="alert-list">
          <li v-if="overview?.issueCounts.total" class="alert-item warning">
            <span class="alert-code">数据</span>
            <div><strong>{{ overview.issueCounts.total }} 条数据质量提示</strong><p>请从左侧菜单进入“数据导入”，查看问题明细并核对结算单。</p></div>
          </li>
          <li v-for="(item, index) in overview?.operatingAnomalies" :key="`${item.containerId}-${index}`" class="alert-item danger">
            <span class="alert-code">经营</span>
            <div><strong>{{ item.containerId || '货柜' }} · {{ item.reason }}</strong>
              <p>当前 {{ formatAnomalyValue(item.type, item.metric) }}，同期基线 {{ formatAnomalyValue(item.type, item.baseline) }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-stack { gap: 18px; }
.overview-trend-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, .75fr);
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

.overview-container-comparison {
  margin-top: 0;
  padding-top: 18px;
}

.overview-trend-layout > .dashboard-section {
  min-height: 100%;
}

.alerts-section { padding-bottom: 16px; }

@media (max-width: 1020px) {
  .overview-trend-layout { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .page-stack { gap: 16px; }
  .overview-grade-summary,
  .overview-trend-layout > .dashboard-section { padding: 14px; }
}
</style>
