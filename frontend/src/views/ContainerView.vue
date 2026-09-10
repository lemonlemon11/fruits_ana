<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getContainerComparison, getContainerDetail, getTrend, gradeLabel, recordSourceUrl, type ContainerComparisonItem, type ContainerDetail, type TrendPoint } from '../api/client'
import GradeSummary from '../components/GradeSummary.vue'
import TrendChart from '../components/TrendChart.vue'
import { buildOtherContainerGradeBaseline } from '../utils/containerComparison'
import { formatAnomalyValue, formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const route = useRoute()
const filters = reactive({
  startDate: queryText(route.query.start_date),
  endDate: queryText(route.query.end_date),
  containerId: queryText(route.query.container_id),
})
const activeContainerId = ref('')
const options = ref<ContainerComparisonItem[]>([]); const detail = ref<ContainerDetail | null>(null); const trend = ref<TrendPoint[]>([]); const loading = ref(true); const error = ref(''); let requestVersion = 0
const selectedOption = computed(() => options.value.find((item) => item.containerId === activeContainerId.value))
const baseline = computed(() => buildOtherContainerGradeBaseline(options.value, activeContainerId.value))
const periodLabel = computed(() => detail.value?.startDate && detail.value?.endDate ? `${detail.value.startDate} 至 ${detail.value.endDate}` : '当前筛选范围暂无销售日期')
const baselineRows = computed(() => detail.value?.grades.map((grade) => {
  const reference = baseline.value.find((item) => item.grade === grade.grade)
  const delta = grade.weightedAvgPrice !== null && reference?.weightedAvgPrice != null
    ? grade.weightedAvgPrice / reference.weightedAvgPrice - 1
    : null
  return { ...grade, baselinePrice: reference?.weightedAvgPrice ?? null, delta }
}) ?? [])

function queryText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const salesKpis = computed(() => [
  { label: '销量', value: detail.value ? formatNumber(detail.value.total.salesQuantity) : '—', note: `占全部 ${formatPercent(selectedOption.value?.salesQuantityShare)}` },
  { label: '销售额', value: detail.value ? formatCurrency(detail.value.total.salesAmount) : '—', note: `占全部 ${formatPercent(selectedOption.value?.salesAmountShare)}` },
  { label: '平均售价', value: detail.value ? formatPrice(detail.value.total.weightedAvgPrice) : '—', note: '销售额 ÷ 销量' },
  { label: '销售额排名', value: selectedOption.value?.rank?.salesAmount ? `第 ${selectedOption.value.rank.salesAmount} 名` : '—', note: `共 ${options.value.length || '—'} 个货柜` },
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
    const requestedContainerId = filters.containerId
    const dateFilters = { startDate: filters.startDate, endDate: filters.endDate }
    const [nextDetail, nextTrend] = await Promise.all([
      getContainerDetail(requestedContainerId, dateFilters),
      getTrend({ ...dateFilters, containerId: requestedContainerId }),
    ])
    if (version !== requestVersion) return
    activeContainerId.value = requestedContainerId
    detail.value = nextDetail
    trend.value = nextTrend
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '单柜数据加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
onMounted(refresh)
</script>

<template>
  <div class="container-dashboard">
    <header class="dashboard-head"><div><h1>货柜详情</h1><p>选择一个货柜，查看销量、销售额和等级情况。</p></div></header>
    <section class="how-to" aria-label="查看方法"><strong>怎么查看</strong><span>第一步：选择货柜和日期。第二步：点击“查看结果”。页面只显示当前货柜的数据。</span></section>
    <form class="filter-bar" @submit.prevent="refresh"><label>货柜<select v-model="filters.containerId" required><option value="" disabled>选择货柜</option><option v-for="item in options" :key="item.containerId" :value="item.containerId">{{ item.containerName }}</option></select></label><label>开始日期<input v-model="filters.startDate" type="date"></label><label>结束日期<input v-model="filters.endDate" type="date"></label><button class="primary-button" type="submit" :disabled="loading || !filters.containerId">{{ loading ? '正在查询' : '查看结果' }}</button></form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>货柜数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span><button type="button" @click="refresh">重新查询</button></div>
    <div v-if="!loading && !options.length" class="empty-state prominent"><strong>暂无货柜数据</strong><span>目前没有可查看的货柜。请从左侧菜单进入“数据导入”，先导入结算单。</span></div>
    <template v-else>
      <section class="container-banner"><div class="container-identity"><strong>{{ detail?.containerName ?? selectedOption?.containerName ?? activeContainerId }}</strong><small>{{ activeContainerId }} · 销售周期：{{ periodLabel }}</small></div></section>
      <section class="kpi-grid" aria-label="销售核心指标"><article v-for="item in salesKpis" :key="item.label" class="kpi-card"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>{{ item.note }}</small></article></section>
      <section class="panel grade-summary-panel"><GradeSummary :grades="detail?.grades ?? []" :total="detail?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }" :loading="loading" :title="`${detail?.containerName ?? '当前货柜'} 等级表现`" /></section>
      <section class="analysis-grid"><div class="panel trend-panel"><TrendChart :points="trend" :loading="loading" title="该柜每日销量和平均每件售价" /></div><div class="panel baseline-panel"><header class="panel-head"><h2>和同期其他货柜平均每件售价对比</h2></header><div v-if="loading" class="skeleton-block">正在计算对比数据</div><div v-else class="baseline-list"><div v-for="row in baselineRows" :key="row.grade" class="baseline-row"><span class="grade-badge" :class="`grade-${row.grade.toLowerCase()}`">{{ row.grade }}</span><div><strong>{{ gradeLabel(row.grade) }}</strong><small>本柜 {{ formatPrice(row.weightedAvgPrice) }} · 其他货柜 {{ formatPrice(row.baselinePrice) }}</small></div><span :class="['delta-pill', { negative: row.delta !== null && row.delta < 0 }]">{{ row.delta === null ? '暂无对比' : `${row.delta >= 0 ? '+' : ''}${formatPercent(row.delta)}` }}</span></div></div></div></section>
      <section class="compact-alerts panel"><header class="panel-head"><h2>需要关注</h2></header><div v-if="!detail?.operatingAnomalies.length" class="empty-inline">当前未发现经营异常</div><ul v-else class="alert-list inline-alerts"><li v-for="(item, index) in detail.operatingAnomalies" :key="index" class="alert-item danger"><span class="alert-code">提醒</span><div><strong>{{ item.reason }}</strong><p>当前 {{ formatAnomalyValue(item.type, item.metric) }} · 全部 {{ formatAnomalyValue(item.type, item.baseline) }}</p></div></li></ul></section>
      <details class="secondary-drawer"><summary><span><b>查看结算和销售明细</b><small>需要核对原始数据时再展开</small></span><em>展开</em></summary><div class="drawer-grid"><section class="panel"><header class="panel-head"><h2>结算信息</h2></header><dl class="settlement-strip"><div><dt>售后金额</dt><dd>{{ detail?.settlement.afterSalesAmount == null ? '暂无数据' : formatCurrency(detail.settlement.afterSalesAmount) }}</dd></div><div><dt>费用合计</dt><dd>{{ detail?.settlement.feeAmount == null ? '暂无数据' : formatCurrency(detail.settlement.feeAmount) }}</dd></div><div><dt>清关税费</dt><dd>{{ detail?.settlement.customsTax == null ? '暂无数据' : formatCurrency(detail.settlement.customsTax) }}</dd></div><div><dt>应付结算</dt><dd>{{ detail?.settlement.payableAmount == null ? '暂无数据' : formatCurrency(detail.settlement.payableAmount) }}</dd></div></dl></section><section class="panel"><header class="panel-head"><h2>销售明细</h2><span>{{ detail?.records.length ?? 0 }} 条</span></header><div v-if="!detail?.records.length" class="empty-inline">当前范围没有销售明细</div><div v-else class="table-wrap trace-table"><table><thead><tr><th>日期</th><th>等级</th><th>数量</th><th>金额</th><th>来源</th></tr></thead><tbody><tr v-for="record in detail.records" :key="record.id"><td>{{ record.saleDate }}</td><td>{{ record.grade ? gradeLabel(record.grade) : '未知' }}</td><td>{{ formatNumber(record.quantity) }}</td><td>{{ formatCurrency(record.amount) }}</td><td><a class="text-link" :href="recordSourceUrl(record.id)">#{{ record.sourceFileId ?? '—' }}</a></td></tr></tbody></table></div></section></div></details>
    </template>
  </div>
</template>

<style scoped>
.container-dashboard { display: grid; gap: 18px; }
.dashboard-head { padding-bottom: 18px; border-bottom: 1px solid var(--line-strong); }
.dashboard-head h1 { margin-bottom: 6px; }
.dashboard-head p { margin: 0; color: var(--muted); font-size: .95rem; }
.container-banner,
.panel,
.kpi-grid,
.secondary-drawer { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.container-banner { padding: 14px 16px; border-left: 4px solid var(--primary); }
.container-identity { display: grid; gap: 5px; }
.container-identity strong { overflow-wrap: anywhere; font-size: 1.05rem; }
.container-identity small { color: var(--muted); font-size: .84rem; line-height: 1.5; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.kpi-card { display: grid; gap: 5px; min-width: 0; padding: 14px; border-right: 1px solid var(--line); }
.kpi-card:last-child { border-right: 0; }
.kpi-card span,
.kpi-card small { color: var(--muted); font-size: .82rem; }
.kpi-card strong { overflow-wrap: anywhere; font-size: 1.08rem; font-variant-numeric: tabular-nums; }
.panel { min-width: 0; padding: 16px; }
.grade-summary-panel :deep(.dashboard-section),
.trend-panel :deep(.dashboard-section) { padding-top: 0; border-top: 0; }
.analysis-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(290px, .75fr); gap: 18px; }
.panel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.panel-head h2 { margin: 0; }
.panel-head > span { color: var(--muted); font-size: .82rem; }
.baseline-list { display: grid; }
.baseline-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 58px; border-bottom: 1px solid var(--line); }
.baseline-row:last-child { border-bottom: 0; }
.baseline-row > div { display: grid; gap: 3px; min-width: 0; }
.baseline-row strong { font-size: .9rem; }
.baseline-row small { overflow-wrap: anywhere; color: var(--muted); font-size: .78rem; line-height: 1.4; }
.baseline-row .delta-pill { white-space: nowrap; }
.compact-alerts .alert-list { margin: 0; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }
.secondary-drawer { overflow: hidden; }
.secondary-drawer summary { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 16px; cursor: pointer; list-style: none; }
.secondary-drawer summary::-webkit-details-marker { display: none; }
.secondary-drawer summary span { display: grid; gap: 3px; }
.secondary-drawer summary b { font-size: .95rem; }
.secondary-drawer summary small,
.secondary-drawer summary em { color: var(--muted); font-size: .8rem; font-style: normal; }
.secondary-drawer[open] summary { border-bottom: 1px solid var(--line); }
.drawer-grid { display: grid; grid-template-columns: minmax(240px, .7fr) minmax(0, 1.3fr); gap: 12px; padding: 12px; }
.settlement-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.settlement-strip > div { padding: 10px; background: var(--surface-soft); }
.settlement-strip dt { color: var(--muted); font-size: .8rem; }
.settlement-strip dd { margin: 4px 0 0; font-size: .9rem; }
.trace-table { max-height: 260px; overflow: auto; }
.trace-table table { min-width: 520px; }

@media (max-width: 920px) {
  .analysis-grid,
  .drawer-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi-card:nth-child(2) { border-right: 0; }
  .kpi-card:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
}

@media (max-width: 560px) {
  .container-dashboard { gap: 16px; }
  .kpi-card { padding: 12px; }
  .panel { padding: 14px; }
  .secondary-drawer summary { min-height: 60px; padding-inline: 14px; }
  .drawer-grid { padding: 8px; }
}
</style>
