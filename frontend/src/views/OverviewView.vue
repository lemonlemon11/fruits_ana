<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

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
import GradePieChart from '../components/GradePieChart.vue'
import TrendChart from '../components/TrendChart.vue'
import { formatAnomalyValue } from '../utils/format'

const router = useRouter()
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

function openContainer(containerId: string) {
  router.push({ path: '/containers', query: { container_id: containerId } })
}

function openScenario(path: '/overview' | '/containers') {
  router.push(path)
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <p class="eyebrow">MANAGEMENT OVERVIEW</p>
        <h1>全局等级经营总览</h1>
        <p>先看等级结构与均价，再定位异常货柜。</p>
      </div>
      <div class="scenario-switch" role="group" aria-label="经营场景">
        <button type="button" aria-pressed="true" @click="openScenario('/overview')">日常跟踪</button>
        <button type="button" aria-pressed="false" @click="openScenario('/containers')">货柜复盘</button>
      </div>
    </header>

    <nav class="view-switch" aria-label="分析视图">
      <RouterLink to="/overview" aria-current="page">全局汇总</RouterLink>
      <RouterLink to="/containers">单柜诊断</RouterLink>
    </nav>

    <form class="filter-bar" @submit.prevent="refresh">
      <label>开始日期<input v-model="filters.startDate" type="date" @change="refresh"></label>
      <label>结束日期<input v-model="filters.endDate" type="date" @change="refresh"></label>
      <label>货柜
        <select v-model="filters.containerId" @change="refresh">
          <option value="">全部货柜</option>
          <option v-for="item in containers" :key="item.containerId" :value="item.containerId">{{ item.containerName }}</option>
        </select>
      </label>
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '刷新中' : '刷新数据' }}</button>
    </form>

    <div v-if="error" class="error-banner" role="alert">
      <span><strong>数据加载失败</strong>{{ error }}</span>
      <button type="button" @click="refresh">重试</button>
    </div>

    <div class="context-bar">
      <span class="status-dot" />
      <strong>日常跟踪</strong>
      <span>{{ filters.containerId || '全部货柜' }} · {{ filters.startDate || '最早日期' }} 至 {{ filters.endDate || '最新日期' }}</span>
    </div>

    <div class="overview-grade-layout">
      <div class="overview-grade-summary">
        <GradeSummary
          :grades="overview?.grades ?? []"
          :total="overview?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
          :loading="loading"
        />
      </div>
      <div class="overview-grade-structure">
        <GradePieChart :grades="overview?.grades ?? []" :loading="loading" />
      </div>
    </div>

    <ContainerComparison
      class="overview-container-comparison"
      :items="containers"
      :loading="loading"
      @select="openContainer"
    />

    <div class="overview-trend-layout">
      <TrendChart :points="trend" :loading="loading" />
      <section class="dashboard-section alerts-section" aria-labelledby="alerts-title">
        <header class="section-heading">
          <div><p class="eyebrow">ATTENTION</p><h2 id="alerts-title">需要关注</h2></div>
          <RouterLink class="text-link" to="/imports">数据质量 ›</RouterLink>
        </header>
        <div v-if="loading" class="alerts-skeleton skeleton-block">正在检查异常</div>
        <div v-else-if="!overview?.issueCounts.total && !overview?.operatingAnomalies.length" class="empty-state compact">
          <strong>当前没有待处理异常</strong><span>经营指标与数据质量均未触发提示。</span>
        </div>
        <ul v-else class="alert-list">
          <li v-if="overview?.issueCounts.total" class="alert-item warning">
            <span class="alert-code">数据</span>
            <div><strong>{{ overview.issueCounts.total }} 条数据质量提示</strong><p>请在导入页下载错误明细并核对源文件。</p></div>
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
/* 总览页采用“等级优先 → 货柜横向 → 趋势与提醒”的管理者阅读顺序。 */
.page-stack { gap: 14px; }
.page-header { gap: 18px; padding-bottom: 16px; }
.page-header > div:first-child > p:last-child { font-size: .84rem; }
.scenario-switch button { min-height: 40px; }
.view-switch a { min-height: 40px; }
.filter-bar { gap: 10px; padding: 11px 13px; }
.context-bar { margin-top: -9px; }

.overview-grade-layout,
.overview-trend-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr);
  gap: 14px;
  align-items: start;
}

.overview-grade-summary,
.overview-grade-structure,
.overview-trend-layout > .dashboard-section {
  min-width: 0;
  padding: 13px 14px 14px;
  border: 1px solid var(--line);
  border-top: 2px solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.overview-grade-summary :deep(.dashboard-section),
.overview-grade-structure :deep(.dashboard-section) {
  padding-top: 0;
  border-top: 0;
}

.overview-grade-summary :deep(.section-heading),
.overview-grade-structure :deep(.section-heading),
.overview-trend-layout :deep(.section-heading) {
  margin-bottom: 10px;
}

.overview-grade-summary :deep(.total-strip) {
  margin-bottom: 10px;
}

.overview-grade-summary :deep(.total-strip > div) {
  padding: 10px 12px;
}

.overview-grade-summary :deep(.total-strip strong) {
  font-size: 1.05rem;
}

.overview-grade-summary :deep(.grade-grid) {
  gap: 10px;
}

.overview-grade-summary :deep(.grade-card) {
  min-height: 166px;
  padding: 13px;
  box-shadow: none;
}

.overview-grade-summary :deep(.grade-card .share-track) {
  margin: 11px 0;
}

.overview-grade-summary :deep(.grade-badge) {
  width: 34px;
  height: 34px;
  flex-basis: 34px;
}

.overview-grade-structure :deep(.pie-layout) {
  min-height: 184px;
  gap: 11px;
}

.overview-grade-structure :deep(.pie-chart) {
  width: min(100%, 164px);
}

.overview-container-comparison {
  margin-top: 0;
  padding-top: 14px;
}

.overview-container-comparison :deep(.section-heading) {
  margin-bottom: 10px;
}

.overview-container-comparison :deep(.comparison-table-row) {
  min-height: 60px;
  padding-block: 8px;
}

.overview-trend-layout {
  grid-template-columns: minmax(0, 1.55fr) minmax(250px, .75fr);
}

.overview-trend-layout > .dashboard-section {
  min-height: 100%;
}

.alerts-section { padding-bottom: 12px; }
.alerts-section .alert-list { gap: 6px; }
.alerts-section .alert-item { padding: 9px; }

@media (max-width: 1020px) {
  .overview-grade-layout,
  .overview-trend-layout { grid-template-columns: 1fr; }
  .overview-grade-structure { max-width: none; }
}

@media (max-width: 560px) {
  .page-stack { gap: 12px; }
  .page-header { padding-bottom: 13px; }
  .filter-bar { padding: 11px; }
  .overview-grade-summary,
  .overview-grade-structure,
  .overview-trend-layout > .dashboard-section { padding: 11px; }
  .overview-grade-summary :deep(.grade-card) { min-height: auto; padding: 12px; }
  .overview-grade-structure :deep(.pie-layout) { min-height: 166px; grid-template-columns: minmax(124px, .9fr) minmax(135px, 1.1fr); }
  .overview-grade-structure :deep(.pie-chart) { width: min(100%, 148px); }
}

@media (max-width: 380px) {
  .overview-grade-structure :deep(.pie-layout) { grid-template-columns: 1fr; }
  .overview-grade-structure :deep(.pie-graphic) { justify-items: center; }
  .overview-grade-structure :deep(.pie-legend) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
