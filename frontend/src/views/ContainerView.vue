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

const selectedOption = computed(() => options.value.find((item) => item.containerId === filters.containerId))
const periodLabel = computed(() => detail.value?.startDate && detail.value?.endDate
  ? `${detail.value.startDate} 至 ${detail.value.endDate}` : '当前筛选范围暂无销售日期')
const leadGrade = computed(() => [...(detail.value?.grades ?? [])]
  .filter((item) => item.salesQuantity > 0)
  .sort((left, right) => right.salesQuantity - left.salesQuantity)[0])
const sourceFileCount = computed(() => new Set((detail.value?.records ?? []).map((record) => record.sourceFileId).filter(Boolean)).size)
const unknownGradeCount = computed(() => (detail.value?.records ?? []).filter((record) => !record.grade).length)
const baselineRows = computed(() => detail.value?.grades.map((grade) => {
  const reference = baseline.value?.grades.find((item) => item.grade === grade.grade)
  const delta = grade.weightedAvgPrice !== null && reference?.weightedAvgPrice !== null && reference?.weightedAvgPrice !== undefined
    ? grade.weightedAvgPrice / reference.weightedAvgPrice - 1 : null
  return { ...grade, baselinePrice: reference?.weightedAvgPrice ?? null, delta }
}) ?? [])

const salesKpis = computed(() => [
  {
    label: '销售量',
    value: detail.value ? formatNumber(detail.value.total.salesQuantity) : '—',
    note: selectedOption.value?.salesQuantityShare == null ? '当前筛选范围' : `占全局 ${formatPercent(selectedOption.value.salesQuantityShare)}`,
  },
  {
    label: '销售额',
    value: detail.value ? formatCurrency(detail.value.total.salesAmount) : '—',
    note: selectedOption.value?.salesAmountShare == null ? '当前筛选范围' : `占全局 ${formatPercent(selectedOption.value.salesAmountShare)}`,
  },
  {
    label: '加权均价',
    value: detail.value ? formatPrice(detail.value.total.weightedAvgPrice) : '—',
    note: '销售额 ÷ 销售量',
  },
  {
    label: '销售额排名',
    value: selectedOption.value?.rank?.salesAmount ? `第${selectedOption.value.rank.salesAmount}名` : '—',
    note: options.value.length ? `当前共 ${options.value.length} 个货柜` : '暂无横向排名',
  },
])

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
  <div class="page-stack container-page">
    <header class="page-header compact-page-header">
      <div>
        <p class="eyebrow">CONTAINER DIAGNOSIS</p>
        <h1>单柜经营诊断</h1>
        <p>先看等级结构，再定位量价变化、异常与明细来源。</p>
      </div>
      <div class="page-header-actions">
        <RouterLink class="secondary-button header-link" to="/overview">查看货柜横向对比</RouterLink>
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

    <form class="filter-bar compact-filter" @submit.prevent="refresh">
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
      <section class="container-context" aria-label="当前货柜摘要">
        <div class="container-context__identity">
          <span class="status-dot" aria-hidden="true" />
          <div><span class="eyebrow">CURRENT CONTAINER</span><strong>{{ detail?.containerName ?? selectedOption?.containerName ?? filters.containerId }}</strong><small>{{ filters.containerId }} · {{ periodLabel }}</small></div>
        </div>
        <div class="container-context__rank"><span>复盘重点</span><strong>A / B / C 销售结构</strong><small>回款与结算仅作辅助参考</small></div>
      </section>

      <section class="sales-kpi-strip" aria-label="销售核心指标">
        <article v-for="item in salesKpis" :key="item.label" class="sales-kpi">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.note }}</small>
        </article>
      </section>

      <GradeSummary
        :grades="detail?.grades ?? []"
        :total="detail?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
        :loading="loading"
        :title="`${detail?.containerName ?? (filters.containerId || '当前货柜')} 等级表现`"
      />

      <section class="diagnostic-insight" aria-label="诊断摘要">
        <div><span>主力等级</span><strong>{{ leadGrade ? `${leadGrade.grade} · ${gradeLabel(leadGrade.grade)}` : '暂无数据' }}</strong><small>{{ leadGrade ? `销量占比 ${formatPercent(leadGrade.quantityShare)}` : '等待明细' }}</small></div>
        <div><span>经营异常</span><strong :class="{ 'is-alert': detail?.operatingAnomalies.length }">{{ detail?.operatingAnomalies.length ?? 0 }} 条</strong><small>{{ detail?.operatingAnomalies.length ? '需要优先复核' : '当前未发现异常' }}</small></div>
        <div><span>来源文件</span><strong>{{ sourceFileCount || '—' }}</strong><small>{{ detail?.records.length ?? 0 }} 条标准化明细</small></div>
        <div><span>等级待确认</span><strong :class="{ 'is-alert': unknownGradeCount }">{{ unknownGradeCount }}</strong><small>{{ unknownGradeCount ? '原始值未映射到 A/B/C' : '等级已完成归一化' }}</small></div>
      </section>

      <div class="two-column-layout container-analysis">
        <TrendChart :points="trend" :loading="loading" title="该柜每日量价变化" />
        <GradePieChart :grades="detail?.grades ?? []" :loading="loading" />
      </div>

      <div class="two-column-layout analytics-visuals">
        <ComparisonPanel
          :global-grades="baseline?.grades ?? []"
          :global-total="baseline?.total"
          :selected-grades="detail?.grades"
          :selected-total="detail?.total"
        />
        <section class="dashboard-section price-reference" aria-labelledby="baseline-title">
          <header class="section-heading"><div><p class="eyebrow">BENCHMARK</p><h2 id="baseline-title">横向基准与等级价差</h2></div><p class="section-note">同期整体，仅用于定位价差</p></header>
          <div v-if="loading" class="baseline-skeleton skeleton-block">正在计算同期基线</div>
          <div v-else class="baseline-list">
            <div v-for="row in baselineRows" :key="row.grade" class="baseline-row">
              <span class="grade-badge" :class="`grade-${row.grade.toLowerCase()}`">{{ row.grade }}</span>
              <div><strong>{{ gradeLabel(row.grade) }}</strong><small>本柜 {{ formatPrice(row.weightedAvgPrice) }} · 整体 {{ formatPrice(row.baselinePrice) }}</small></div>
              <span :class="['delta-pill', { negative: row.delta !== null && row.delta < 0 }]">{{ row.delta === null ? '暂无对比' : `${row.delta >= 0 ? '+' : ''}${formatPercent(row.delta)}` }}</span>
            </div>
          </div>
        </section>
      </div>

      <section class="dashboard-section anomaly-section" aria-labelledby="anomaly-title">
        <header class="section-heading"><div><p class="eyebrow">ATTENTION</p><h2 id="anomaly-title">经营异常</h2></div><p class="section-note">优先复核量、价与等级结构偏离</p></header>
        <div v-if="!detail?.operatingAnomalies.length" class="empty-state compact"><strong>当前未发现经营异常</strong><span>量价与等级结构暂未触发提示。</span></div>
        <ul v-else class="alert-list inline-alerts">
          <li v-for="(item, index) in detail.operatingAnomalies" :key="index" class="alert-item danger"><span class="alert-code">经营</span><div><strong>{{ item.reason }}</strong><p>当前 {{ formatAnomalyValue(item.type, item.metric) }}，同期基线 {{ formatAnomalyValue(item.type, item.baseline) }}</p></div></li>
        </ul>
      </section>

      <section class="dashboard-section dashboard-section--muted" aria-labelledby="settlement-title">
        <header class="section-heading"><div><p class="eyebrow">SETTLEMENT CONTEXT</p><h2 id="settlement-title">回款与结算辅助</h2></div><p class="section-note">不作为等级经营主指标</p></header>
        <dl class="settlement-strip">
          <div><dt>售后金额</dt><dd>{{ detail?.settlement.afterSalesAmount == null ? '暂无数据' : formatCurrency(detail.settlement.afterSalesAmount) }}</dd></div>
          <div><dt>费用合计</dt><dd>{{ detail?.settlement.feeAmount == null ? '暂无数据' : formatCurrency(detail.settlement.feeAmount) }}</dd></div>
          <div><dt>清关税费</dt><dd>{{ detail?.settlement.customsTax == null ? '暂无数据' : formatCurrency(detail.settlement.customsTax) }}</dd></div>
          <div><dt>应付结算</dt><dd>{{ detail?.settlement.payableAmount == null ? '暂无数据' : formatCurrency(detail.settlement.payableAmount) }}</dd></div>
        </dl>
      </section>

      <section class="dashboard-section trace-section" aria-labelledby="records-title">
        <header class="section-heading"><div><p class="eyebrow">TRACEABILITY</p><h2 id="records-title">标准化销售明细与来源</h2></div><p class="section-note">支持按行追溯源文件</p></header>
        <div class="traceability-strip" aria-label="明细质量摘要"><span><strong>{{ detail?.records.length ?? 0 }}</strong> 条明细</span><span><strong>{{ sourceFileCount || 0 }}</strong> 个来源文件</span><span><strong>{{ unknownGradeCount }}</strong> 条待确认等级</span></div>
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

<style scoped>
.container-page { gap: 16px; }
.compact-page-header { padding-bottom: 16px; }
.header-link { min-height: 38px; padding-inline: 12px; font-size: .72rem; }
.page-header-actions { gap: 8px; }
.container-context { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid var(--line); border-left: 3px solid var(--primary); background: var(--surface); }
.container-context__identity, .container-context__identity > div { display: flex; align-items: center; min-width: 0; }
.container-context__identity { gap: 10px; }.container-context__identity > div { display: grid; align-items: start; gap: 2px; }
.container-context__identity .eyebrow { margin: 0; font-size: .6rem; }.container-context__identity strong { overflow-wrap: anywhere; font-size: .98rem; }.container-context__identity small { color: var(--muted); font-size: .67rem; overflow-wrap: anywhere; }
.container-context__rank { display: grid; justify-items: end; gap: 2px; text-align: right; }.container-context__rank span, .container-context__rank small { color: var(--muted); font-size: .65rem; }.container-context__rank strong { color: var(--primary-dark); font-size: .86rem; }
.sales-kpi-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow); }
.sales-kpi { display: grid; gap: 4px; min-width: 0; padding: 12px 14px; border-right: 1px solid var(--line); }
.sales-kpi:last-child { border-right: 0; }.sales-kpi span, .sales-kpi small { color: var(--muted); font-size: .65rem; }.sales-kpi strong { overflow-wrap: anywhere; color: var(--ink); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: 1.08rem; font-variant-numeric: tabular-nums; }
.diagnostic-insight { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); background: var(--surface); }.diagnostic-insight > div { display: grid; gap: 3px; min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); }.diagnostic-insight > div:last-child { border-right: 0; }.diagnostic-insight span { color: var(--muted); font-size: .65rem; }.diagnostic-insight strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .86rem; }.diagnostic-insight small { color: var(--muted); font-size: .62rem; line-height: 1.4; }.diagnostic-insight .is-alert { color: var(--danger); }
.price-reference, .anomaly-section { min-width: 0; }.dashboard-section--muted { border-top-color: var(--line-strong); }.traceability-strip { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: -3px 0 12px; color: var(--muted); font-size: .68rem; }.traceability-strip span { display: inline-flex; align-items: baseline; gap: 4px; }.traceability-strip strong { color: var(--ink); font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .82rem; }
@media (max-width: 720px) { .container-context { align-items: flex-start; flex-direction: column; gap: 9px; }.container-context__rank { justify-items: start; text-align: left; }.sales-kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }.sales-kpi:nth-child(2) { border-right: 0; }.sales-kpi:nth-child(-n+2) { border-bottom: 1px solid var(--line); }.diagnostic-insight { grid-template-columns: repeat(2, minmax(0, 1fr)); }.diagnostic-insight > div:nth-child(2) { border-right: 0; }.diagnostic-insight > div:nth-child(-n+2) { border-bottom: 1px solid var(--line); } }
@media (max-width: 430px) { .header-link { width: 100%; }.sales-kpi { padding: 10px 11px; }.sales-kpi strong { font-size: .95rem; }.diagnostic-insight > div { padding: 9px 10px; }.diagnostic-insight strong { font-size: .8rem; }.traceability-strip { gap: 5px 12px; } }
</style>
