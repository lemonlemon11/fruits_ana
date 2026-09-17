<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ApiError,
  confirmImportJob,
  getEntryFieldOptions,
  getImportDraft,
  getImportJob,
  updateImportDraft,
  type EntryPayload,
  type ImportConfirmResult,
  type ImportJob,
  type ImportReviewDraft,
  type ImportReviewIssue,
} from '../api/client'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import { computeEntryTotals, money } from '../utils/entryForm'
import type { EntryAfterSaleItem, EntryFeeItem, EntrySaleItem } from '../api/types'

const route = useRoute()
const router = useRouter()
const jobToken = typeof route.query.job === 'string' ? route.query.job : ''
const job = ref<ImportJob | null>(null)
const draft = ref<ImportReviewDraft | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const toast = ref('')
const confirmDialog = ref('')
const marketOptions = ref<string[]>([])

const form = reactive<EntryPayload>({
  merchantNo: '',
  orderNo: '',
  containerNo: '',
  vehicleNo: '',
  market: '',
  arrivalDate: '',
  arrivalQuantity: null,
  sales: [],
  afterSales: [],
  fees: [],
})

const saleColumns: DataTableColumn<EntrySaleItem>[] = [
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'saleDate', label: '销售日期' },
  { key: 'variety', label: '品种' },
  { key: 'headCount', label: '规格（头数）' },
  { key: 'specKg', label: '规格（KG）' },
  { key: 'remark', label: '备注' },
  { key: 'salesQuantity', label: '数量（件）', numeric: true },
  { key: 'unitPrice', label: '单价（元）', numeric: true },
  { key: 'amount', label: '金额（元）', numeric: true, value: (row) => money(rowSalesAmount(row)) },
  { key: 'actions', label: '操作' },
]
const afterSaleColumns: DataTableColumn<EntryAfterSaleItem>[] = [
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'content', label: '内容' },
  { key: 'summary', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  { key: 'actions', label: '操作' },
]
const feeColumns: DataTableColumn<EntryFeeItem>[] = [
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'name', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  { key: 'actions', label: '操作' },
]

const saleRowKey = (row: EntrySaleItem, index: number) => `sale-${index}-${row.sourceRow ?? 'new'}-${row.saleDate}-${row.headCount}`
const afterSaleRowKey = (row: EntryAfterSaleItem, index: number) => `after-${index}-${row.sourceRow ?? 'new'}-${row.content}`
const feeRowKey = (row: EntryFeeItem, index: number) => `fee-${index}-${row.sourceRow ?? 'new'}-${row.name}`

const totals = computed(() => computeEntryTotals(form.sales, form.afterSales, form.fees, form.arrivalQuantity))
const currentIssues = computed(() => draft.value?.payload.issues ?? [])
const errorIssues = computed(() => currentIssues.value.filter((item) => item.severity === 'error'))
const warningIssues = computed(() => currentIssues.value.filter((item) => item.severity === 'warning'))
const hasErrors = computed(() => errorIssues.value.length > 0)
const hasWarnings = computed(() => warningIssues.value.length > 0)
const firstIssue = computed(() => errorIssues.value[0] ?? warningIssues.value[0] ?? null)
const fileSummary = computed(() => draft.value?.payload.fileSummary ?? {})
const confirmSummary = computed(() => {
  if (errorIssues.value.length) {
    return `仍有 ${errorIssues.value.length} 项需先补全：\n${errorIssues.value.slice(0, 5).map((item) => item.message).join('\n')}`
  }
  if (warningIssues.value.length) {
    return `有 ${warningIssues.value.length} 项差异待核对：\n${warningIssues.value.slice(0, 5).map((item) => item.message).join('\n')}`
  }
  return '当前文件没有阻断项，确认提交后将写入结算单。'
})

function rowSalesAmount(row: EntrySaleItem): number {
  return Number(row.salesQuantity || 0) * Number(row.unitPrice || 0)
}

function saleAmountMismatch(row: EntrySaleItem): boolean {
  return Math.abs(rowSalesAmount(row) - Number(row.amount || 0)) >= 0.005
}

function formatQuantity(value: number): string {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

const summaryRows = computed(() => {
  const file = fileSummary.value
  const value = totals.value
  return [
    { key: 'sales_quantity', label: '总件数', file: formatQuantity(Number(file.sales_quantity || 0)), system: formatQuantity(value.totalPieces), mismatch: Math.abs(Number(file.sales_quantity || 0) - value.totalPieces) > 0.005 },
    { key: 'sales_amount', label: '销售金额', file: money(Number(file.sales_amount || 0)), system: money(value.salesAmount), mismatch: Math.abs(Number(file.sales_amount || 0) - value.salesAmount) >= 0.005 },
    { key: 'after_sale_amount', label: '售后合计', file: money(Number(file.after_sale_amount || 0)), system: money(value.afterAmount), mismatch: Math.abs(Number(file.after_sale_amount || 0) - value.afterAmount) >= 0.005 },
    { key: 'goods_amount', label: '货款合计', file: money(Number(file.goods_amount || 0)), system: money(value.goodsAmount), mismatch: Math.abs(Number(file.goods_amount || 0) - value.goodsAmount) >= 0.005 },
    { key: 'fee_amount', label: '费用合计', file: money(Number(file.fee_amount || 0)), system: money(value.feeAmount), mismatch: Math.abs(Number(file.fee_amount || 0) - value.feeAmount) >= 0.005 },
    { key: 'payable_amount', label: '应付贵方总金额(RMB)', file: money(Number(file.payable_amount || 0)), system: money(value.payable), mismatch: Math.abs(Number(file.payable_amount || 0) - value.payable) >= 0.005 },
  ]
})

function cellClass(section: string, rowIndex: number): string {
  if (hasRowError(section, rowIndex)) return 'cell-error'
  if (hasRowWarning(section, rowIndex)) return 'cell-warning'
  return ''
}

function rowIssues(section: string, rowIndex: number): ImportReviewIssue[] {
  return currentIssues.value.filter((issue) => issue.section === section && Number(issue.row) === rowIndex)
}

function hasRowError(section: string, rowIndex: number): boolean {
  return rowIssues(section, rowIndex).some((issue) => issue.severity === 'error')
}

function hasRowWarning(section: string, rowIndex: number): boolean {
  return !hasRowError(section, rowIndex) && rowIssues(section, rowIndex).some((issue) => issue.severity === 'warning')
}

function basicFieldIssues(field: string): ImportReviewIssue[] {
  return currentIssues.value.filter((issue) => issue.section === 'basic' && issue.field === field)
}

function basicFieldHasError(field: string): boolean {
  return basicFieldIssues(field).some((issue) => issue.severity === 'error')
}

function basicFieldHint(field: string): string {
  return basicFieldIssues(field).map((issue) => issue.message).join('；')
}

function applyDraft(value: ImportReviewDraft) {
  draft.value = value
  const payload = value.payload
  Object.assign(form, {
    merchantNo: payload.merchantNo,
    orderNo: payload.orderNo,
    containerNo: payload.containerNo,
    vehicleNo: payload.vehicleNo,
    market: payload.market,
    arrivalDate: payload.arrivalDate,
    arrivalQuantity: payload.arrivalQuantity,
    sales: payload.sales.map((row) => ({ ...row })),
    afterSales: payload.afterSales.map((row) => ({ ...row })),
    fees: payload.fees.map((row) => ({ ...row })),
  })
}

async function loadJob() {
  if (!jobToken) { error.value = '缺少导入任务参数'; loading.value = false; return }
  loading.value = true
  error.value = ''
  try {
    job.value = await getImportJob(jobToken)
    if (!job.value.drafts.length) throw new Error('该任务没有待确认文件')
    await loadDraft(job.value.drafts[0].token)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '导入任务加载失败'
  } finally {
    loading.value = false
  }
}

async function loadFieldOptions() {
  try {
    const markets = await getEntryFieldOptions('market')
    marketOptions.value = markets.map((item) => item.value)
  } catch {
    // 管理端字典不可用时保留表单原值，二次确认仍能完成。
  }
}

async function loadDraft(token: string) {
  loading.value = true
  error.value = ''
  try {
    const value = await getImportDraft(jobToken, token)
    applyDraft(value)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '草稿加载失败'
  } finally {
    loading.value = false
  }
}

async function persistCurrentDraft(): Promise<ImportReviewDraft | null> {
  if (!draft.value) return null
  const value = await updateImportDraft(jobToken, draft.value.draftToken, payloadFromForm())
  applyDraft(value)
  return value
}

async function switchDraft(token: string) {
  if (saving.value) return
  if (!draft.value || draft.value.draftToken === token) return
  saving.value = true
  error.value = ''
  try {
    await persistCurrentDraft()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '当前文件保存失败，未切换文件'
    saving.value = false
    return
  }
  saving.value = false
  await loadDraft(token)
}

function onFileSelect(event: Event) {
  void switchDraft((event.target as HTMLSelectElement).value)
}

function payloadFromForm(): EntryPayload {
  return {
    merchantNo: form.merchantNo,
    orderNo: form.orderNo,
    containerNo: form.containerNo,
    vehicleNo: form.vehicleNo,
    market: form.market,
    arrivalDate: form.arrivalDate,
    arrivalQuantity: form.arrivalQuantity,
    sales: form.sales.map((row) => ({ ...row })),
    afterSales: form.afterSales.map((row) => ({ ...row })),
    fees: form.fees.map((row) => ({ ...row })),
  }
}

function addSale() {
  form.sales.push({ sourceRow: null, saleDate: '', variety: '', headCount: '', specKg: '', salesQuantity: 0, unitPrice: 0, amount: 0, remark: '' })
}

function removeSale(index: number) {
  form.sales.splice(index, 1)
}

function addAfterSale() {
  form.afterSales.push({ sourceRow: null, content: '', summary: '', amount: 0 })
}

function removeAfterSale(index: number) {
  form.afterSales.splice(index, 1)
}

function addFee() {
  form.fees.push({ sourceRow: null, name: '', amount: 0, isCustom: true })
}

function removeFee(index: number) {
  form.fees.splice(index, 1)
}

function focusFirstIssue() {
  const target = document.querySelector('.cell-error, .field.error, .summary-line.error')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function saveDraft() {
  saving.value = true
  error.value = ''
  try {
    await persistCurrentDraft()
    toast.value = '已保存当前文件，重新计算了问题与合计'
    window.setTimeout(() => { if (toast.value) toast.value = '' }, 1800)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function openConfirm() {
  if (!draft.value) return
  saving.value = true
  error.value = ''
  try {
    await persistCurrentDraft()
    confirmDialog.value = confirmSummary.value
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '保存失败，无法提交'
  } finally {
    saving.value = false
  }
}

async function doSubmit(force = true) {
  if (!draft.value) return
  saving.value = true
  error.value = ''
  confirmDialog.value = ''
  try {
    const result: ImportConfirmResult = await confirmImportJob(jobToken, { force })
    toast.value = `已确认 ${result.confirmed.length} 张结算单`
    window.setTimeout(() => { void router.push('/imports') }, 500)
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 409) {
      try {
        const detail = typeof caught.message === 'string' ? JSON.parse(caught.message) : caught.message
        const blockers = detail?.blockers ?? []
        const conflicts = detail?.conflicts ?? []
        const messages: string[] = []
        for (const blocker of blockers) messages.push(`${blocker.file_name}：${blocker.issues.length} 个问题`)
        for (const conflict of conflicts) messages.push(`${conflict.file_name}：商号 ${conflict.merchant_no} 已存在`)
        confirmDialog.value = messages.join('\n') || '存在数据问题，是否仍要提交？'
      } catch {
        confirmDialog.value = '存在数据问题，是否仍要提交？'
      }
    } else {
      error.value = caught instanceof Error ? caught.message : '确认提交失败'
    }
  } finally {
    saving.value = false
  }
}

function goBack() { void router.push('/imports') }

onMounted(() => {
  loadJob()
  loadFieldOptions()
})
</script>

<template>
  <section class="review-modal">
    <div class="review-dialog" role="dialog" aria-modal="true" aria-label="导入文件二次确认">
      <header class="review-head">
        <span class="draft-state">待确认 · 尚未入库</span>
        <button class="modal-close" type="button" aria-label="关闭二次确认" @click="goBack">关闭</button>
      </header>

      <div class="review-body">
        <div v-if="loading" class="empty-card">正在加载复核数据…</div>
        <div v-else-if="error" class="error-card">{{ error }}</div>

        <template v-else>
      <div class="file-toolbar">
        <label for="review-file">待确认文件</label>
        <select id="review-file" :value="draft?.draftToken" :disabled="saving" @change="onFileSelect">
          <option v-for="item in job?.drafts ?? []" :key="item.token" :value="item.token">
            {{ item.fileName }} · 商号 {{ item.merchantNo }}
          </option>
        </select>
        <span class="file-name">{{ draft?.fileName }}</span>
      </div>

      <div class="status-panel" :class="{ ok: !hasErrors && !hasWarnings }">
        <div>
          <strong>{{ hasErrors ? `${errorIssues.length} 项需先补全 · ` : '' }}{{ hasWarnings ? `${warningIssues.length} 项差异待核对` : (hasErrors ? '' : '录入值与计算值已对齐') }}</strong>
          <p v-if="firstIssue">{{ firstIssue.message }}</p>
        </div>
        <button v-if="hasErrors || hasWarnings" type="button" @click="focusFirstIssue">定位问题 ↓</button>
      </div>

      <nav class="jump-nav" aria-label="表单分区">
        <a href="#basic">基本信息</a>
        <a href="#sales">销售明细</a>
        <a href="#after">售后明细</a>
        <a href="#fees">支出费用</a>
        <a href="#summary">结算核对</a>
      </nav>

      <section class="block" id="basic">
        <div class="block-title"><h2>基本信息</h2><span>来源：导入文件</span></div>
        <div class="basic-grid">
          <label class="field" :class="{ error: basicFieldHasError('merchant_no') }">
            <span>商号 *</span>
            <input v-model="form.merchantNo" aria-label="商号" />
            <span v-if="basicFieldHint('merchant_no')" class="field-hint">{{ basicFieldHint('merchant_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('container_no') }">
            <span>柜号</span>
            <input v-model="form.containerNo" aria-label="柜号" />
            <span v-if="basicFieldHint('container_no')" class="field-hint">{{ basicFieldHint('container_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('order_no') }">
            <span>单号 *</span>
            <input v-model="form.orderNo" aria-label="单号" />
            <span v-if="basicFieldHint('order_no')" class="field-hint">{{ basicFieldHint('order_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('vehicle_no') }">
            <span>转运公司 / 车牌号 *</span>
            <input v-model="form.vehicleNo" aria-label="转运公司 / 车牌号" />
            <span v-if="basicFieldHint('vehicle_no')" class="field-hint">{{ basicFieldHint('vehicle_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('market') }">
            <span>市场 *</span>
            <select v-model="form.market" aria-label="市场">
              <option disabled value="">请选择</option>
              <option v-for="item in marketOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <span v-if="basicFieldHint('market')" class="field-hint">{{ basicFieldHint('market') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('arrival_date') }">
            <span>到达市场日期 *</span>
            <input v-model="form.arrivalDate" type="date" aria-label="到达市场日期" />
            <span v-if="basicFieldHint('arrival_date')" class="field-hint">{{ basicFieldHint('arrival_date') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('arrival_quantity') }">
            <span>来货数量（件） *</span>
            <input v-model.number="form.arrivalQuantity" type="number" min="0" step="1" aria-label="来货数量（件）" />
            <span v-if="basicFieldHint('arrival_quantity')" class="field-hint">{{ basicFieldHint('arrival_quantity') }}</span>
          </label>
        </div>
      </section>

      <section class="block" id="sales">
        <div class="block-title"><h2>销售明细 <small>· {{ form.sales.length }} 行</small></h2><button class="outline" type="button" @click="addSale">添加销售行</button></div>
        <DataTable
          class="review-table sale-table"
          :columns="saleColumns"
          :rows="form.sales"
          :row-key="saleRowKey"
          bordered
          caption="销售明细二次确认"
          min-width="1080px"
          empty-text="没有销售明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-saleDate="{ row }">
            <input v-model="row.saleDate" type="date" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="销售日期" />
          </template>
          <template #cell-variety="{ row }">
            <input v-model="row.variety" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="品种" placeholder="如 A、B、AB、BC" />
          </template>
          <template #cell-headCount="{ row }">
            <input v-model="row.headCount" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="规格（头数）" placeholder="如 3/4" />
          </template>
          <template #cell-specKg="{ row }">
            <input v-model="row.specKg" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="规格（KG）" placeholder="如 10 或 9/10" />
          </template>
          <template #cell-remark="{ row }">
            <input v-model="row.remark" aria-label="备注" />
          </template>
          <template #cell-salesQuantity="{ row }">
            <input v-model.number="row.salesQuantity" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="数量（件）" />
          </template>
          <template #cell-unitPrice="{ row }">
            <input v-model.number="row.unitPrice" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('sales', form.sales.indexOf(row) + 1)" aria-label="单价（元）" placeholder="空白按 0" />
          </template>
          <template #cell-amount="{ row }">
            <strong class="money-amount">{{ money(rowSalesAmount(row)) }}</strong>
            <div v-if="saleAmountMismatch(row)" class="row-error">原文件 {{ money(Number(row.amount || 0)) }} · 已重算</div>
          </template>
          <template #cell-actions="{ row }"><button class="delete-row" type="button" @click="removeSale(form.sales.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">
          <span>总件数 <strong>{{ formatQuantity(totals.totalPieces) }}</strong> 件</span>
          <span>销售金额 <strong>{{ money(totals.salesAmount) }}</strong> 元</span>
        </div>
      </section>

      <section class="block" id="after">
        <div class="block-title"><h2>售后明细</h2><button class="outline" type="button" @click="addAfterSale">添加售后行</button></div>
        <DataTable
          class="review-table smaller"
          :columns="afterSaleColumns"
          :rows="form.afterSales"
          :row-key="afterSaleRowKey"
          bordered
          caption="售后明细二次确认"
          min-width="640px"
          empty-text="没有售后明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-content="{ row }"><input v-model="row.content" :class="cellClass('after_sales', form.afterSales.indexOf(row) + 1)" aria-label="售后内容" /></template>
          <template #cell-summary="{ row }"><input v-model="row.summary" aria-label="售后摘要" /></template>
          <template #cell-amount="{ row }"><input v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('after_sales', form.afterSales.indexOf(row) + 1)" aria-label="售后金额（元）" /></template>
          <template #cell-actions="{ row }"><button class="delete-row" type="button" @click="removeAfterSale(form.afterSales.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">售后合计 <strong>{{ money(totals.afterAmount) }}</strong> 元</div>
      </section>

      <section class="block" id="fees">
        <div class="block-title"><h2>支出费用</h2><button class="outline" type="button" @click="addFee">添加费用行</button></div>
        <DataTable
          class="review-table smaller"
          :columns="feeColumns"
          :rows="form.fees"
          :row-key="feeRowKey"
          bordered
          caption="支出费用二次确认"
          min-width="540px"
          empty-text="没有费用明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-name="{ row }"><input v-model="row.name" :class="cellClass('fees', form.fees.indexOf(row) + 1)" aria-label="费用摘要" /></template>
          <template #cell-amount="{ row }"><input v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('fees', form.fees.indexOf(row) + 1)" aria-label="费用金额（元）" /></template>
          <template #cell-actions="{ row }"><button class="delete-row" type="button" @click="removeFee(form.fees.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">费用合计 <strong>{{ money(totals.feeAmount) }}</strong> 元</div>
      </section>

      <section class="block" id="summary">
        <div class="block-title"><h2>结算核对</h2></div>
        <div class="summary-table">
          <div class="summary-head"><span>核对项目</span><span>文件填写</span><span>系统计算 · 提交值</span></div>
          <div v-for="row in summaryRows" :key="row.key" class="summary-line" :class="{ error: row.mismatch, total: row.key === 'payable_amount' }">
            <span>{{ row.label }}</span>
            <span class="original">{{ row.file }}</span>
            <span><strong>{{ row.system }}</strong></span>
          </div>
        </div>
        <p class="summary-note">正式入库以「系统计算 · 提交值」为准；有差异会记录留痕。</p>
      </section>

      <div class="actions">
        <span>确认前可保存修改，红色行 / 字段为阻断项，黄色为提示项。</span>
        <button class="subtle" type="button" :disabled="saving" @click="saveDraft">保存当前修改</button>
        <button class="primary" type="button" :disabled="saving" @click="openConfirm">确认提交</button>
      </div>
      </template>
      </div>
    </div>

    <div v-if="confirmDialog" class="overlay" role="dialog" aria-modal="true">
      <section class="dialog">
        <p class="dialog-kicker">提交前核对</p>
        <h2>{{ hasErrors ? '仍有必填或格式问题，是否带错提交？' : hasWarnings ? '存在差异，是否以当前修正结果提交？' : '确认提交这张结算单？' }}</h2>
        <p class="dialog-text">{{ confirmDialog }}</p>
        <p>继续提交将以当前填写值入库；系统金额和汇总会按自洽口径修正。</p>
        <div class="dialog-actions">
          <button class="subtle" type="button" @click="confirmDialog = ''">返回修改</button>
          <button class="primary" type="button" :disabled="saving" @click="doSubmit(true)">确认提交</button>
        </div>
      </section>
    </div>

    <p v-if="toast" class="toast" role="status">{{ toast }}</p>
  </section>
</template>

<style scoped>
.review-modal { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgb(24 49 42 / 55%); overflow: hidden; }
.review-dialog { position: relative; display: flex; flex-direction: column; width: min(1280px, 100%); height: min(920px, calc(100vh - 48px)); border-radius: 16px; background: var(--surface); box-shadow: 0 18px 60px rgb(0 0 0 / 24%); overflow: hidden; }
.review-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--surface); }
.review-body { flex: 1; overflow: auto; display: grid; gap: 14px; padding: 4px 16px 20px; }
.draft-state { padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--primary-soft); color: var(--primary-dark); font-size: .8rem; font-weight: 800; white-space: nowrap; }
.modal-close { flex: none; min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: #fff; color: var(--ink); font-weight: 800; }
.modal-close:hover { border-color: var(--primary); color: var(--primary); }
.file-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 11px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.file-toolbar label { font-weight: 800; white-space: nowrap; }
.file-toolbar select { min-width: min(280px, 100%); min-height: 38px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; padding: 0 10px; }
.file-name { color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }
.status-panel { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 14px; border-left: 4px solid var(--warning); border-radius: 8px; background: var(--warning-soft); }
.status-panel.ok { border-color: var(--primary); background: var(--primary-soft); }
.status-panel strong { font-size: .96rem; }
.status-panel p { margin: 4px 0 0; color: var(--muted); font-size: .78rem; }
.status-panel button { border: 0; background: transparent; color: var(--danger); font-weight: 800; }
.jump-nav { display: flex; flex-wrap: wrap; gap: 18px; margin: 10px 0 4px; padding: 2px 2px 11px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: .85rem; }
.jump-nav a { color: inherit; text-decoration: none; }
.jump-nav a:hover { color: var(--primary-dark); }
.block { scroll-margin-top: 12px; min-width: 0; padding: 16px; border: 2px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); }
.block-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.block-title h2 { margin: 0; font-size: 1.02rem; }
.block-title small { margin-left: 5px; color: var(--muted); font-size: .78rem; font-weight: 400; }
.block-title span { color: var(--muted); font-size: .78rem; }
.outline, .subtle, .primary { min-height: 36px; padding: 7px 12px; border-radius: 6px; font-weight: 800; white-space: nowrap; }
.outline { border: 1px solid var(--primary); background: #fff; color: var(--primary); }
.subtle { border: 1px solid var(--line-strong); background: #fff; color: var(--ink); }
.primary { border: 1px solid var(--primary); background: var(--primary); color: #fff; }
.basic-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 14px; }
.field { display: flex; flex-direction: column; min-width: 0; gap: 6px; color: var(--muted); font-size: .78rem; font-weight: 700; }
.field input, .field select { width: 100%; min-height: 38px; padding: 6px 9px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; color: var(--ink); font: inherit; }
.field.error input, .field.error select { border-color: var(--danger); background: #fff5f5; }
.field-hint { color: var(--danger); font-size: .72rem; font-weight: 400; }
.review-table :deep(.data-table td) { padding: .38rem .5rem; }
.review-table :deep(.data-table thead th) { padding: .5rem .6rem; }
.review-table input { width: 100%; min-height: 36px; padding: 5px 7px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; color: var(--ink); font: inherit; }
.review-table input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); outline: none; }
.review-table input.cell-error { border-color: var(--danger); background: #fff5f5; }
.review-table input.cell-warning { border-color: var(--warning); background: #fffbf0; }
.source { color: var(--muted); font-size: .78rem; }
.money-amount { color: var(--primary-dark); font-weight: 800; }
.row-error { margin-top: 4px; color: var(--danger); font-size: .72rem; }
.delete-row { border: 0; background: transparent; color: var(--danger); font-weight: 800; white-space: nowrap; }
.review-table :deep(.data-table td:last-child) { white-space: nowrap; }
.section-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 10px; color: var(--muted); font-size: .84rem; }
.section-foot strong { color: var(--ink); }
.summary-table { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.summary-head, .summary-line { display: grid; grid-template-columns: 1.15fr 1fr 1fr; align-items: center; gap: 15px; padding: 11px 15px; border-bottom: 1px solid var(--line); }
.summary-head { background: var(--surface-soft); color: var(--muted); font-size: .78rem; font-weight: 800; }
.summary-line { font-size: .88rem; }
.summary-line span:nth-child(n+2) { text-align: right; }
.summary-line .original { color: var(--muted); }
.summary-line strong { color: var(--primary-dark); }
.summary-line.error { background: #fff4f3; box-shadow: inset 3px 0 var(--danger); }
.summary-line.error .original { color: var(--danger); text-decoration: line-through; }
.summary-line.error strong { color: var(--danger); }
.summary-line.total { background: var(--primary-soft); font-weight: 800; border-bottom: 0; }
.summary-line.total strong { font-size: 1rem; }
.summary-note { margin: 10px 1px 0; color: var(--muted); font-size: .76rem; }
.actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; }
.actions span { margin-right: auto; color: var(--muted); font-size: .78rem; }
.empty-card, .error-card { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.error-card { color: var(--danger); }
.toast { position: fixed; right: 20px; bottom: 24px; z-index: 21; padding: 10px 14px; border-radius: 10px; background: var(--primary); color: #fff; }
.overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgb(24 49 42 / 45%); padding: 16px; }
.dialog { width: min(520px, 100%); padding: 20px; border-radius: 14px; background: #fff; box-shadow: 0 16px 40px rgb(0 0 0 / 18%); }
.dialog-kicker { color: var(--danger); font-size: .76rem; font-weight: 800; }
.dialog h2 { margin: 8px 0 12px; font-size: 1.2rem; }
.dialog-text { white-space: pre-wrap; color: var(--danger); line-height: 1.6; }
.dialog p { line-height: 1.6; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
@media (max-width: 900px) {
  .basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .review-head { align-items: flex-start; flex-direction: column; }
  .basic-grid { grid-template-columns: 1fr; }
  .summary-head, .summary-line { grid-template-columns: 1fr .95fr 1fr; gap: 6px; padding: 10px 8px; font-size: .76rem; }
  .actions span { flex-basis: 100%; }
}
</style>
