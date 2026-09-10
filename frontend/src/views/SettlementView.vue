<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getSettlementComparison, getSettlementDetail, getTrend, gradeLabel, recordSourceUrl, type SettlementComparisonItem, type SettlementDetail, type TrendPoint } from '../api/client'
import GradeSummary from '../components/GradeSummary.vue'
import TrendChart from '../components/TrendChart.vue'
import { buildOtherSettlementGradeBaseline, settlementOptionLabel } from '../utils/settlementComparison'
import { formatAnomalyValue, formatCurrency, formatNumber, formatPercent, formatPrice } from '../utils/format'

const route = useRoute()
const filters = reactive({
  startDate: queryText(route.query.start_date),
  endDate: queryText(route.query.end_date),
  merchantNo: queryText(route.query.merchant_no),
})
const activeMerchantNo = ref('')
const options = ref<SettlementComparisonItem[]>([]); const detail = ref<SettlementDetail | null>(null); const trend = ref<TrendPoint[]>([]); const loading = ref(true); const error = ref(''); let requestVersion = 0
const selectedOption = computed(() => options.value.find((item) => item.merchantNo === activeMerchantNo.value))
const baseline = computed(() => buildOtherSettlementGradeBaseline(options.value, activeMerchantNo.value))
const periodLabel = computed(() => detail.value?.startDate && detail.value?.endDate ? `${detail.value.startDate} 至 ${detail.value.endDate}` : '当前筛选范围暂无到达日期')
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
  { label: '销售额排名', value: selectedOption.value?.rank?.salesAmount ? `第 ${selectedOption.value.rank.salesAmount} 名` : '—', note: `共 ${options.value.length || '—'} 个结算单` },
])
async function loadOptions() {
  options.value = await getSettlementComparison({ startDate: filters.startDate, endDate: filters.endDate })
  // 商号下拉默认选中第一张结算单；筛选范围变化后若原商号已不在候选内，回落到新的第一张。
  if (!options.value.some((item) => item.merchantNo === filters.merchantNo)) {
    filters.merchantNo = options.value[0]?.merchantNo ?? ''
  }
}

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '到达日期起不能晚于到达日期止'
    return
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    await loadOptions()
    if (!filters.merchantNo) {
      activeMerchantNo.value = ''
      detail.value = null
      trend.value = []
      return
    }
    const requestedMerchantNo = filters.merchantNo
    const dateFilters = { startDate: filters.startDate, endDate: filters.endDate }
    const [nextDetail, nextTrend] = await Promise.all([
      getSettlementDetail(requestedMerchantNo, dateFilters),
      getTrend({ ...dateFilters, merchantNo: requestedMerchantNo }),
    ])
    if (version !== requestVersion) return
    activeMerchantNo.value = requestedMerchantNo
    detail.value = nextDetail
    trend.value = nextTrend
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '结算单数据加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
onMounted(refresh)
</script>

<template>
  <div class="settlement-dashboard">
    <header class="dashboard-head"><div><h1>结算单详情</h1><p>选择一张结算单，查看销量、销售额和等级情况。</p></div></header>
    <section class="how-to" aria-label="查看方法"><strong>怎么查看</strong><span>第一步：按商号选择结算单和到达日期，切换商号会立即刷新。第二步：改完到达日期后点击“查看结果”。页面只显示当前结算单的数据。</span></section>
    <form class="filter-bar" @submit.prevent="refresh"><label>商号<select v-model="filters.merchantNo" required @change="refresh"><option value="" disabled>选择商号</option><option v-for="item in options" :key="item.merchantNo" :value="item.merchantNo">{{ settlementOptionLabel(item) }}</option></select></label><label>到达日期起<input v-model="filters.startDate" type="date"></label><label>到达日期止<input v-model="filters.endDate" type="date"></label><button class="primary-button" type="submit" :disabled="loading || !filters.merchantNo">{{ loading ? '正在查询' : '查看结果' }}</button></form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>结算单数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span><button type="button" @click="refresh">重新查询</button></div>
    <div v-if="!loading && !options.length" class="empty-state prominent"><strong>暂无结算单数据</strong><span>目前没有可查看的结算单。请从左侧菜单进入“数据导入”，先导入结算单。</span></div>
    <template v-else>
      <section class="settlement-banner"><div class="settlement-identity"><strong>{{ selectedOption ? settlementOptionLabel(selectedOption) : activeMerchantNo }}</strong><small>商号 {{ activeMerchantNo }} · {{ detail?.containerNo ? `柜号 ${detail.containerNo}` : '未登记柜号' }} · 到达日期：{{ periodLabel }}</small></div></section>
      <section class="kpi-grid" aria-label="销售核心指标"><article v-for="item in salesKpis" :key="item.label" class="kpi-card"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>{{ item.note }}</small></article></section>
      <section class="panel grade-summary-panel"><GradeSummary :grades="detail?.grades ?? []" :total="detail?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }" :loading="loading" :title="`${selectedOption ? settlementOptionLabel(selectedOption) : '当前结算单'} 等级表现`" /></section>
      <section class="analysis-grid"><div class="panel trend-panel"><TrendChart :points="trend" :loading="loading" title="该结算单每日销量和平均每件售价" /></div><div class="panel baseline-panel"><header class="panel-head"><h2>和同期其他结算单平均每件售价对比</h2></header><div v-if="loading" class="skeleton-block">正在计算对比数据</div><div v-else class="baseline-list"><div v-for="row in baselineRows" :key="row.grade" class="baseline-row"><span class="grade-badge" :class="`grade-${row.grade.toLowerCase()}`">{{ row.grade }}</span><div><strong>{{ gradeLabel(row.grade) }}</strong><small>本单 {{ formatPrice(row.weightedAvgPrice) }} · 其他结算单 {{ formatPrice(row.baselinePrice) }}</small></div><span :class="['delta-pill', { negative: row.delta !== null && row.delta < 0 }]">{{ row.delta === null ? '暂无对比' : `${row.delta >= 0 ? '+' : ''}${formatPercent(row.delta)}` }}</span></div></div></div></section>
      <section class="compact-alerts panel"><header class="panel-head"><h2>需要关注</h2></header><div v-if="!detail?.operatingAnomalies.length" class="empty-inline">当前未发现经营异常</div><ul v-else class="alert-list inline-alerts"><li v-for="(item, index) in detail.operatingAnomalies" :key="index" class="alert-item danger"><span class="alert-code">提醒</span><div><strong>{{ item.reason }}</strong><p>当前 {{ formatAnomalyValue(item.type, item.metric) }} · 全部 {{ formatAnomalyValue(item.type, item.baseline) }}</p></div></li></ul></section>
      <details class="secondary-drawer"><summary><span><b>查看结算和销售明细</b><small>需要核对原始数据时再展开</small></span><em>展开</em></summary><div class="drawer-grid"><section class="panel"><header class="panel-head"><h2>结算信息</h2></header><dl class="settlement-strip"><div><dt>售后金额</dt><dd>{{ detail?.settlement.afterSalesAmount == null ? '暂无数据' : formatCurrency(detail.settlement.afterSalesAmount) }}</dd></div><div><dt>费用合计</dt><dd>{{ detail?.settlement.feeAmount == null ? '暂无数据' : formatCurrency(detail.settlement.feeAmount) }}</dd></div><div><dt>清关税费</dt><dd>{{ detail?.settlement.customsTax == null ? '暂无数据' : formatCurrency(detail.settlement.customsTax) }}</dd></div><div><dt>应付结算</dt><dd>{{ detail?.settlement.payableAmount == null ? '暂无数据' : formatCurrency(detail.settlement.payableAmount) }}</dd></div></dl></section><section class="panel"><header class="panel-head"><h2>销售明细</h2><span>{{ detail?.records.length ?? 0 }} 条</span></header><div v-if="!detail?.records.length" class="empty-inline">当前范围没有销售明细</div><div v-else class="table-wrap trace-table"><table><thead><tr><th>到达日期</th><th>等级</th><th>数量</th><th>金额</th><th>来源</th></tr></thead><tbody><tr v-for="record in detail.records" :key="record.id"><td>{{ record.saleDate }}</td><td>{{ record.grade ? gradeLabel(record.grade) : '未知' }}</td><td>{{ formatNumber(record.quantity) }}</td><td>{{ formatCurrency(record.amount) }}</td><td><a class="text-link" :href="recordSourceUrl(record.id)">#{{ record.sourceFileId ?? '—' }}</a></td></tr></tbody></table></div></section></div></details>
    </template>
  </div>
</template>

<style scoped>
.settlement-dashboard { display: grid; gap: 18px; }
.dashboard-head { padding-bottom: 18px; border-bottom: 1px solid var(--line-strong); }
.dashboard-head h1 { margin-bottom: 6px; }
.dashboard-head p { margin: 0; color: var(--muted); font-size: .95rem; }
.settlement-banner,
.panel,
.kpi-grid,
.secondary-drawer { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.settlement-banner { padding: 14px 16px; border-left: 4px solid var(--primary); }
.settlement-identity { display: grid; gap: 5px; }
.settlement-identity strong { overflow-wrap: anywhere; font-size: 1.05rem; }
.settlement-identity small { color: var(--muted); font-size: .85rem; line-height: 1.5; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.kpi-card { display: grid; gap: 5px; min-width: 0; padding: 14px; border-right: 1px solid var(--line); }
.kpi-card:last-child { border-right: 0; }
.kpi-card span,
.kpi-card small { color: var(--muted); font-size: .85rem; }
.kpi-card strong { overflow-wrap: anywhere; font-size: 1.08rem; font-variant-numeric: tabular-nums; }
.panel { min-width: 0; padding: 16px; }
.grade-summary-panel :deep(.dashboard-section),
.trend-panel :deep(.dashboard-section) { padding-top: 0; border-top: 0; }
.analysis-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(290px, .75fr); gap: 18px; }
.panel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.panel-head h2 { margin: 0; }
.panel-head > span { color: var(--muted); font-size: .85rem; }
.baseline-list { display: grid; }
.baseline-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 58px; border-bottom: 1px solid var(--line); }
.baseline-row:last-child { border-bottom: 0; }
.baseline-row > div { display: grid; gap: 3px; min-width: 0; }
.baseline-row strong { font-size: .9rem; }
.baseline-row small { overflow-wrap: anywhere; color: var(--muted); font-size: .85rem; line-height: 1.4; }
.baseline-row .delta-pill { white-space: nowrap; }
.compact-alerts .alert-list { margin: 0; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }
.secondary-drawer { overflow: hidden; }
.secondary-drawer summary { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 16px; cursor: pointer; list-style: none; }
.secondary-drawer summary::-webkit-details-marker { display: none; }
.secondary-drawer summary span { display: grid; gap: 3px; }
.secondary-drawer summary b { font-size: .95rem; }
.secondary-drawer summary small,
.secondary-drawer summary em { color: var(--muted); font-size: .85rem; font-style: normal; }
.secondary-drawer[open] summary { border-bottom: 1px solid var(--line); }
.drawer-grid { display: grid; grid-template-columns: minmax(240px, .7fr) minmax(0, 1.3fr); gap: 12px; padding: 12px; }
.settlement-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.settlement-strip > div { padding: 10px; background: var(--surface-soft); }
.settlement-strip dt { color: var(--muted); font-size: .85rem; }
.settlement-strip dd { margin: 4px 0 0; font-size: .9rem; }
.trace-table { max-height: 260px; overflow: auto; }
.trace-table table { min-width: 520px; }
/* 等级与来源是文字列，左对齐更整齐。 */
.trace-table th:nth-child(2), .trace-table td:nth-child(2),
.trace-table th:nth-child(5), .trace-table td:nth-child(5) { text-align: left; }

@media (max-width: 920px) {
  .analysis-grid,
  .drawer-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi-card:nth-child(2) { border-right: 0; }
  .kpi-card:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
}

@media (max-width: 560px) {
  .settlement-dashboard { gap: 16px; }
  .kpi-card { padding: 12px; }
  .panel { padding: 14px; }
  .secondary-drawer summary { min-height: 60px; padding-inline: 14px; }
  .drawer-grid { padding: 8px; }
}
</style>
