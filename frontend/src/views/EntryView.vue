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
  deleteEntryDraft,
  getEntry,
  getEntryDraft,
  getEntryFieldOptions,
  saveEntry,
  saveEntryDraft,
  updateEntry,
  type EntryAfterSaleItem,
  type EntryDraft,
  type EntryFeeItem,
  type EntryPayload,
  type EntrySaleItem,
} from '../api/client'
import { hasEntryDraftContent } from '../utils/entryDraft'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'
import { FIXED_FEES, computeEntryTotals, createEmptyAfterSale, createEmptySale, createCustomFee, money, salesExceedsArrival } from '../utils/entryForm'
import { parseSpecRange } from '../utils/specRange'

const route = useRoute()
const router = useRouter()
const editingMerchantNo = ref(typeof route.query.merchant_no === 'string' ? route.query.merchant_no : '')
const loading = ref(true)
const saving = ref(false)
const draftSaving = ref(false)
const savingAsOverwrite = ref(false)
const error = ref('')
const restoredDraft = ref(false)
const conflictOpen = ref(false)
/** 表单分区锚点：点击滚动到对应分区。 */
const BLOCK_IDS = ['basic', 'sales', 'after', 'fees', 'summary'] as const
type BlockId = (typeof BLOCK_IDS)[number]
async function jumpToBlock(id: BlockId) {
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const conflictMessage = ref('')
const marketOptions = ref<string[]>([])
const marketSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)
// 下拉点选即失焦（用户要求）：不再停留在可继续输入的编辑态。
function blurMarketSelect() {
  nextTick(() => marketSelectRef.value?.blur())
}

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
  fees: FIXED_FEES.map((name) => ({ name, amount: 0, isCustom: false })),
})

/** 三张录入表都是可编辑表格：列只声明表头与对齐，输入控件走 cell-<key> 插槽。 */
const saleColumns: DataTableColumn<EntrySaleItem>[] = [
  { key: 'saleDate', label: '销售日期' },
  { key: 'variety', label: '品种' },
  { key: 'grade', label: '等级' },
  { key: 'headCount', label: '规格（头数）' },
  { key: 'specKg', label: '规格（KG）' },
  { key: 'remark', label: '备注' },
  { key: 'salesQuantity', label: '数量（件）', numeric: true },
  { key: 'unitPrice', label: '单价（元）', numeric: true },
  { key: 'amount', label: '金额（元）', numeric: true, value: (row) => saleAmount(row) },
  { key: 'actions', label: '操作' },
]
const afterSaleColumns: DataTableColumn<EntryAfterSaleItem>[] = [
  { key: 'content', label: '内容' },
  { key: 'summary', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  { key: 'actions', label: '操作' },
]
const feeColumns: DataTableColumn<EntryFeeItem>[] = [
  { key: 'name', label: '摘要' },
  { key: 'amount', label: '金额（元）', numeric: true },
  { key: 'actions', label: '操作' },
]
const saleRowKey = (row: EntrySaleItem, index: number) => `sale-${row.saleDate}-${row.specKg}-${index}`
const afterSaleRowKey = (row: EntryAfterSaleItem, index: number) => `after-${row.content}-${index}`
const feeRowKey = (row: EntryFeeItem, index: number) => `fee-${row.name}-${index}`

const totals = computed(() => computeEntryTotals(form.sales, form.afterSales, form.fees, form.arrivalQuantity))

/** 销售数量合计超过来货数量：表单标红并阻断提交。 */
const salesExceedArrival = computed(() => salesExceedsArrival(form.arrivalQuantity, totals.value.totalPieces))

/** 草稿写到后端数据库；防抖避免每次按键都请求，保存成功后彻底清掉。 */
const DRAFT_DEBOUNCE_MS = 800
let draftTimer: number | undefined
let draftEnabled = false

function draftPayload(): EntryPayload {
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

async function flushDraft(): Promise<boolean> {
  if (!draftEnabled) return true
  const payload = draftPayload()
  try {
    if (!hasEntryDraftContent(payload)) {
      await deleteEntryDraft()
      return true
    }
    await saveEntryDraft(payload, Boolean(editingMerchantNo.value))
    return true
  } catch {
    // 暂存接口失败时仍可正常录单，只影响“刷新后继续填”。
    return false
  }
}

function scheduleDraftSave() {
  if (!draftEnabled) return
  if (draftTimer) window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout(() => {
    draftTimer = undefined
    void flushDraft()
  }, DRAFT_DEBOUNCE_MS)
}

async function saveDraftNow() {
  if (draftSaving.value || saving.value) return
  draftSaving.value = true
  const saved = await flushDraft()
  if (saved) showToast('已暂存，可稍后继续录单')
  else showToast('暂存失败，请稍后重试', 'error')
  draftSaving.value = false
}

async function clearDraft() {
  try {
    await deleteEntryDraft()
  } catch {
    // 清不掉也不影响保存结果。
  }
}

async function readStoredDraft(): Promise<EntryDraft | null> {
  try {
    return await getEntryDraft()
  } catch {
    return null
  }
}

function applyDraft(draft: EntryDraft) {
  const payload = draft.payload
  editingMerchantNo.value = draft.editing ? draft.merchantNo : ''
  Object.assign(form, {
    merchantNo: payload.merchantNo ?? '',
    orderNo: payload.orderNo ?? '',
    containerNo: payload.containerNo ?? '',
    vehicleNo: payload.vehicleNo ?? '',
    country: payload.country ?? '',
    market: payload.market ?? '',
    arrivalDate: payload.arrivalDate ?? '',
    arrivalQuantity: payload.arrivalQuantity ?? null,
    sales: (payload.sales ?? []).map((row) => ({ ...createEmptySale(), ...row })),
    afterSales: (payload.afterSales ?? []).map((row) => ({ ...createEmptyAfterSale(), ...row })),
    fees: payload.fees?.length
      ? payload.fees.map((row) => ({ ...row }))
      : FIXED_FEES.map((name) => ({ name, amount: 0, isCustom: false })),
  })
  if (!form.sales.length) addSale()
}

watch(form, () => scheduleDraftSave(), { deep: true })

onBeforeUnmount(() => {
  if (draftTimer) window.clearTimeout(draftTimer)
  void flushDraft()
})

/** 全局消息统一走 ElMessage；保留函数名便于调用点语义化。 */
function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  ElMessage({ message, type, duration: 1800 })
}

function addSale() {
  form.sales.push(createEmptySale())
}

function removeSale(index: number) {
  form.sales.splice(index, 1)
}

function addAfterSale() {
  form.afterSales.push(createEmptyAfterSale())
}

function removeAfterSale(index: number) {
  form.afterSales.splice(index, 1)
}

function addCustomFee() {
  form.fees.push(createCustomFee())
}

function customFeeIndex(row: EntryFeeItem): number {
  return form.fees.filter((item) => item.isCustom).indexOf(row)
}

function removeCustomFee(index: number) {
  const customIndexes = form.fees.map((item, index) => item.isCustom ? index : -1).filter((index) => index >= 0)
  const target = customIndexes[index]
  if (target !== undefined) form.fees.splice(target, 1)
}

function saleAmount(row: EntrySaleItem) {
  return money(Number(row.salesQuantity || 0) * Number(row.unitPrice || 0))
}

function invalidSpec(value: string): boolean {
  const text = value.trim()
  return text !== '' && !parseSpecRange(text)
}

function invalidSpecKg(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  const parsed = parseSpecRange(text)
  if (!parsed) return true
  return parsed.minimum !== parsed.maximum
}

function validate() {
  if (!form.merchantNo || !form.containerNo || !form.orderNo || !form.vehicleNo || !form.country || !form.market || !form.arrivalDate || form.arrivalQuantity === null) {
    return '请完整填写基本信息必填项'
  }
  if (!form.sales.length) return '请至少添加一条销售明细'
  for (const row of form.sales) {
    if (!row.saleDate || Number(row.salesQuantity) <= 0) {
      return '请填写销售日期和数量（件）'
    }
    if (invalidSpec(row.headCount)) {
      return '规格（头数）填写时需为数字或区间（如 3/4、9/10、10）；不填可留空'
    }
    if (invalidSpecKg(row.specKg)) {
      return '规格（KG）填写时需为单个数字（如 10）；不填可留空'
    }
    if (Number(row.unitPrice) < 0) {
      return '单价不能为负数；不填按 0 计算'
    }
  }
  if (salesExceedArrival.value) {
    return `销售数量合计 ${totals.value.totalPieces} 件不能大于来货数量 ${form.arrivalQuantity} 件，请核对销售明细或来货数量`
  }
  return ''
}

async function submit(overwrite = false) {
  if (saving.value || draftSaving.value) return
  const validation = validate()
  if (validation) {
    showToast(validation, 'error')
    return
  }
  saving.value = true
  savingAsOverwrite.value = overwrite
  error.value = ''
  const afterSales = form.afterSales.filter((row) => row.content.trim())
  const fees = form.fees.filter((row) => !row.isCustom || row.name.trim())
  const payload: EntryPayload = {
    ...form,
    sales: form.sales.map((row) => ({ ...row })),
    afterSales: afterSales.map((row) => ({ ...row })),
    fees: fees.map((row) => ({ ...row })),
  }
  try {
    const saved = editingMerchantNo.value
      ? await updateEntry(editingMerchantNo.value, payload)
      : await saveEntry(payload, { overwrite })
    conflictOpen.value = false
    draftEnabled = false
    void clearDraft()
    restoredDraft.value = false
    showToast('已保存，正在打开销售详情')
    window.setTimeout(() => {
      void router.push({ path: '/settlement-detail', query: { merchant_no: saved.merchantNo } })
    }, 350)
  } catch (caught) {
    if (!editingMerchantNo.value && caught instanceof ApiError && caught.status === 409) {
      conflictMessage.value = caught.message
      conflictOpen.value = true
    } else {
      error.value = caught instanceof Error ? caught.message : '保存失败，请稍后重试'
    }
  } finally {
    saving.value = false
    savingAsOverwrite.value = false
  }
}

async function loadOptions() {
  const markets = await getEntryFieldOptions('market')
  marketOptions.value = markets.map((item) => item.value)
}

async function loadEntry() {
  loading.value = true
  error.value = ''
  draftEnabled = false
  try {
    await loadOptions()
    const stored = await readStoredDraft()
    const editingDraftMatches = Boolean(editingMerchantNo.value)
      && stored?.editing === true
      && stored.merchantNo === editingMerchantNo.value
    if (stored && (!editingMerchantNo.value || editingDraftMatches)) {
      applyDraft(stored)
      restoredDraft.value = true
    } else if (editingMerchantNo.value) {
      const entry = await getEntry(editingMerchantNo.value)
      Object.assign(form, {
        merchantNo: entry.merchantNo,
        orderNo: entry.orderNo,
        containerNo: entry.containerNo,
        vehicleNo: entry.vehicleNo,
        country: entry.country,
        market: entry.market,
        arrivalDate: entry.arrivalDate,
        arrivalQuantity: entry.arrivalQuantity,
        sales: entry.sales,
        afterSales: entry.afterSales,
        fees: entry.fees.length ? entry.fees : FIXED_FEES.map((name) => ({ name, amount: 0, isCustom: false })),
      })
    } else if (!form.sales.length) {
      addSale()
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '加载录单信息失败'
  } finally {
    loading.value = false
    draftEnabled = true
  }
}

onMounted(() => {
  void loadEntry()
})
</script>


<template>
  <section class="entry-page review-entry-page">
    <header class="entry-head">
      <div>
        <p class="eyebrow">结算单录入</p>
        <h1>{{ editingMerchantNo ? '修改手工录单' : '手工录单' }}</h1>
      </div>
      <span class="status-badge">{{ editingMerchantNo ? '修改中' : '未保存' }}</span>
    </header>

    <p v-if="restoredDraft" class="draft-hint">已恢复上次没保存完的内容，保存后才会写入结算单。</p>

    <div v-if="loading" class="empty-card">正在加载录单信息…</div>
    <div v-else-if="error" class="error-card">{{ error }}</div>

    <template v-else>
      <div class="status-panel ok">
        <div>
          <strong>{{ editingMerchantNo ? '正在修改已有结算单' : '手工录入，保存后生成结算单' }}</strong>
          <p>金额 = 数量（件） × 单价；空白单价按 0 计算。</p>
        </div>
        <button type="button" :disabled="draftSaving || saving" @click="saveDraftNow">{{ draftSaving ? '暂存中…' : '暂存' }}</button>
      </div>

      <nav class="jump-nav" aria-label="表单分区">
        <a href="#basic" @click.prevent="jumpToBlock('basic')">基本信息</a>
        <a href="#sales" @click.prevent="jumpToBlock('sales')">销售明细</a>
        <a href="#after" @click.prevent="jumpToBlock('after')">售后明细</a>
        <a href="#fees" @click.prevent="jumpToBlock('fees')">支出费用</a>
        <a href="#summary" @click.prevent="jumpToBlock('summary')">结算核对</a>
      </nav>

      <section class="block" id="basic">
        <div class="block-title"><h2>基本信息</h2><span>来源：手工录入</span></div>
        <div class="block-body">
        <div class="basic-grid">
          <label class="field">
            <span>商号 *</span>
            <ElInput v-model="form.merchantNo" :disabled="Boolean(editingMerchantNo)" aria-label="商号" />
          </label>
          <label class="field">
            <span>柜号 *</span>
            <ElInput v-model="form.containerNo" aria-label="柜号" />
          </label>
          <label class="field">
            <span>单号 *</span>
            <ElInput v-model="form.orderNo" aria-label="单号" />
          </label>
          <label class="field">
            <span>转运公司 / 车牌号 *</span>
            <ElInput v-model="form.vehicleNo" aria-label="转运公司 / 车牌号" />
          </label>
          <label class="field">
            <span>国家 *</span>
            <ElInput v-model="form.country" aria-label="国家" placeholder="如 越南" />
          </label>
          <label class="field">
            <span>市场 *</span>
            <ElSelect
              v-if="marketOptions.length"
              ref="marketSelectRef"
              v-model="form.market"
              placeholder="请选择"
              aria-label="市场"
              class="field-control"
              @change="blurMarketSelect"
            >
              <ElOption v-for="item in marketOptions" :key="item" :label="item" :value="item" />
            </ElSelect>
            <ElInput v-else v-model="form.market" placeholder="请先由 fruit_admin 配置市场" aria-label="市场" />
          </label>
          <label class="field">
            <span>到达市场日期 *</span>
            <ElDatePicker
              v-model="form.arrivalDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              aria-label="到达市场日期"
              class="field-control"
            />
          </label>
          <label class="field" :class="{ error: salesExceedArrival }">
            <span>来货数量（件） *</span>
            <ElInput v-model.number="form.arrivalQuantity" type="number" min="0" step="1" aria-label="来货数量（件）" />
            <span v-if="salesExceedArrival" class="field-hint">销售数量合计 {{ totals.totalPieces }} 件已超过来货数量 {{ form.arrivalQuantity }} 件，请核对后再保存</span>
          </label>
        </div>
        </div>
      </section>

      <section class="block" id="sales">
        <div class="block-title"><h2>销售明细 <small>· {{ form.sales.length }} 行</small></h2><button class="outline" type="button" @click.stop="addSale">添加销售行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table sale-table"
          :columns="saleColumns"
          :rows="form.sales"
          :row-key="saleRowKey"
          bordered
          caption="销售明细录入"
          min-width="1080px"
          empty-text="还没有销售行，点「添加销售行」开始录入"
        >
          <template #cell-saleDate="{ row }">
            <ElDatePicker
              v-model="row.saleDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="日期"
              aria-label="销售日期"
              class="cell-control"
              :clearable="false"
            />
          </template>
          <template #cell-variety="{ row }">
            <ElInput v-model="row.variety" aria-label="品种" placeholder="可选，如 金枕" />
          </template>
          <template #cell-grade="{ row }">
            <ElInput v-model="row.grade" aria-label="等级" placeholder="可选，如 A、AB、BC" />
          </template>
          <template #cell-headCount="{ row }">
            <ElInput v-model="row.headCount" :class="{ 'spec-invalid': invalidSpec(row.headCount) }" placeholder="可选，如 3/4" aria-label="规格（头数）" />
          </template>
          <template #cell-specKg="{ row }">
            <ElInput v-model="row.specKg" :class="{ 'spec-invalid': invalidSpecKg(row.specKg) }" placeholder="可选，如 10" aria-label="规格（KG）" />
          </template>
          <template #cell-remark="{ row }">
            <ElInput v-model="row.remark" aria-label="备注" />
          </template>
          <template #cell-salesQuantity="{ row }">
            <ElInput v-model.number="row.salesQuantity" type="number" min="0" step="0.01" inputmode="decimal" aria-label="数量（件）" />
          </template>
          <template #cell-unitPrice="{ row }">
            <ElInput v-model.number="row.unitPrice" type="number" min="0" step="0.01" inputmode="decimal" aria-label="单价（元）" placeholder="空白按 0" />
          </template>
          <template #cell-amount="{ row }">
            <strong class="money-amount">{{ saleAmount(row) }}</strong>
          </template>
          <template #cell-actions="{ row }">
            <button class="delete-row" type="button" @click="removeSale(form.sales.indexOf(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">
          <span :class="{ 'exceed-error': salesExceedArrival }">总件数 <strong>{{ totals.totalPieces }}</strong> 件<span v-if="salesExceedArrival"> · 已超出来货数量，不能提交</span></span>
          <span>销售金额 <strong>{{ money(totals.salesAmount) }}</strong> 元</span>
        </div>
        </div>
      </section>

      <section class="block" id="after">
        <div class="block-title"><h2>售后明细 <small v-if="form.afterSales.length">· {{ form.afterSales.length }} 行</small></h2><button class="outline" type="button" @click.stop="addAfterSale">添加售后行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table smaller after-sale-table"
          :columns="afterSaleColumns"
          :rows="form.afterSales"
          :row-key="afterSaleRowKey"
          bordered
          caption="售后明细录入"
          min-width="540px"
          empty-text="还没有售后行，点「添加售后行」开始录入"
        >
          <template #cell-content="{ row }">
            <ElInput v-model="row.content" aria-label="售后内容" />
          </template>
          <template #cell-summary="{ row }">
            <ElInput v-model="row.summary" aria-label="售后摘要" />
          </template>
          <template #cell-amount="{ row }">
            <ElInput v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" aria-label="售后金额（元）" />
          </template>
          <template #cell-actions="{ row }">
            <button class="delete-row" type="button" @click="removeAfterSale(form.afterSales.indexOf(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">售后合计 <strong>{{ money(totals.afterAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" id="fees">
        <div class="block-title"><h2>支出费用 <small>· 合计 {{ money(totals.feeAmount) }} 元</small></h2><button class="outline" type="button" @click.stop="addCustomFee">添加费用行</button></div>
        <div class="block-body">
        <DataTable
          class="review-table smaller fee-table"
          :columns="feeColumns"
          :rows="form.fees"
          :row-key="feeRowKey"
          bordered
          caption="支出费用录入"
          min-width="540px"
        >
          <template #cell-name="{ row }">
            <ElInput v-if="row.isCustom" v-model="row.name" aria-label="费用摘要" />
            <span v-else>{{ row.name }}</span>
          </template>
          <template #cell-amount="{ row }">
            <ElInput v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :aria-label="`${row.name}金额（元）`" />
          </template>
          <template #cell-actions="{ row }">
            <button v-if="row.isCustom" class="delete-row" type="button" @click="removeCustomFee(customFeeIndex(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">费用合计 <strong>{{ money(totals.feeAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" id="summary">
        <div class="block-title"><h2>结算核对 <small>· 应付 {{ money(totals.payable) }} 元</small></h2></div>
        <div class="block-body">
        <div class="summary-table manual-summary">
          <div class="summary-head"><span>核对项目</span><span>系统计算</span></div>
          <div class="summary-line"><span>总件数</span><span><strong>{{ totals.totalPieces }}</strong></span></div>
          <div class="summary-line"><span>销售金额</span><span><strong>{{ money(totals.salesAmount) }}</strong></span></div>
          <div class="summary-line"><span>售后合计</span><span><strong>{{ money(totals.afterAmount) }}</strong></span></div>
          <div class="summary-line"><span>货款合计</span><span><strong>{{ money(totals.goodsAmount) }}</strong></span></div>
          <div class="summary-line"><span>费用合计</span><span><strong>{{ money(totals.feeAmount) }}</strong></span></div>
          <div class="summary-line total"><span>应付贵方总金额(RMB)</span><span><strong>{{ money(totals.payable) }}</strong></span></div>
        </div>
        <p class="summary-note">保存后以系统计算值写入结算单。</p>
        </div>
      </section>

      <div class="actions">
        <button class="subtle" type="button" :disabled="draftSaving || saving" @click="saveDraftNow">{{ draftSaving ? '暂存中…' : '暂存' }}</button>
        <button class="primary" type="button" :disabled="saving || draftSaving" @click="submit(false)">{{ saving ? (savingAsOverwrite ? '覆盖中…' : '保存中…') : editingMerchantNo ? '保存修改' : '确认保存' }}</button>
      </div>
    </template>

    <ElDialog
      :model-value="conflictOpen"
      title="商号冲突"
      width="min(520px, 92vw)"
      append-to-body
      :close-on-click-modal="false"
      @update:model-value="(value) => { if (!value) conflictOpen = false }"
    >
      <p class="dialog-lead">商号 {{ form.merchantNo }} 已存在</p>
      <p>{{ conflictMessage }}。确认覆盖后，旧数据将被本次录入内容替换。</p>
      <template #footer>
        <div class="dialog-actions">
          <button class="subtle" type="button" @click="conflictOpen = false">取消</button>
          <button class="danger-button" type="button" :disabled="saving" @click="submit(true)">{{ savingAsOverwrite ? '覆盖中…' : '确认覆盖并保存' }}</button>
        </div>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.entry-page { width: 100%; display: grid; gap: 14px; padding: 4px 0 44px; }
.entry-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line-strong); }
.entry-head h1 { margin: 0; font-size: 1.5rem; }
.eyebrow { margin: 0; color: var(--primary); font-size: .76rem; font-weight: 800; letter-spacing: .08em; }
.status-badge { padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--primary-soft); color: var(--primary-dark); font-size: .8rem; font-weight: 800; white-space: nowrap; }
.draft-hint { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--primary-soft); color: var(--primary); font-size: .86rem; font-weight: 700; }
.status-panel { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 14px; border-left: 4px solid var(--primary); border-radius: 8px; background: var(--primary-soft); }
.status-panel strong { font-size: .96rem; }
.status-panel p { margin: 4px 0 0; color: var(--muted); font-size: .78rem; }
.status-panel button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: #fff; color: var(--primary-dark); font-weight: 800; }
.status-panel button:hover { border-color: var(--primary); color: var(--primary); }
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
.field :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--primary) inset, 0 0 0 2px var(--primary-soft); }
.field :deep(.el-date-editor.el-input .el-input__wrapper) { box-shadow: 0 0 0 1px var(--line-strong) inset; background: #fff; }
.field.error :deep(.el-input__wrapper) { box-shadow: 0 0 0 2px var(--danger) inset; background: #fff5f5; }
.field-hint { color: var(--danger); font-size: .72rem; font-weight: 400; }
.section-foot .exceed-error, .section-foot .exceed-error strong { color: var(--danger); font-weight: 800; }
.review-table :deep(.data-table td) { padding: .38rem .5rem; }
.review-table :deep(.data-table thead th) { padding: .5rem .6rem; }
/* 可编辑表格内的 EP 输入：36px 紧凑尺寸，等价原手写 cell input。 */
.review-table .cell-control { width: 100%; }
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
.review-table :deep(.el-date-editor.el-input .el-input__prefix) { display: none; }
.review-table .spec-invalid :deep(.el-input__wrapper) { box-shadow: 0 0 0 2px var(--danger) inset; background: #fff5f5; }
.review-table :deep(.data-table td:last-child) { white-space: nowrap; }
.money-amount { color: var(--primary-dark); font-weight: 800; }
.delete-row { border: 0; background: transparent; color: var(--danger); font-weight: 800; white-space: nowrap; }
.section-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 10px; color: var(--muted); font-size: .84rem; }
.section-foot strong { color: var(--ink); }
.summary-table { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.summary-head, .summary-line { display: grid; grid-template-columns: 1.15fr 1fr 1fr; align-items: center; gap: 15px; padding: 11px 15px; border-bottom: 1px solid var(--line); }
.manual-summary .summary-head,
.manual-summary .summary-line { grid-template-columns: 1.2fr 1fr; }
.summary-head { background: var(--surface-soft); color: var(--muted); font-size: .78rem; font-weight: 800; }
.summary-line { font-size: .88rem; }
.summary-line span:nth-child(n+2) { text-align: right; }
.summary-line strong { color: var(--primary-dark); }
.summary-line.total { background: var(--primary-soft); font-weight: 800; border-bottom: 0; }
.summary-line.total strong { font-size: 1rem; }
.summary-note { margin: 10px 1px 0; color: var(--muted); font-size: .76rem; }
.actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; }
.empty-card, .error-card { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.error-card { color: var(--danger); }
.dialog-lead { margin: 0 0 8px; font-size: 1.1rem; font-weight: 800; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.danger-button { min-height: 36px; padding: 7px 12px; border: 0; border-radius: 6px; background: var(--danger); color: #fff; font-weight: 800; }
@media (max-width: 900px) {
  .basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
