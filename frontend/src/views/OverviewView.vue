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
import ComparisonPanel from '../components/ComparisonPanel.vue'
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

    <GradeSummary
      :grades="overview?.grades ?? []"
      :total="overview?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
      :loading="loading"
    />

    <div class="two-column-layout analytics-visuals">
      <GradePieChart :grades="overview?.grades ?? []" :loading="loading" />
      <ComparisonPanel :global-grades="overview?.grades ?? []" :global-total="overview?.total" />
    </div>

    <div class="two-column-layout">
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

    <ContainerComparison :items="containers" :loading="loading" @select="openContainer" />
  </div>
</template>
