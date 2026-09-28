<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { entryExportUrl, generateSettlementAnalysis, getSettlementDetail, type Grade, type SettlementComparisonItem, type SettlementDetail } from '../api/client'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import GradeFilterBar from '../components/GradeFilterBar.vue'
import GradeSummary from '../components/GradeSummary.vue'
import SettlementGradeBreakdown from '../components/SettlementGradeBreakdown.vue'
import AiAnalysisCard from '../components/AiAnalysisCard.vue'
import SearchableSelect from '../components/SearchableSelect.vue'
import { hasPermission } from '../auth'
import { countSameBrandPeers, settlementOptionLabel, settlementSeries } from '../utils/settlementComparison'
import { activeGrades } from '../utils/grades'
import { ANALYSIS_HEADINGS } from '../utils/seriesAnalysis'
import { useQuickPeriods } from '../utils/quickPeriods'
import { displayMerchantNo } from '../utils/merchantNo'
import { displayOrderNo } from '../utils/orderNo'
import { formatCurrency, formatNumber } from '../utils/format'
import { getCachedSettlementComparison } from '../utils/settlementCandidateCache'
import { downloadFile } from '../utils/fileDownload'

const route = useRoute()
const router = useRouter()
const filters = reactive({
  startDate: queryText(route.query.start_date),
  endDate: queryText(route.query.end_date),
  merchantNo: queryText(route.query.merchant_no),
  series: queryText(route.query.series),
})
const activeMerchantNo = ref('')
const options = ref<SettlementComparisonItem[]>([]); const detail = ref<SettlementDetail | null>(null); const loading = ref(true); const error = ref(''); let requestVersion = 0
const manualExporting = ref(false)
const manualExportNotice = ref('')
const manualExportError = ref('')
let activeController: AbortController | null = null

const filteredOptions = computed(() => filters.series
  ? options.value.filter((item) => settlementSeries(item) === filters.series)
  : options.value)
const brandOptions = computed(() => [...new Set(options.value.map((item) => settlementSeries(item)))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')))
const selectedOption = computed(() => filteredOptions.value.find((item) => item.merchantNo === activeMerchantNo.value))
const brandSelectOptions = computed(() =>
  [
    { value: '', label: '全部品牌' },
    ...brandOptions.value.map((brand) => ({ value: brand, label: brand })),
  ],
)
const merchantSelectOptions = computed(() =>
  filteredOptions.value.map((item) => ({
    value: item.merchantNo,
    label: settlementOptionLabel(item),
  })),
)
/** 商号文案统一用适配后写法；选项未加载时回退原始商号。 */
const activeMerchantLabel = computed(() =>
  selectedOption.value
    ? displayMerchantNo(selectedOption.value)
    : displayMerchantNo({ merchantNo: activeMerchantNo.value }),
)
/** 区块标题前缀：内部各菜单名统一带当前结算单的单号（用户要求）；未加载时兜底。 */
const sectionTitlePrefix = computed(() =>
  displayOrderNo(selectedOption.value ?? detail.value ?? {}) || '当前结算单',
)
const periodLabel = computed(() => detail.value?.startDate && detail.value?.endDate ? `${detail.value.startDate} 至 ${detail.value.endDate}` : '当前筛选范围暂无销售日期')
const aiResetKey = computed(() => `${activeMerchantNo.value}|${filters.series}|${filters.startDate}|${filters.endDate}`)
/** 后端要求「同品牌至少还有一张结算单」才可生成对比分析；不满足时不发请求。 */
const sameBrandPeerCount = computed(() =>
  countSameBrandPeers(options.value, activeMerchantNo.value),
)
const canGenerateSettlementAi = computed(() =>
  Boolean(activeMerchantNo.value && !loading.value && sameBrandPeerCount.value > 0),
)
const isManualEntry = computed(() => detail.value?.sourceType === 'manual')
const canEditManualEntry = computed(() => isManualEntry.value && hasPermission('entry:update'))
const canExportManualEntry = computed(() => isManualEntry.value && hasPermission('entry:export'))
const availableGradeOrder = computed(() => activeGrades([...(detail.value?.grades ?? []), ...(detail.value?.records ?? [])]))
const visibleGradeOrder = ref<Grade[]>([])
watch(availableGradeOrder, (grades) => {
  visibleGradeOrder.value = [...grades]
})

function queryText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function editManualEntry() {
  if (activeMerchantNo.value) {
    void router.push({ path: '/entry', query: { merchant_no: activeMerchantNo.value } })
  }
}

async function exportManualEntry() {
  if (!activeMerchantNo.value || manualExporting.value) return
  manualExporting.value = true
  manualExportNotice.value = ''
  manualExportError.value = ''
  try {
    const filename = await downloadFile(
      entryExportUrl(activeMerchantNo.value),
      `${activeMerchantLabel.value}-结算单.xlsx`,
    )
    manualExportNotice.value = `${filename} 已开始下载`
  } catch (caught) {
    manualExportError.value = caught instanceof Error ? caught.message : '导出失败，请稍后重试'
  } finally {
    manualExporting.value = false
  }
}

function runSettlementAi(refresh: boolean) {
  return generateSettlementAnalysis(
    activeMerchantNo.value,
    { startDate: filters.startDate, endDate: filters.endDate },
    { refresh },
  )
}

const settlementFacts = computed(() => {
  const current = detail.value
  if (!current) return []
  const salePeriod = current.startDate && current.endDate ? `${current.startDate} 至 ${current.endDate}` : '暂无'
  return [
    { label: '市场', value: current.market || '未登记' },
    { label: '单号', value: current.orderNoNormalized || current.orderNo || '未登记' },
    { label: '国家', value: current.country || '未登记' },
    { label: '到达市场日期', value: current.arrivalDate || '暂无' },
    { label: '销售日期', value: salePeriod },
    { label: '柜号', value: current.containerNo || '未登记' },
    { label: '转运公司', value: current.vehicleNo || '未登记' },
  ]
})

/** 经营指标随「销售表现」区块展示（用户要求从基础信息条挪入）。 */
const settlementMetrics = computed(() => {
  const current = detail.value
  if (!current) return []
  const afterSalesAmount = current.settlement.afterSalesAmount
  const afterSalesRatio = afterSalesAmount != null && current.total.salesAmount
    ? `${(afterSalesAmount / current.total.salesAmount * 100).toFixed(2)}%`
    : '—'
  const afterSalesCombined = afterSalesAmount == null
    ? '暂无'
    : `${formatCurrency(afterSalesAmount)} / ${afterSalesRatio}`
  return [
    { label: '来货数量（件）', value: current.arrivalQuantity == null ? '暂无' : formatNumber(current.arrivalQuantity) },
    { label: '销量', value: `${formatNumber(current.total.salesQuantity)} 件` },
    { label: '销售金额', value: formatCurrency(current.total.salesAmount) },
    { label: '售后金额/售后比', value: afterSalesCombined },
    { label: '市场费用', value: current.settlement.feeAmount == null ? '暂无' : formatCurrency(current.settlement.feeAmount) },
    { label: '应付贵方金额', value: current.settlement.payableAmount == null ? '暂无' : formatCurrency(current.settlement.payableAmount) },
  ]
})
async function loadOptions(signal?: AbortSignal) {
  options.value = await getCachedSettlementComparison(
    { startDate: filters.startDate, endDate: filters.endDate },
    { signal },
  )
  if (filters.series && !brandOptions.value.includes(filters.series)) {
    filters.series = ''
  }
  // 品牌收窄后，商号候选跟随当前品牌；若原商号已不在候选内，回落到新的第一张。
  if (!filteredOptions.value.some((item) => item.merchantNo === filters.merchantNo)) {
    filters.merchantNo = filteredOptions.value[0]?.merchantNo ?? ''
  }
}

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '销售日期起不能晚于销售日期止'
    return
  }
  const version = ++requestVersion
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  loading.value = true
  error.value = ''
  try {
    await loadOptions(controller.signal)
    if (!filters.merchantNo) {
      activeMerchantNo.value = ''
      detail.value = null
      return
    }
    const requestedMerchantNo = filters.merchantNo
    const dateFilters = { startDate: filters.startDate, endDate: filters.endDate }
    const nextDetail = await getSettlementDetail(requestedMerchantNo, dateFilters, { signal: controller.signal })
    if (version !== requestVersion) return
    activeMerchantNo.value = requestedMerchantNo
    detail.value = nextDetail
  } catch (caught) {
    if (controller.signal.aborted) return
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '结算单数据加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
const { quickYears, quickMonths, loadQuickPeriods } = useQuickPeriods()
onMounted(() => {
  void loadQuickPeriods()
  void refresh()
})
onBeforeUnmount(() => {
  requestVersion += 1
  activeController?.abort()
})
</script>

<template>
  <div class="settlement-dashboard">
    <form class="filter-bar" @submit.prevent="refresh">
      <SearchableSelect
        v-model="filters.series"
        :options="brandSelectOptions"
        label="品牌"
        aria-label="品牌"
        placeholder="全部品牌"
        :loading="loading"
        @change="refresh"
      />
      <SearchableSelect
        v-model="filters.merchantNo"
        :options="merchantSelectOptions"
        label="商号"
        aria-label="商号"
        placeholder="选择商号"
        :loading="loading"
        @change="refresh"
      />
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
        :years="quickYears"
        :months="quickMonths"
        @change="refresh"
      />
      <button class="primary-button" type="submit" :disabled="loading || !filters.merchantNo">{{ loading ? '正在查询' : '查看结果' }}</button>
    </form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>结算单数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span><button type="button" @click="refresh">重新查询</button></div>
    <div v-if="!loading && !options.length" class="empty-state prominent"><strong>暂无结算单数据</strong><span>目前没有可查看的结算单。请从左侧菜单进入“数据导入”，先导入结算单。</span></div>
    <template v-else>
      <section class="settlement-banner">
        <div class="settlement-identity">
          <strong>{{ selectedOption ? settlementOptionLabel(selectedOption) : activeMerchantNo }}</strong>
          <small>商号 {{ activeMerchantLabel }} · {{ detail?.containerNo ? `柜号 ${detail.containerNo}` : '未登记柜号' }} · 销售日期：{{ periodLabel }}</small>
        </div>
        <div v-if="canEditManualEntry || canExportManualEntry" class="manual-entry-actions">
          <button v-if="canEditManualEntry" class="ghost-button" type="button" @click="editManualEntry">修改录单</button>
          <button v-if="canExportManualEntry" class="primary-button" type="button" :disabled="manualExporting" @click="exportManualEntry">
            {{ manualExporting ? '导出中…' : '导出模板' }}
          </button>
        </div>
      </section>
      <p v-if="manualExportError" class="manual-export-status is-error" role="alert">{{ manualExportError }}</p>
      <p v-else-if="manualExportNotice" class="manual-export-status" role="status" aria-live="polite">{{ manualExportNotice }}</p>
      <section class="settlement-fact-grid" aria-label="结算单基础信息">
        <article v-for="item in settlementFacts" :key="item.label" class="settlement-fact">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>
      <section class="panel grade-summary-panel">
        <GradeFilterBar
          v-if="availableGradeOrder.length"
          v-model="visibleGradeOrder"
          :grades="availableGradeOrder"
        />
        <GradeSummary
          :grades="detail?.grades ?? []"
          :total="detail?.total ?? { salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null }"
          :loading="loading"
          :title="`${sectionTitlePrefix} 销售表现`"
          :grade-order="visibleGradeOrder"
          hide-total-strip
        />
        <section v-if="settlementMetrics.length" class="settlement-fact-grid metric-strip" aria-label="结算单经营指标">
          <article v-for="item in settlementMetrics" :key="item.label" class="settlement-fact">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>
        <SettlementGradeBreakdown
          :grades="detail?.grades ?? []"
          :records="detail?.records ?? []"
          :loading="loading"
          :grade-order="visibleGradeOrder"
          :title="`${sectionTitlePrefix} 等级图表`"
        />
      </section>
      <AiAnalysisCard
        :title="`${sectionTitlePrefix} 同品牌经营分析`"
        note="对比当前品牌下其他结算单的等级价格，给出可执行的经营建议"
        :headings="ANALYSIS_HEADINGS"
        :reset-key="aiResetKey"
        :can-generate="canGenerateSettlementAi"
        :run="runSettlementAi"
        generate-text="生成同品牌分析"
        empty-title="该品牌暂无其他结算单"
        empty-hint="同品牌只有这一张结算单，暂无可对比数据；新增同品牌结算单后即可生成。"
      />
    </template>
  </div>
</template>


<style scoped>
.settlement-dashboard { display: grid; gap: 18px; }
.settlement-banner,
.panel,
.settlement-fact-grid { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.settlement-banner { padding: 14px 16px; border-left: 4px solid var(--primary); }
.settlement-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.settlement-identity { display: grid; gap: 5px; }
.settlement-identity strong { overflow-wrap: anywhere; font-size: 1.05rem; }
.settlement-identity small { color: var(--muted); font-size: .85rem; line-height: 1.5; }
.manual-entry-actions { display: flex; gap: 8px; flex: 0 0 auto; }
.manual-entry-actions button { min-height: 36px; padding: 0 12px; border-radius: 9px; font-weight: 800; }
.manual-entry-actions button:disabled { cursor: wait; opacity: .65; }
.manual-export-status { margin: -8px 0 0; color: var(--primary-dark); font-size: .88rem; font-weight: 700; }
.manual-export-status.is-error { color: var(--danger); }
.settlement-fact-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.settlement-fact { display: grid; gap: 5px; min-width: 0; padding: 12px 14px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.settlement-fact span { color: var(--muted); font-size: .78rem; }
.settlement-fact strong { overflow-wrap: anywhere; font-size: .92rem; font-variant-numeric: tabular-nums; }
.panel { min-width: 0; padding: 16px; }
.grade-summary-panel :deep(.dashboard-section) { padding-top: 0; border-top: 0; }
/* 经营指标条随「销售表现」展示：6 项按 3 列排布，与等级卡片留出间距。 */
.metric-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; }

@media (max-width: 920px) {
  .settlement-fact-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .settlement-dashboard { gap: 6px; }
  .settlement-banner { padding: 6px 8px; border-left-width: 3px; align-items: flex-start; flex-direction: column; }
  .manual-entry-actions { width: 100%; }
  .manual-entry-actions button { flex: 1; }
  .settlement-identity { gap: 2px; }
  .settlement-identity strong { font-size: .92rem; line-height: 1.25; }
  .settlement-identity small { font-size: .7rem; line-height: 1.3; }
  .settlement-fact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settlement-fact { gap: 3px; padding: 9px 8px; }
  .settlement-fact span { font-size: .7rem; line-height: 1.2; }
  .settlement-fact strong { font-size: .86rem; line-height: 1.25; }
  .panel { padding: 10px; }
  .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
