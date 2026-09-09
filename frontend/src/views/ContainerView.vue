<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getContainerComparison,
  getContainerDetail,
  getOverview,
  getTrend,
  gradeLabel,
  recordSourceUrl,
  type ContainerComparisonItem,
  type ContainerDetail,
  type OverviewData,
  type TrendPoint,
} from '../api/client'
import GradeSummary from '../components/GradeSummary.vue'
import ComparisonPanel from '../components/ComparisonPanel.vue'
import GradePieChart from '../components/GradePieChart.vue'
import TrendChart from '../components/TrendChart.vue'
import { formatAnomalyValue, formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const route = useRoute()
const router = useRouter()
const filters = reactive({ startDate: '', endDate: '', containerId: String(route.query.container_id ?? '') })
const options = ref<ContainerComparisonItem[]>([])
const detail = ref<ContainerDetail | null>(null)
const baseline = ref<OverviewData | null>(null)
const trend = ref<TrendPoint[]>([])
const loading = ref(true)
const error = ref('')
let requestVersion = 0

const periodLabel = computed(() => detail.value?.startDate && detail.value?.endDate
  ? `${detail.value.startDate} 至 ${detail.value.endDate}` : '当前筛选范围暂无销售日期')

const baselineRows = computed(() => detail.value?.grades.map((grade) => {
  const reference = baseline.value?.grades.find((item) => item.grade === grade.grade)
  const delta = grade.weightedAvgPrice !== null && reference?.weightedAvgPrice
    ? grade.weightedAvgPrice / reference.weightedAvgPrice - 1 : null
  return { ...grade, baselinePrice: reference?.weightedAvgPrice ?? null, delta }
}) ?? [])

async function loadOptions() {
  options.value = await getContainerComparison({ startDate: filters.startDate, endDate: filters.endDate })
  if (!filters.containerId && options.value.length) filters.containerId = options.value[0].containerId
}

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '开始日期不能晚于结束日期'
    return
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    await loadOptions()
    if (!filters.containerId) return
    const dateFilters = { startDate: filters.startDate, endDate: filters.endDate }
    const [nextDetail, nextTrend, nextBaseline] = await Promise.all([
      getContainerDetail(filters.containerId, dateFilters),
      getTrend({ ...dateFilters, containerId: filters.containerId }),
      getOverview(dateFilters),
    ])
    if (version !== requestVersion) return
    detail.value = nextDetail
    trend.value = nextTrend
    baseline.value = nextBaseline
    router.replace({ query: { ...route.query, container_id: filters.containerId } })
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '单柜数据加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div><p class="eyebrow">CONTAINER DIAGNOSIS</p><h1>单柜经营诊断</h1><p>用同期整体口径判断该柜结构与价格表现。</p></div>
      <div class="page-header-actions">
        <div class="scenario-switch" role="group" aria-label="经营场景">
          <button type="button" aria-pressed="false" @click="router.push('/overview')">日常跟踪</button>
          <button type="button" aria-pressed="true">货柜复盘</button>
        </div>
        <div class="period-stamp"><span>销售周期</span><strong>{{ periodLabel }}</strong></div>
      </div>
    </header>
    <nav class="view-switch" aria-label="分析视图">
      <RouterLink to="/overview">全局汇总</RouterLink><RouterLink to="/containers" aria-current="page">单柜诊断</RouterLink>
    </nav>
    <form class="filter-bar" @submit.prevent="refresh">
      <label>货柜
        <select v-model="filters.containerId" required @change="refresh">
          <option value="" disabled>选择货柜</option>
          <option v-for="item in options" :key="item.containerId" :value="item.containerId">{{ item.containerName }}</option>
        </select>
      </label>
      <label>开始日期<input v-model="filters.startDate" type="date" @change="refresh"></label>
      <label>结束日期<input v-model="filters.endDate" type="date" @change="refresh"></label>
      <button class="primary-button" type="submit" :disabled="loading || !filters.containerId">{{ loading ? '分析中' : '重新分析' }}</button>
    </form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>诊断加载失败</strong>{{ error }}</span><button type="button" @click="refresh">重试</button></div>
    <div v-if="!loading && !options.length" class="empty-state prominent"><strong>暂无可诊断货柜</strong><span>请先导入包含货柜号的销售结算单。</span><RouterLink class="primary-button" to="/imports">前往导入</RouterLink></div>

    <template v-else>
      <GradeSummary
        :grades="detail?.grades ?? []"
        :total="detail?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
        :loading="loading"
        :title="`${detail?.containerName ?? (filters.containerId || '当前货柜')} 等级表现`"
      />
      <div class="two-column-layout analytics-visuals">
        <GradePieChart :grades="detail?.grades ?? []" :loading="loading" />
        <ComparisonPanel
          :global-grades="baseline?.grades ?? []"
          :global-total="baseline?.total"
          :selected-grades="detail?.grades"
          :selected-total="detail?.total"
        />
      </div>
      <div class="two-column-layout container-analysis">
        <TrendChart :points="trend" :loading="loading" title="该柜每日量价变化" />
        <section class="dashboard-section" aria-labelledby="baseline-title">
          <header class="section-heading"><div><p class="eyebrow">BASELINE</p><h2 id="baseline-title">同期整体基线</h2></div></header>
          <div v-if="loading" class="baseline-skeleton skeleton-block">正在计算同期基线</div>
          <div v-else class="baseline-list">
            <div v-for="row in baselineRows" :key="row.grade" class="baseline-row">
              <span class="grade-badge" :class="`grade-${row.grade.toLowerCase()}`">{{ row.grade }}</span>
              <div><strong>{{ gradeLabel(row.grade) }}</strong><small>该柜 {{ formatPrice(row.weightedAvgPrice) }} · 整体 {{ formatPrice(row.baselinePrice) }}</small></div>
              <span :class="['delta-pill', { negative: row.delta !== null && row.delta < 0 }]">{{ row.delta === null ? '暂无对比' : `${row.delta >= 0 ? '+' : ''}${formatPercent(row.delta)}` }}</span>
            </div>
          </div>
        </section>
      </div>

      <section class="dashboard-section" aria-labelledby="settlement-title">
        <header class="section-heading">
          <div><p class="eyebrow">SETTLEMENT CONTEXT</p><h2 id="settlement-title">结算辅助信息</h2></div>
        </header>
        <dl class="settlement-strip">
          <div><dt>售后金额</dt><dd>{{ detail?.settlement.afterSalesAmount == null ? '暂无数据' : formatCurrency(detail.settlement.afterSalesAmount) }}</dd></div>
          <div><dt>费用合计</dt><dd>{{ detail?.settlement.feeAmount == null ? '暂无数据' : formatCurrency(detail.settlement.feeAmount) }}</dd></div>
          <div><dt>清关税费</dt><dd>{{ detail?.settlement.customsTax == null ? '暂无数据' : formatCurrency(detail.settlement.customsTax) }}</dd></div>
          <div><dt>应付结算</dt><dd>{{ detail?.settlement.payableAmount == null ? '暂无数据' : formatCurrency(detail.settlement.payableAmount) }}</dd></div>
        </dl>
        <ul v-if="detail?.operatingAnomalies.length" class="alert-list inline-alerts">
          <li v-for="(item, index) in detail.operatingAnomalies" :key="index" class="alert-item danger"><span class="alert-code">经营</span><div><strong>{{ item.reason }}</strong><p>当前 {{ formatAnomalyValue(item.type, item.metric) }}，同期基线 {{ formatAnomalyValue(item.type, item.baseline) }}</p></div></li>
        </ul>
      </section>

      <section class="dashboard-section" aria-labelledby="records-title">
        <header class="section-heading">
          <div><p class="eyebrow">NORMALIZED RECORDS</p><h2 id="records-title">标准化销售明细与来源</h2></div>
          <p class="section-note">{{ detail?.records.length ?? 0 }} 条明细</p>
        </header>
        <div v-if="!detail?.records.length" class="empty-state compact"><strong>当前范围没有销售明细</strong><span>调整筛选范围后重试。</span></div>
        <div v-else class="table-wrap record-table-wrap">
          <table>
            <thead><tr><th>日期</th><th>原始等级</th><th>标准等级</th><th>数量</th><th>单价</th><th>金额</th><th>来源</th></tr></thead>
            <tbody><tr v-for="record in detail.records" :key="record.id">
              <td>{{ record.saleDate }}</td><td>{{ record.gradeRaw || '—' }}</td><td>{{ record.grade ? gradeLabel(record.grade) : '未知' }}</td>
              <td>{{ formatNumber(record.quantity) }}</td><td>{{ formatPrice(record.unitPrice) }}</td><td>{{ formatCurrency(record.amount) }}</td>
              <td><a class="text-link source-link" :href="recordSourceUrl(record.id)">源文件 #{{ record.sourceFileId ?? '未关联' }}</a></td>
            </tr></tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
