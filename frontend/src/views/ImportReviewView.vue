<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDatePicker, ElDialog, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import 'element-plus/es/components/date-picker/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'
import {
  ApiError,
  confirmImportJob,
  getEntryFieldOptions,
  getImportDraft,
  getImportJob,
  getSettlementReview,
  updateImportDraft,
  type EntryPayload,
  type ImportConfirmResult,
  type ImportJob,
  type ImportReviewDraft,
  type ImportReviewIssue,
} from '../api/client'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import { computeEntryTotals, money, salesExceedsArrival } from '../utils/entryForm'
import { cellClassFor, hasHardBlockIssue, rowClassFor } from '../utils/importReviewIssues'
import { createLogger } from '../utils/logger'
import type { EntryAfterSaleItem, EntryFeeItem, EntrySaleItem } from '../api/types'

const logger = createLogger('import-review')
const route = useRoute()
const router = useRouter()
/** 表单分区锚点：点击滚动到对应分区。 */
const BLOCK_IDS = ['basic', 'sales', 'after', 'fees', 'summary'] as const
type BlockId = (typeof BLOCK_IDS)[number]
async function jumpToBlock(id: BlockId) {
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const jobToken = typeof route.query.job === 'string' ? route.query.job : ''
const merchantNo = typeof route.query.merchant_no === 'string' ? route.query.merchant_no : ''
const isReadonly = computed(() => route.query.readonly === '1')
const job = ref<ImportJob | null>(null)
const draft = ref<ImportReviewDraft | null>(null)
const loading = ref(true)
const saving = ref(false)
type SavingAction = 'switch' | 'restore' | 'prepare' | 'submit' | ''
const savingAction = ref<SavingAction>('')
const error = ref('')
const confirmDialog = ref('')
const confirmOpen = ref(false)
const confirmForce = ref(false)
const hardBlocked = ref(false)
const marketOptions = ref<string[]>([])
const fileSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)
const marketSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)
// 下拉点选即失焦（用户要求）：不再停留在可继续输入的编辑态。
function blurMarketSelect() {
  nextTick(() => marketSelectRef.value?.blur())
}

/** 全局消息统一走 ElMessage。 */
function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  ElMessage({ message, type, duration: 1800 })
}
const savingMessage = computed(() => ({
  switch: '正在切换文件…',
  restore: '正在还原…',
  prepare: '正在保存…',
  submit: '正在提交…',
  '': '',
})[savingAction.value])

const form = reactive<EntryPayload>({
  merchantNo: '',
  orderNo: '',
  containerNo: '',
  vehicleNo: '',
  country: '',
  market: '',
  arrivalDate: '',
  arrivalQuantity: null,
  sales: [],
  afterSales: [],
  fees: [],
})

const saleColumns = computed<DataTableColumn<EntrySaleItem>[]>(() => centerColumns([
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'saleDate', label: '销售日期' },
  { key: 'variety', label: '品种' },
  { key: 'grade', label: '等级' },
  { key: 'headCount', label: '规格（头数）' },
  { key: 'specKg', label: '规格（KG）' },
  { key: 'remark', label: '备注' },
  { key: 'salesQuantity', label: '数量（件）', numeric: true },
  { key: 'unitPrice', label: '单价（元）', numeric: true },
  { key: 'amount', label: '金额（元）', numeric: true, value: (row) => money(rowSalesAmount(row)) },
  ...(isReadonly.value ? [] : [{ key: 'actions', label: '操作' }]),
]))
const afterSaleColumns = computed<DataTableColumn<EntryAfterSaleItem>[]>(() => centerColumns([
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'content', label: '内容' },
  { key: 'summary', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  ...(isReadonly.value ? [] : [{ key: 'actions', label: '操作' }]),
]))
const feeColumns = computed<DataTableColumn<EntryFeeItem>[]>(() => centerColumns([
  { key: 'sourceRow', label: '文件行', value: (row) => row.sourceRow ?? '新增' },
  { key: 'name', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  ...(isReadonly.value ? [] : [{ key: 'actions', label: '操作' }]),
]))

const saleRowKey = (_row: EntrySaleItem, index: number) => `sale-${index}`
const afterSaleRowKey = (_row: EntryAfterSaleItem, index: number) => `after-${index}`

/** 只读「查看明细」合并展示：与结算单导出同口径（同日 / 品种 / 等级 / 规格头数 / KG /
 *  单价 / 备注一致的行并为一行），数量与原文件金额各自汇总；显示金额按 数量×单价
 *  重算，区块合计（totals 按原始行计算）不变。编辑态返回原始行。 */
const displaySalesRows = computed<EntrySaleItem[]>(() => {
  if (!isReadonly.value) return form.sales
  const merged = new Map<string, EntrySaleItem>()
  for (const row of form.sales) {
    const key = [row.saleDate, row.variety, row.grade, row.headCount, row.specKg, row.unitPrice, row.remark]
      .map((value) => String(value ?? ''))
      .join('\u0000')
    const hit = merged.get(key)
    if (hit) {
      hit.salesQuantity = Number(hit.salesQuantity || 0) + Number(row.salesQuantity || 0)
      hit.amount = Number(hit.amount || 0) + Number(row.amount || 0)
    } else {
      merged.set(key, { ...row })
    }
  }
  return [...merged.values()]
})
const displaySalesCount = computed(() => (isReadonly.value ? displaySalesRows.value.length : form.sales.length))

/** 只读态表头与单元格内容居中（用户要求）；编辑态保持默认对齐（数值右对齐等）。 */
function centerColumns<Row>(columns: DataTableColumn<Row>[]): DataTableColumn<Row>[] {
  return isReadonly.value ? columns.map((column) => ({ ...column, align: 'center' as const })) : columns
}
const feeRowKey = (_row: EntryFeeItem, index: number) => `fee-${index}`

const totals = computed(() => computeEntryTotals(form.sales, form.afterSales, form.fees, form.arrivalQuantity))
const currentIssues = computed(() => draft.value?.payload.issues ?? [])
const errorIssues = computed(() => currentIssues.value.filter((item) => item.severity === 'error'))
const warningIssues = computed(() => currentIssues.value.filter((item) => item.severity === 'warning'))
const hasErrors = computed(() => errorIssues.value.length > 0)
const hasWarnings = computed(() => warningIssues.value.length > 0)
/** 硬阻断问题（销售区 error / 销售合计超来货数量）：不允许带错提交。 */
const hasHardBlockErrors = computed(() => hasHardBlockIssue(currentIssues.value))
/** 本地实时判定销售合计是否已超来货数量，与服务端 issues 的高亮互为补充。 */
const salesExceedArrival = computed(() => salesExceedsArrival(form.arrivalQuantity, totals.value.totalPieces))
const firstIssue = computed(() => errorIssues.value[0] ?? warningIssues.value[0] ?? null)
const fileSummary = computed(() => draft.value?.payload.fileSummary ?? {})
const warningSummaryLines = computed(() => warningIssues.value.slice(0, 6).map((item) => item.message))
const SECTION_LABELS: Record<string, string> = {
  basic: '基本信息',
  sales: '销售明细',
  after_sales: '售后明细',
  fees: '费用明细',
  summary: '汇总',
}
const FIELD_LABELS: Record<string, string> = {
  merchant_no: '商号',
  order_no: '单号',
  container_no: '柜号',
  vehicle_no: '转运公司',
  country: '国家',
  market: '市场',
  arrival_date: '到达市场日期',
  arrival_quantity: '来货数量',
  sale_date: '销售日期',
  variety: '品种',
  grade: '等级',
  head_count: '规格（头数）',
  spec_kg: '规格（KG）',
  remark: '备注',
  sales_quantity: '数量',
  unit_price: '单价',
  amount: '金额',
  content: '售后内容',
  name: '费用摘要',
}

function issueLocation(issue: ImportReviewIssue): string {
  const section = SECTION_LABELS[issue.section ?? ''] ?? issue.section ?? '汇总'
  return issue.row ? `${section} · 第 ${issue.row} 行` : section
}

function issueFieldLabel(issue: ImportReviewIssue): string {
  return issue.field ? FIELD_LABELS[issue.field] ?? issue.field : '整行'
}

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

function cellClass(section: string, rowIndex: number, field?: string): string {
  return cellClassFor(currentIssues.value, section, rowIndex, field)
}

function rowClass(section: string, rowIndex: number): string {
  return rowClassFor(currentIssues.value, section, rowIndex)
}

function salesRowClass(_row: EntrySaleItem, index: number): string {
  return rowClass('sales', index + 1)
}

function afterSaleRowClass(_row: EntryAfterSaleItem, index: number): string {
  return rowClass('after_sales', index + 1)
}

function feeRowClass(_row: EntryFeeItem, index: number): string {
  return rowClass('fees', index + 1)
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
    country: payload.country,
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

async function loadSettlementReview() {
  if (!merchantNo) {
    error.value = '缺少结算单商号'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const value = await getSettlementReview(merchantNo)
    applyDraft(value)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '结算单明细加载失败'
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

let revalidateTimer: number | undefined

async function revalidateDraft() {
  if (!draft.value || isReadonly.value) return
  try {
    const value = await updateImportDraft(jobToken, draft.value.draftToken, payloadFromForm())
    if (draft.value && draft.value.draftToken === value.draftToken) {
      draft.value = value
    }
  } catch {
    // 自动重校验失败时保留当前高亮，不打断用户编辑。
  }
}

watch(
  form,
  () => {
    if (!draft.value || isReadonly.value) return
    window.clearTimeout(revalidateTimer)
    revalidateTimer = window.setTimeout(() => { void revalidateDraft() }, 450)
  },
  { deep: true },
)

async function switchDraft(token: string) {
  if (saving.value) return
  if (!draft.value || draft.value.draftToken === token) return
  saving.value = true
  savingAction.value = 'switch'
  error.value = ''
  try {
    await persistCurrentDraft()
    await loadDraft(token)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '当前文件保存失败，未切换文件'
  } finally {
    saving.value = false
    savingAction.value = ''
  }
}

function onFileChange(value: string | number | boolean | object) {
  // 点选即失焦（用户要求）：切换文件后收起 filterable 下拉的编辑态。
  nextTick(() => fileSelectRef.value?.blur())
  void switchDraft(String(value))
}

function payloadFromForm(): EntryPayload {
  return {
    merchantNo: form.merchantNo,
    orderNo: form.orderNo,
    containerNo: form.containerNo,
    vehicleNo: form.vehicleNo,
    country: form.country,
    market: form.market,
    arrivalDate: form.arrivalDate,
    arrivalQuantity: form.arrivalQuantity,
    sales: form.sales.map((row) => ({ ...row })),
    afterSales: form.afterSales.map((row) => ({ ...row })),
    fees: form.fees.map((row) => ({ ...row })),
  }
}

interface ReviewChange {
  label: string
  before: string
  after: string
  impact: string
}

function displayText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function displayMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return money(Number(value || 0))
}

function pushChangedField(
  changes: ReviewChange[],
  label: string,
  before: unknown,
  after: unknown,
  impact: string,
  formatter: (value: unknown) => string = displayText,
) {
  if (before === after) return
  changes.push({
    label,
    before: formatter(before),
    after: formatter(after),
    impact,
  })
}

const reviewChanges = computed<ReviewChange[]>(() => {
  const original = draft.value?.originalPayload
  const current = payloadFromForm()
  if (!original) return []

  const changes: ReviewChange[] = []
  const basicFields = [
    { key: 'merchantNo', label: '商号', impact: '影响结算单归属与覆盖对象' },
    { key: 'orderNo', label: '单号', impact: '影响结算单标识' },
    { key: 'containerNo', label: '柜号', impact: '影响结算单基础信息' },
    { key: 'vehicleNo', label: '转运公司 / 车牌号', impact: '影响结算单基础信息' },
    { key: 'country', label: '国家', impact: '影响结算单基础信息' },
    { key: 'market', label: '市场', impact: '影响市场归属与统计口径' },
    { key: 'arrivalDate', label: '到达市场日期', impact: '影响日期筛选与趋势统计' },
    { key: 'arrivalQuantity', label: '来货数量', impact: '影响数量统计与占比' },
  ] as const
  for (const field of basicFields) {
    pushChangedField(changes, `基本信息 · ${field.label}`, original[field.key], current[field.key], field.impact)
  }

  const saleFields = [
    { key: 'saleDate', label: '销售日期', formatter: displayText, impact: '影响该行销售日期' },
    { key: 'variety', label: '品种', formatter: displayText, impact: '影响该行销售明细' },
    { key: 'grade', label: '等级', formatter: displayText, impact: '影响等级与销售口径' },
    { key: 'headCount', label: '规格（头数）', formatter: displayText, impact: '影响该行销售明细' },
    { key: 'specKg', label: '规格（KG）', formatter: displayText, impact: '影响该行销售明细' },
    { key: 'salesQuantity', label: '数量（件）', formatter: displayText, impact: '影响该行金额、总件数与销售金额' },
    { key: 'unitPrice', label: '单价（元）', formatter: displayMoney, impact: '影响该行金额与销售金额' },
    { key: 'amount', label: '原文件金额（元）', formatter: displayMoney, impact: '系统金额会按数量×单价重算' },
    { key: 'remark', label: '备注', formatter: displayText, impact: '影响该行销售明细' },
  ] as const
  for (let index = 0; index < Math.max(original.sales.length, current.sales.length); index += 1) {
    const before = original.sales[index]
    const after = current.sales[index]
    const rowLabel = `销售明细 ${index + 1}${before?.sourceRow ? ` · 原文件行 ${before.sourceRow}` : ''}`
    if (!before || !after) {
      changes.push({
        label: rowLabel,
        before: before ? '已存在' : '—',
        after: after ? '新增销售行' : '已删除',
        impact: after ? '新增一行销售明细，影响总件数、销售金额及汇总' : '删除一行销售明细，影响总件数、销售金额及汇总',
      })
      continue
    }
    for (const field of saleFields) {
      pushChangedField(changes, `${rowLabel} · ${field.label}`, before[field.key], after[field.key], field.impact, field.formatter)
    }
  }

  const afterSaleFields = [
    { key: 'content', label: '内容', formatter: displayText, impact: '影响售后明细' },
    { key: 'summary', label: '摘要', formatter: displayText, impact: '影响售后明细' },
    { key: 'amount', label: '金额（元）', formatter: displayMoney, impact: '影响售后合计、货款合计与应付总额' },
  ] as const
  for (let index = 0; index < Math.max(original.afterSales.length, current.afterSales.length); index += 1) {
    const before = original.afterSales[index]
    const after = current.afterSales[index]
    const rowLabel = `售后明细 ${index + 1}${before?.sourceRow ? ` · 原文件行 ${before.sourceRow}` : ''}`
    if (!before || !after) {
      changes.push({
        label: rowLabel,
        before: before ? '已存在' : '—',
        after: after ? '新增售后行' : '已删除',
        impact: after ? '新增售后行，影响售后合计、货款合计与应付总额' : '删除售后行，影响售后合计、货款合计与应付总额',
      })
      continue
    }
    for (const field of afterSaleFields) {
      pushChangedField(changes, `${rowLabel} · ${field.label}`, before[field.key], after[field.key], field.impact, field.formatter)
    }
  }

  const feeFields = [
    { key: 'name', label: '摘要', formatter: displayText, impact: '影响费用明细' },
    { key: 'amount', label: '金额（元）', formatter: displayMoney, impact: '影响费用合计与应付总额' },
  ] as const
  for (let index = 0; index < Math.max(original.fees.length, current.fees.length); index += 1) {
    const before = original.fees[index]
    const after = current.fees[index]
    const rowLabel = `支出费用 ${index + 1}${before?.sourceRow ? ` · 原文件行 ${before.sourceRow}` : ''}`
    if (!before || !after) {
      changes.push({
        label: rowLabel,
        before: before ? '已存在' : '—',
        after: after ? '新增费用行' : '已删除',
        impact: after ? '新增费用行，影响费用合计与应付总额' : '删除费用行，影响费用合计与应付总额',
      })
      continue
    }
    for (const field of feeFields) {
      pushChangedField(changes, `${rowLabel} · ${field.label}`, before[field.key], after[field.key], field.impact, field.formatter)
    }
  }

  return changes
})

function addSale() {
  form.sales.push({ sourceRow: null, saleDate: '', variety: '', grade: '', headCount: '', specKg: '', salesQuantity: '', unitPrice: 0, amount: 0, remark: '' })
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
  logger.info('removeFee', {
    index,
    fee: form.fees[index],
    remaining: form.fees.map((item) => ({ name: item.name, amount: item.amount })),
  })
  form.fees.splice(index, 1)
}

async function focusFirstIssue() {
  await nextTick()
  const target = document.querySelector('.cell-error, .field.error, .summary-line.error')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function restoreCurrentDraft() {
  if (!draft.value) return
  const original = draft.value.originalPayload
  saving.value = true
  savingAction.value = 'restore'
  error.value = ''
  try {
    Object.assign(form, {
      merchantNo: original.merchantNo,
      orderNo: original.orderNo,
      containerNo: original.containerNo,
      vehicleNo: original.vehicleNo,
      country: original.country,
      market: original.market,
      arrivalDate: original.arrivalDate,
      arrivalQuantity: original.arrivalQuantity,
      sales: original.sales.map((row) => ({ ...row })),
      afterSales: original.afterSales.map((row) => ({ ...row })),
      fees: original.fees.map((row) => ({ ...row })),
    })
    await persistCurrentDraft()
    showToast('已还原为导入解析值')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '还原失败'
  } finally {
    saving.value = false
    savingAction.value = ''
  }
}

async function openConfirm() {
  if (!draft.value) return
  saving.value = true
  savingAction.value = 'prepare'
  error.value = ''
  logger.info('openConfirm start', {
    jobToken,
    draftToken: draft.value.draftToken,
    feeCount: form.fees.length,
    fees: form.fees.map((item) => ({ name: item.name, amount: item.amount })),
  })
  try {
    await persistCurrentDraft()
    confirmForce.value = false
    hardBlocked.value = false
    confirmDialog.value = ''
    confirmOpen.value = true
  } catch (caught) {
    logger.error('openConfirm failed', caught)
    error.value = caught instanceof Error ? caught.message : '保存失败，无法提交'
  } finally {
    saving.value = false
    savingAction.value = ''
  }
}

async function doSubmit(force = false) {
  if (!draft.value) return
  saving.value = true
  savingAction.value = 'submit'
  error.value = ''
  logger.info('doSubmit start', { jobToken, force, feeCount: form.fees.length })
  try {
    const result: ImportConfirmResult = await confirmImportJob(jobToken, { force })
    showToast(`已确认 ${result.confirmed.length} 张结算单`)
    window.setTimeout(() => { void router.push('/imports') }, 500)
  } catch (caught) {
    logger.error('doSubmit failed', caught)
    if (caught instanceof ApiError && caught.status === 409) {
      try {
        const detail = typeof caught.message === 'string' ? JSON.parse(caught.message) : caught.message
        const hardBlockers = detail?.hard_blockers ?? []
        if (hardBlockers.length) {
          confirmForce.value = false
          hardBlocked.value = true
          const hardMessages = hardBlockers.flatMap((blocker: { issues: { message: string }[] }) =>
            blocker.issues.map((issue) => issue.message))
          confirmDialog.value = hardMessages.length
            ? `${hardMessages.join('；')}。以上问题不能带错提交，请修正后再确认。`
            : '存在不能带错提交的问题，请修正后再确认。'
        } else {
          const blockers = detail?.blockers ?? []
          const conflicts = detail?.conflicts ?? []
          const messages: string[] = []
          for (const blocker of blockers) messages.push(`${blocker.file_name}：${blocker.issues.length} 个问题`)
          for (const conflict of conflicts) messages.push(`${conflict.file_name}：商号 ${conflict.merchant_no} 已存在，继续提交将覆盖原结算单`)
          confirmForce.value = true
          hardBlocked.value = false
          confirmDialog.value = messages.join('\n') || '存在数据问题，是否仍要提交？'
        }
      } catch {
        confirmForce.value = true
        hardBlocked.value = false
        confirmDialog.value = '存在数据问题，是否仍要提交？'
      }
      confirmOpen.value = true
    } else {
      confirmForce.value = false
      hardBlocked.value = false
      error.value = caught instanceof Error ? caught.message : '确认提交失败'
    }
  } finally {
    saving.value = false
    savingAction.value = ''
  }
}

function closeConfirm() {
  if (saving.value) return
  confirmOpen.value = false
  confirmDialog.value = ''
  confirmForce.value = false
  hardBlocked.value = false
}

function goBack() {
  if (saving.value) return
  void router.push(isReadonly.value ? '/settlements' : '/imports')
}

onMounted(() => {
  if (isReadonly.value) {
    loadSettlementReview()
    loadFieldOptions()
  } else {
    loadJob()
    loadFieldOptions()
  }
})
</script>

<template>
  <section :class="isReadonly ? 'review-page' : 'review-modal'">
    <div
      :class="isReadonly ? 'review-page-panel mobile-form-page' : 'review-dialog mobile-form-page'"
      :role="isReadonly ? undefined : 'dialog'"
      :aria-modal="isReadonly ? undefined : 'true'"
      :aria-label="isReadonly ? undefined : '导入文件二次确认'"
    >
      <header class="review-head">
        <span class="draft-state">{{ isReadonly ? '已入库 · 只读' : '待确认 · 尚未入库' }}</span>
        <button class="modal-close" type="button" :aria-label="isReadonly ? '返回结算单列表' : '关闭二次确认'" :disabled="saving" @click="goBack">{{ isReadonly ? '返回列表' : '关闭' }}</button>
      </header>

      <div class="review-body">
        <div v-if="loading" class="empty-card" role="status" aria-live="polite">{{ savingAction === 'switch' ? savingMessage : '正在加载复核数据…' }}</div>
        <div v-else-if="error" class="error-card">{{ error }}</div>

        <template v-else>
      <div v-if="!isReadonly" class="file-toolbar">
        <label>待确认文件</label>
        <ElSelect
          ref="fileSelectRef"
          :model-value="draft?.draftToken"
          :disabled="saving || loading"
          filterable
          placeholder="选择待确认文件"
          aria-label="待确认文件"
          class="file-select"
          @update:model-value="onFileChange"
        >
          <ElOption
            v-for="item in job?.drafts ?? []"
            :key="item.token"
            :value="item.token"
            :label="`${item.fileName} · 商号 ${item.merchantNo}`"
          />
        </ElSelect>
        <span class="file-name">{{ draft?.fileName }}</span>
      </div>
      <p v-if="saving" class="review-saving-status" role="status" aria-live="polite">{{ savingMessage }}</p>
      <div v-else class="file-toolbar">
        <label>结算单</label>
        <span class="file-name">{{ draft?.fileName || form.merchantNo }}</span>
      </div>

      <!-- 状态提示只服务导入二次确认（问题计数 / 定位）；只读查看不显示。 -->
      <div v-if="!isReadonly" class="status-panel" :class="{ ok: !hasErrors && !hasWarnings }">
        <div>
          <strong>{{ hasErrors ? `${errorIssues.length} 项需先补全 · ` : '' }}{{ hasWarnings ? `${warningIssues.length} 项差异待核对` : (hasErrors ? '' : '录入值与计算值已对齐') }}</strong>
          <p v-if="firstIssue">{{ firstIssue.message }}</p>
        </div>
        <button v-if="hasErrors || hasWarnings" type="button" @click="focusFirstIssue">定位问题 ↓</button>
      </div>

      <nav class="jump-nav" aria-label="表单分区">
        <a href="#basic" @click.prevent="jumpToBlock('basic')">基本信息</a>
        <a href="#sales" @click.prevent="jumpToBlock('sales')">销售明细</a>
        <a href="#after" @click.prevent="jumpToBlock('after')">售后明细</a>
        <a href="#fees" @click.prevent="jumpToBlock('fees')">支出费用</a>
        <a href="#summary" @click.prevent="jumpToBlock('summary')">结算核对</a>
      </nav>

      <section class="block" id="basic">
        <div class="block-title"><h2>基本信息</h2><span>来源：{{ isReadonly ? '已入库结算单' : '导入文件' }}</span></div>
        <div class="block-body">
        <div class="basic-grid">
          <label class="field" :class="{ error: basicFieldHasError('merchant_no') }">
            <span>商号 *</span>
            <ElInput v-if="!isReadonly" v-model="form.merchantNo" aria-label="商号" />
            <span v-else class="field-static">{{ form.merchantNo || '—' }}</span>
            <span v-if="basicFieldHint('merchant_no')" class="field-hint">{{ basicFieldHint('merchant_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('container_no') }">
            <span>柜号</span>
            <ElInput v-if="!isReadonly" v-model="form.containerNo" aria-label="柜号" />
            <span v-else class="field-static">{{ form.containerNo || '—' }}</span>
            <span v-if="basicFieldHint('container_no')" class="field-hint">{{ basicFieldHint('container_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('order_no') }">
            <span>单号 *</span>
            <ElInput v-if="!isReadonly" v-model="form.orderNo" aria-label="单号" />
            <span v-else class="field-static">{{ form.orderNo || '—' }}</span>
            <span v-if="basicFieldHint('order_no')" class="field-hint">{{ basicFieldHint('order_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('vehicle_no') }">
            <span>转运公司 / 车牌号 *</span>
            <ElInput v-if="!isReadonly" v-model="form.vehicleNo" aria-label="转运公司 / 车牌号" />
            <span v-else class="field-static">{{ form.vehicleNo || '—' }}</span>
            <span v-if="basicFieldHint('vehicle_no')" class="field-hint">{{ basicFieldHint('vehicle_no') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('country') }">
            <span>国家 *</span>
            <ElInput v-if="!isReadonly" v-model="form.country" aria-label="国家" placeholder="如 越南" />
            <span v-else class="field-static">{{ form.country || '—' }}</span>
            <span v-if="basicFieldHint('country')" class="field-hint">{{ basicFieldHint('country') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('market') }">
            <span>市场 *</span>
            <ElSelect
              v-if="!isReadonly"
              ref="marketSelectRef"
              v-model="form.market"
              placeholder="请选择"
              aria-label="市场"
              class="field-control"
              @change="blurMarketSelect"
            >
              <ElOption v-for="item in marketOptions" :key="item" :label="item" :value="item" />
            </ElSelect>
            <span v-else class="field-static">{{ form.market || '—' }}</span>
            <span v-if="basicFieldHint('market')" class="field-hint">{{ basicFieldHint('market') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('arrival_date') }">
            <span>到达市场日期 *</span>
            <ElDatePicker
              v-if="!isReadonly"
              v-model="form.arrivalDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              aria-label="到达市场日期"
              class="field-control"
              :clearable="false"
            />
            <span v-else class="field-static">{{ form.arrivalDate || '—' }}</span>
            <span v-if="basicFieldHint('arrival_date')" class="field-hint">{{ basicFieldHint('arrival_date') }}</span>
          </label>
          <label class="field" :class="{ error: basicFieldHasError('arrival_quantity') }">
            <span>来货数量（件） *</span>
            <ElInput v-if="!isReadonly" v-model.number="form.arrivalQuantity" type="number" min="0" step="1" aria-label="来货数量（件）" />
            <span v-else class="field-static">{{ form.arrivalQuantity ?? '—' }}</span>
            <span v-if="basicFieldHint('arrival_quantity')" class="field-hint">{{ basicFieldHint('arrival_quantity') }}</span>
          </label>
        </div>
        </div>
      </section>

      <section class="block" id="sales">
        <div class="block-title"><h2>销售明细 <small>· {{ displaySalesCount }} 行</small></h2><button v-if="!isReadonly" class="outline" type="button" @click.stop="addSale">添加销售行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table sale-table"
          :columns="saleColumns"
          :rows="displaySalesRows"
          :row-key="saleRowKey"
          :row-class="salesRowClass"
          bordered
          caption="销售明细二次确认"
          min-width="1080px"
          :fit-width="isReadonly"
          empty-text="没有销售明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-saleDate="{ row }">
            <ElDatePicker
              v-if="!isReadonly"
              v-model="row.saleDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="日期"
              :class="cellClass('sales', form.sales.indexOf(row) + 1, 'sale_date')"
              aria-label="销售日期"
              :clearable="false"
            />
            <span v-else class="cell-text">{{ row.saleDate || '—' }}</span>
          </template>
          <template #cell-variety="{ row }">
            <ElInput v-model="row.variety" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'variety')" aria-label="品种" placeholder="如 金枕" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.variety || '—' }}</span>
          </template>
          <template #cell-grade="{ row }">
            <ElInput v-model="row.grade" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'grade')" aria-label="等级" placeholder="如 A、AB、BC" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.grade || '—' }}</span>
          </template>
          <template #cell-headCount="{ row }">
            <ElInput v-model="row.headCount" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'head_count')" aria-label="规格（头数）" placeholder="如 3/4" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.headCount || '—' }}</span>
          </template>
          <template #cell-specKg="{ row }">
            <ElInput v-model="row.specKg" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'spec_kg')" aria-label="规格（KG）" placeholder="如 10" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.specKg || '—' }}</span>
          </template>
          <template #cell-remark="{ row }">
            <ElInput v-model="row.remark" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'remark')" aria-label="备注" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.remark || '—' }}</span>
          </template>
          <template #cell-salesQuantity="{ row }">
            <ElInput v-if="!isReadonly" v-model.number="row.salesQuantity" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'sales_quantity')" aria-label="数量（件）" />
            <span v-else class="cell-text">{{ formatQuantity(Number(row.salesQuantity || 0)) }}</span>
          </template>
          <template #cell-unitPrice="{ row }">
            <ElInput v-if="!isReadonly" v-model.number="row.unitPrice" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('sales', form.sales.indexOf(row) + 1, 'unit_price')" aria-label="单价（元）" placeholder="空白按 0" />
            <span v-else class="cell-text">{{ money(Number(row.unitPrice || 0)) }}</span>
          </template>
          <template #cell-amount="{ row }">
            <strong class="money-amount">{{ money(rowSalesAmount(row)) }}</strong>
            <div v-if="saleAmountMismatch(row)" class="row-error">原文件 {{ money(Number(row.amount || 0)) }} · 已重算</div>
          </template>
          <template #cell-actions="{ row }"><button v-if="!isReadonly" class="delete-row" type="button" @click="removeSale(form.sales.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">
          <span :class="{ 'exceed-error': salesExceedArrival }">总件数 <strong>{{ formatQuantity(totals.totalPieces) }}</strong> 件<span v-if="salesExceedArrival"> · 已超出来货数量{{ isReadonly ? '' : '，不能提交' }}</span></span>
          <span>销售金额 <strong>{{ money(totals.salesAmount) }}</strong> 元</span>
        </div>
        </div>
      </section>

      <section class="block" id="after">
        <div class="block-title"><h2>售后明细 <small v-if="form.afterSales.length">· {{ form.afterSales.length }} 行</small></h2><button v-if="!isReadonly" class="outline" type="button" @click.stop="addAfterSale">添加售后行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table smaller after-sale-table"
          :columns="afterSaleColumns"
          :rows="form.afterSales"
          :row-key="afterSaleRowKey"
          :row-class="afterSaleRowClass"
          bordered
          caption="售后明细二次确认"
          min-width="640px"
          empty-text="没有售后明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-content="{ row }">
            <ElInput v-model="row.content" :class="cellClass('after_sales', form.afterSales.indexOf(row) + 1)" aria-label="售后内容" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.content || '—' }}</span>
          </template>
          <template #cell-summary="{ row }">
            <ElInput v-model="row.summary" aria-label="售后摘要" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.summary || '—' }}</span>
          </template>
          <template #cell-amount="{ row }">
            <ElInput v-if="!isReadonly" v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('after_sales', form.afterSales.indexOf(row) + 1)" aria-label="售后金额（元）" />
            <span v-else class="cell-text">{{ money(Number(row.amount || 0)) }}</span>
          </template>
          <template #cell-actions="{ row }"><button v-if="!isReadonly" class="delete-row" type="button" @click="removeAfterSale(form.afterSales.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">售后合计 <strong>{{ money(totals.afterAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" id="fees">
        <div class="block-title"><h2>支出费用 <small>· 合计 {{ money(totals.feeAmount) }} 元</small></h2><button v-if="!isReadonly" class="outline" type="button" @click.stop="addFee">添加费用行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table smaller fee-table"
          :columns="feeColumns"
          :rows="form.fees"
          :row-key="feeRowKey"
          :row-class="feeRowClass"
          bordered
          caption="支出费用二次确认"
          min-width="540px"
          empty-text="没有费用明细"
        >
          <template #cell-sourceRow="{ row }"><span class="source">{{ row.sourceRow ?? '新增' }}</span></template>
          <template #cell-name="{ row }">
            <ElInput v-model="row.name" :class="cellClass('fees', form.fees.indexOf(row) + 1)" aria-label="费用摘要" v-if="!isReadonly" />
            <span v-else class="cell-text">{{ row.name || '—' }}</span>
          </template>
          <template #cell-amount="{ row }">
            <ElInput v-if="!isReadonly" v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :class="cellClass('fees', form.fees.indexOf(row) + 1)" aria-label="费用金额（元）" />
            <span v-else class="cell-text">{{ money(Number(row.amount || 0)) }}</span>
          </template>
          <template #cell-actions="{ row }"><button v-if="!isReadonly" class="delete-row" type="button" @click="removeFee(form.fees.indexOf(row))">删除</button></template>
        </DataTable>
        <div class="section-foot">费用合计 <strong>{{ money(totals.feeAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" id="summary">
        <div class="block-title"><h2>结算核对 <small>· 应付 {{ money(totals.payable) }} 元</small></h2></div>
        <div class="block-body">
        <div class="summary-table">
          <div class="summary-head"><span>核对项目</span><span>文件填写</span><span>系统计算 · 提交值</span></div>
          <div v-for="row in summaryRows" :key="row.key" class="summary-line" :class="{ error: row.mismatch, total: row.key === 'payable_amount' }">
            <span>{{ row.label }}</span>
            <span class="original">{{ row.file }}</span>
            <span><strong>{{ row.system }}</strong></span>
          </div>
        </div>
        <p class="summary-note">{{ isReadonly ? '已入库数据只读展示，当前金额为系统计算值。' : '正式入库以「系统计算 · 提交值」为准；有差异会记录留痕。' }}</p>
        </div>
      </section>

      </template>
      </div>

      <footer v-if="draft && !loading && !error" class="review-foot">
        <template v-if="isReadonly">
          <span>该页面仅用于查看已入库结算单，不能修改或重新提交。</span>
          <button class="outline" type="button" @click="goBack">返回结算单列表</button>
        </template>
        <template v-else>
          <span>文件导入只支持还原为导入解析值或确认提交，确认前会自动重新计算。</span>
          <button class="outline" type="button" :disabled="saving" @click="restoreCurrentDraft">{{ savingAction === 'restore' ? '正在还原…' : '还原修改' }}</button>
          <button class="primary" type="button" :disabled="saving" @click="openConfirm">{{ savingAction === 'prepare' ? '正在保存…' : '确认提交' }}</button>
        </template>
      </footer>
    </div>

    <ElDialog
      :model-value="confirmOpen"
      :title="hardBlocked || hasHardBlockErrors ? '存在问题需修正后才能提交' : hasErrors ? '仍有问题，是否带错提交？' : hasWarnings ? '存在差异，是否按当前结果提交？' : '确认提交'"
      width="min(760px, 94vw)"
      append-to-body
      :close-on-click-modal="false"
      @update:model-value="(value) => { if (!value) closeConfirm() }"
    >
      <div class="confirm-list">
        <div v-if="errorIssues.length" class="confirm-issues">
          <p>提交校验未通过的行</p>
          <table class="issue-table">
            <thead>
              <tr><th>位置</th><th>字段</th><th>问题</th></tr>
            </thead>
            <tbody>
              <tr v-for="(issue, index) in errorIssues" :key="`${issue.code}-${issue.row}-${issue.field}-${index}`">
                <td>{{ issueLocation(issue) }}</td>
                <td>{{ issueFieldLabel(issue) }}</td>
                <td>{{ issue.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="warningSummaryLines.length" class="confirm-issues">
          <p>待核对项</p>
          <ul><li v-for="(line, index) in warningSummaryLines" :key="`${line}-${index}`">{{ line }}</li></ul>
        </div>
        <p v-if="confirmDialog" class="dialog-text">{{ confirmDialog }}</p>
      </div>
      <p>继续提交将以当前填写值入库；系统金额和汇总会按自洽口径修正。</p>
      <template #footer>
        <div class="dialog-actions">
          <button class="subtle" type="button" :disabled="saving" @click="closeConfirm">返回修改</button>
          <button class="primary" type="button" :disabled="saving || hardBlocked || hasHardBlockErrors" @click="doSubmit(confirmForce)">{{ savingAction === 'submit' ? '正在提交…' : '确认提交' }}</button>
        </div>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.review-modal { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; background: rgb(24 49 42 / 55%); overflow: hidden; }
.review-dialog { position: relative; display: flex; flex-direction: column; width: min(1280px, 100%); height: min(920px, calc(100vh - 48px)); border-radius: 16px; background: var(--surface); box-shadow: 0 18px 60px rgb(0 0 0 / 24%); overflow: hidden; }
/* 只读「查看明细」＝整页形态：无遮罩、不限高，铺满页签页面宽度（宽屏不留两侧空白），
   随页面自然排版滚动；编辑态（导入二次确认）保持弹窗不变。 */
.review-page { display: block; }
.review-page-panel { display: flex; flex-direction: column; width: 100%; }
.review-page-panel .review-head { padding: 0 4px 10px; border-bottom: 0; background: transparent; }
.review-page-panel .review-body { flex: 0 0 auto; overflow: visible; padding: 0 0 4px; }
.review-page-panel .review-foot { margin-top: 6px; border: 2px solid var(--line-strong); border-radius: var(--radius); }
.review-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--surface); }
.review-body { flex: 1; overflow: auto; display: grid; gap: 14px; padding: 4px 16px 20px; }
.draft-state { padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--primary-soft); color: var(--primary-dark); font-size: .8rem; font-weight: 800; white-space: nowrap; }
.modal-close { flex: none; min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: #fff; color: var(--ink); font-weight: 800; }
.modal-close:hover { border-color: var(--primary); color: var(--primary); }
.file-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 11px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.file-toolbar label { font-weight: 800; white-space: nowrap; }
.file-toolbar .file-select { width: min(320px, 100%); }
.file-toolbar :deep(.el-select__wrapper) { min-height: 38px; }
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
/* 表单里的 EP 控件对齐原 38px 手写输入；field-control 让 select / date 占满格。 */
.field .field-control { width: 100%; }
.field :deep(.el-input__wrapper),
.field :deep(.el-select__wrapper),
.field :deep(.el-date-editor.el-input) { min-height: 38px; }
.field :deep(.el-input__wrapper),
.field :deep(.el-select__wrapper) { padding: 0 9px; border-radius: 6px; }
.field :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--line-strong) inset; background: #fff; }
.field :deep(.el-date-editor.el-input .el-input__wrapper) { box-shadow: 0 0 0 1px var(--line-strong) inset; background: #fff; }
.field.error :deep(.el-input__wrapper),
.field.error :deep(.el-select__wrapper),
.field.error :deep(.el-date-editor.el-input .el-input__wrapper) { box-shadow: 0 0 0 2px var(--danger) inset; background: #fff5f5; }
.field :deep(.el-input__wrapper.is-disabled),
.field :deep(.el-date-editor.el-input .el-input__wrapper.is-disabled) { background: var(--surface-soft); box-shadow: 0 0 0 1px var(--line) inset; }
.field-hint { color: var(--danger); font-size: .72rem; font-weight: 400; }
/* 只读查看（查看明细）：基本信息以纯文本呈现，不再整页灰色禁用输入框。 */
.field-static {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--surface-soft);
  color: var(--ink);
  font-size: .92rem;
  word-break: break-all;
}
/* 只读查看：明细单元格直接呈现文本值（日期/规格等），数字列由 DataTable 的 numeric 对齐。 */
.cell-text { display: inline-block; max-width: 100%; white-space: pre-wrap; word-break: break-word; }
.review-table :deep(.data-table td) { padding: .38rem .5rem; }
.review-table :deep(.data-table thead th) { padding: .5rem .6rem; }
/* 可编辑表格内的 EP 输入：36px 紧凑尺寸，等价原手写 cell input。 */
.review-table :deep(.el-input__wrapper),
.review-table :deep(.el-select__wrapper),
.review-table :deep(.el-date-editor.el-input) { min-height: 36px; }
.review-table :deep(.el-input__wrapper),
.review-table :deep(.el-date-editor.el-input .el-input__wrapper) {
  padding: 0 7px;
  border-radius: 5px;
  background: #fff;
  box-shadow: 0 0 0 1px var(--line-strong) inset;
}
.review-table :deep(.el-input__wrapper.is-focus),
.review-table :deep(.el-date-editor.el-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--primary) inset, 0 0 0 2px var(--primary-soft);
}
.review-table :deep(.el-input__wrapper.is-disabled),
.review-table :deep(.el-date-editor.el-input .el-input__wrapper.is-disabled) { background: var(--surface-soft); box-shadow: 0 0 0 1px var(--line) inset; }
.review-table :deep(.el-date-editor.el-input .el-input__prefix) { display: none; }
/* cell-error / cell-warning 落在 EP 控件根节点上，描边作用于内部 wrapper。 */
.review-table .cell-error :deep(.el-input__wrapper),
.review-table .cell-error :deep(.el-date-editor.el-input .el-input__wrapper) { box-shadow: 0 0 0 2px var(--danger) inset; background: #fff5f5; }
.review-table .cell-warning :deep(.el-input__wrapper),
.review-table .cell-warning :deep(.el-date-editor.el-input .el-input__wrapper) { box-shadow: 0 0 0 1px var(--warning) inset; background: #fffbf0; }
.review-table :deep(tbody tr.row-invalid),
.review-table :deep(tbody tr.row-invalid:hover) { background: #ffd9d6 !important; }
.review-table :deep(tbody tr.row-invalid) td { box-shadow: inset 0 0 0 1px #f2b0ac; }
.source { color: var(--muted); font-size: .78rem; }
.readonly-value { display: inline-flex; align-items: center; min-height: 2rem; color: var(--ink); white-space: nowrap; }
.money-amount { color: var(--primary-dark); font-weight: 800; }
.row-error { margin-top: 4px; color: var(--danger); font-size: .72rem; }
.delete-row { border: 0; background: transparent; color: var(--danger); font-weight: 800; white-space: nowrap; }
.review-table :deep(.data-table td:last-child) { white-space: nowrap; }
.section-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 10px; color: var(--muted); font-size: .84rem; }
.section-foot strong { color: var(--ink); }
.section-foot .exceed-error, .section-foot .exceed-error strong { color: var(--danger); font-weight: 800; }
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
.review-foot { flex: none; display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--surface); }
.review-foot span { margin-right: auto; color: var(--muted); font-size: .78rem; }
.empty-card, .error-card { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.error-card { color: var(--danger); }
.dialog-text { white-space: pre-wrap; color: var(--danger); line-height: 1.6; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.confirm-list { min-height: 0; }
.change-list { display: grid; gap: 8px; margin-bottom: 12px; }
.change-line { display: grid; grid-template-columns: minmax(150px, .95fr) minmax(220px, 1.25fr); gap: 3px 12px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-soft); }
.change-line strong { font-size: .88rem; }
.change-line small { grid-column: 1 / -1; color: var(--muted); font-size: .76rem; line-height: 1.4; }
.change-values { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .9rem; }
.change-before { color: var(--muted); text-decoration: line-through; overflow-wrap: anywhere; }
.change-after { color: var(--primary-dark); font-weight: 800; overflow-wrap: anywhere; }
.change-arrow { color: var(--muted); }
.confirm-issues { margin-top: 10px; }
.confirm-issues p { margin: 0 0 6px; font-weight: 800; }
.confirm-issues ul { margin: 0; padding-left: 18px; color: var(--danger); }
.confirm-issues li { margin: 3px 0; line-height: 1.5; }
.issue-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.issue-table th, .issue-table td { padding: 6px 8px; border: 1px solid var(--line); text-align: left; vertical-align: top; }
.issue-table th { background: var(--primary-soft); color: var(--primary-dark); font-weight: 800; }
.issue-table td { color: var(--danger); }
.issue-table td:last-child { color: var(--ink); }
@media (max-width: 900px) {
  .basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
