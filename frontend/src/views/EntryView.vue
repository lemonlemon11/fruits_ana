<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { FIXED_FEES, computeEntryTotals, createEmptyAfterSale, createEmptySale, createCustomFee, money } from '../utils/entryForm'
import { parseSpecRange } from '../utils/specRange'

const route = useRoute()
const router = useRouter()
const editingMerchantNo = ref(typeof route.query.merchant_no === 'string' ? route.query.merchant_no : '')
const loading = ref(true)
const saving = ref(false)
const draftSaving = ref(false)
const savingAsOverwrite = ref(false)
const error = ref('')
const toast = ref('')
const restoredDraft = ref(false)
const conflictOpen = ref(false)
/** 手机端分区折叠：窄屏默认只展开「基本信息」，其余按需展开，减少长表单滚动。 */
const narrowQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 820px)')
  : null
const isNarrow = ref(narrowQuery?.matches ?? false)
const collapsedBlocks = reactive<Record<string, boolean>>({})
const BLOCK_IDS = ['basic', 'sales', 'after', 'fees', 'summary'] as const
type BlockId = (typeof BLOCK_IDS)[number]
function isCollapsed(id: BlockId) { return isNarrow.value && (collapsedBlocks[id] ?? id !== 'basic') }
function toggleBlock(id: BlockId) { collapsedBlocks[id] = !isCollapsed(id) }
function expandAllBlocks() { for (const id of BLOCK_IDS) collapsedBlocks[id] = false }
async function jumpToBlock(id: BlockId) {
  collapsedBlocks[id] = false
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function onNarrowChange(event: MediaQueryListEvent) { isNarrow.value = event.matches }
const conflictMessage = ref('')
const marketOptions = ref<string[]>([])

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

const piecesDiff = computed(() => form.arrivalQuantity === null ? null : form.arrivalQuantity - totals.value.totalPieces)

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
  showToast(saved ? '已暂存，可稍后继续录单' : '暂存失败，请稍后重试')
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
  narrowQuery?.removeEventListener('change', onNarrowChange)
  if (draftTimer) window.clearTimeout(draftTimer)
  void flushDraft()
})

function showToast(message: string) {
  toast.value = message
  window.setTimeout(() => { if (toast.value === message) toast.value = '' }, 1800)
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
  return ''
}

async function submit(overwrite = false) {
  if (saving.value || draftSaving.value) return
  const validation = validate()
  if (validation) {
    expandAllBlocks()
    showToast(validation)
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
    showToast('已保存，正在打开结算单详情')
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
  narrowQuery?.addEventListener('change', onNarrowChange)
  void loadEntry()
})
</script>


<template>
  <section class="entry-page review-entry-page mobile-form-page">
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

      <section class="block" :class="{ 'is-collapsed': isCollapsed('basic') }" id="basic">
        <div class="block-title" :class="{ 'is-collapsible': isNarrow }" :aria-expanded="isNarrow ? !isCollapsed('basic') : undefined" @click="toggleBlock('basic')"><h2>基本信息</h2><span>来源：手工录入</span></div>
        <div v-show="!isCollapsed('basic')" class="block-body">
        <div class="basic-grid">
          <label class="field">
            <span>商号 *</span>
            <input v-model="form.merchantNo" :disabled="Boolean(editingMerchantNo)" aria-label="商号" />
          </label>
          <label class="field">
            <span>柜号 *</span>
            <input v-model="form.containerNo" aria-label="柜号" />
          </label>
          <label class="field">
            <span>单号 *</span>
            <input v-model="form.orderNo" aria-label="单号" />
          </label>
          <label class="field">
            <span>转运公司 / 车牌号 *</span>
            <input v-model="form.vehicleNo" aria-label="转运公司 / 车牌号" />
          </label>
          <label class="field">
            <span>国家 *</span>
            <input v-model="form.country" aria-label="国家" placeholder="如 越南" />
          </label>
          <label class="field">
            <span>市场 *</span>
            <select v-if="marketOptions.length" v-model="form.market" aria-label="市场">
              <option disabled value="">请选择</option>
              <option v-for="item in marketOptions" :key="item">{{ item }}</option>
            </select>
            <input v-else v-model="form.market" placeholder="请先由 fruit_admin 配置市场" aria-label="市场" />
          </label>
          <label class="field">
            <span>到达市场日期 *</span>
            <input v-model="form.arrivalDate" type="date" aria-label="到达市场日期" />
          </label>
          <label class="field">
            <span>来货数量（件） *</span>
            <input v-model.number="form.arrivalQuantity" type="number" min="0" step="1" aria-label="来货数量（件）" />
          </label>
        </div>
        </div>
      </section>

      <section class="block" :class="{ 'is-collapsed': isCollapsed('sales') }" id="sales">
        <div class="block-title" :class="{ 'is-collapsible': isNarrow }" :aria-expanded="isNarrow ? !isCollapsed('sales') : undefined" @click="toggleBlock('sales')"><h2>销售明细 <small>· {{ form.sales.length }} 行</small></h2><button class="outline" type="button" @click.stop="addSale">添加销售行</button></div>
        <div v-show="!isCollapsed('sales')" class="block-body">
        <DataTable
          class="review-table sale-table"
          :columns="saleColumns"
          :rows="form.sales"
          :row-key="saleRowKey"
          bordered
          cards-on-narrow
          caption="销售明细录入"
          min-width="1080px"
          empty-text="还没有销售行，点「添加销售行」开始录入"
        >
          <template #cell-saleDate="{ row }">
            <input v-model="row.saleDate" type="date" aria-label="销售日期" />
          </template>
          <template #cell-variety="{ row }">
            <input v-model="row.variety" aria-label="品种" placeholder="可选，如 金枕" />
          </template>
          <template #cell-grade="{ row }">
            <input v-model="row.grade" aria-label="等级" placeholder="可选，如 A、AB、BC" />
          </template>
          <template #cell-headCount="{ row }">
            <input v-model="row.headCount" :class="{ 'spec-invalid': invalidSpec(row.headCount) }" placeholder="可选，如 3/4" aria-label="规格（头数）" />
          </template>
          <template #cell-specKg="{ row }">
            <input v-model="row.specKg" :class="{ 'spec-invalid': invalidSpecKg(row.specKg) }" placeholder="可选，如 10" aria-label="规格（KG）" />
          </template>
          <template #cell-remark="{ row }">
            <input v-model="row.remark" aria-label="备注" />
          </template>
          <template #cell-salesQuantity="{ row }">
            <input v-model.number="row.salesQuantity" type="number" min="0" step="0.01" inputmode="decimal" aria-label="数量（件）" />
          </template>
          <template #cell-unitPrice="{ row }">
            <input v-model.number="row.unitPrice" type="number" min="0" step="0.01" inputmode="decimal" aria-label="单价（元）" placeholder="空白按 0" />
          </template>
          <template #cell-amount="{ row }">
            <strong class="money-amount">{{ saleAmount(row) }}</strong>
          </template>
          <template #cell-actions="{ row }">
            <button class="delete-row" type="button" @click="removeSale(form.sales.indexOf(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">
          <span>总件数 <strong>{{ totals.totalPieces }}</strong> 件</span>
          <span>销售金额 <strong>{{ money(totals.salesAmount) }}</strong> 元</span>
        </div>
        </div>
      </section>

      <section class="block" :class="{ 'is-collapsed': isCollapsed('after') }" id="after">
        <div class="block-title" :class="{ 'is-collapsible': isNarrow }" :aria-expanded="isNarrow ? !isCollapsed('after') : undefined" @click="toggleBlock('after')"><h2>售后明细 <small v-if="form.afterSales.length">· {{ form.afterSales.length }} 行</small></h2><button class="outline" type="button" @click.stop="addAfterSale">添加售后行</button></div>
        <div v-show="!isCollapsed('after')" class="block-body">
        <DataTable
          class="review-table smaller after-sale-table"
          :columns="afterSaleColumns"
          :rows="form.afterSales"
          :row-key="afterSaleRowKey"
          bordered
          cards-on-narrow
          caption="售后明细录入"
          min-width="540px"
          empty-text="还没有售后行，点「添加售后行」开始录入"
        >
          <template #cell-content="{ row }">
            <input v-model="row.content" aria-label="售后内容" />
          </template>
          <template #cell-summary="{ row }">
            <input v-model="row.summary" aria-label="售后摘要" />
          </template>
          <template #cell-amount="{ row }">
            <input v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" aria-label="售后金额（元）" />
          </template>
          <template #cell-actions="{ row }">
            <button class="delete-row" type="button" @click="removeAfterSale(form.afterSales.indexOf(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">售后合计 <strong>{{ money(totals.afterAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" :class="{ 'is-collapsed': isCollapsed('fees') }" id="fees">
        <div class="block-title" :class="{ 'is-collapsible': isNarrow }" :aria-expanded="isNarrow ? !isCollapsed('fees') : undefined" @click="toggleBlock('fees')"><h2>支出费用 <small>· 合计 {{ money(totals.feeAmount) }} 元</small></h2><button class="outline" type="button" @click.stop="addCustomFee">添加费用行</button></div>
        <div v-show="!isCollapsed('fees')" class="block-body">
        <DataTable
          class="review-table smaller fee-table"
          :columns="feeColumns"
          :rows="form.fees"
          :row-key="feeRowKey"
          bordered
          cards-on-narrow
          caption="支出费用录入"
          min-width="540px"
        >
          <template #cell-name="{ row }">
            <input v-if="row.isCustom" v-model="row.name" aria-label="费用摘要" />
            <span v-else>{{ row.name }}</span>
          </template>
          <template #cell-amount="{ row }">
            <input v-model.number="row.amount" type="number" min="0" step="0.01" inputmode="decimal" :aria-label="`${row.name}金额（元）`" />
          </template>
          <template #cell-actions="{ row }">
            <button v-if="row.isCustom" class="delete-row" type="button" @click="removeCustomFee(customFeeIndex(row))">删除</button>
          </template>
        </DataTable>
        <div class="section-foot">费用合计 <strong>{{ money(totals.feeAmount) }}</strong> 元</div>
        </div>
      </section>

      <section class="block" :class="{ 'is-collapsed': isCollapsed('summary') }" id="summary">
        <div class="block-title" :class="{ 'is-collapsible': isNarrow }" :aria-expanded="isNarrow ? !isCollapsed('summary') : undefined" @click="toggleBlock('summary')"><h2>结算核对 <small>· 应付 {{ money(totals.payable) }} 元</small></h2></div>
        <div v-show="!isCollapsed('summary')" class="block-body">
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
        <span class="toast">{{ toast }}</span>
        <button class="subtle" type="button" :disabled="draftSaving || saving" @click="saveDraftNow">{{ draftSaving ? '暂存中…' : '暂存' }}</button>
        <button class="primary" type="button" :disabled="saving || draftSaving" @click="submit(false)">{{ saving ? (savingAsOverwrite ? '覆盖中…' : '保存中…') : editingMerchantNo ? '保存修改' : '确认保存' }}</button>
      </div>
    </template>

    <div v-if="conflictOpen" class="overlay" role="dialog" aria-modal="true">
      <section class="dialog">
        <p class="eyebrow">商号冲突</p>
        <h2>商号 {{ form.merchantNo }} 已存在</h2>
        <p>{{ conflictMessage }}。确认覆盖后，旧数据将被本次录入内容替换。</p>
        <div class="dialog-actions">
          <button class="subtle" type="button" @click="conflictOpen = false">取消</button>
          <button class="danger-button" type="button" :disabled="saving" @click="submit(true)">{{ savingAsOverwrite ? '覆盖中…' : '确认覆盖并保存' }}</button>
        </div>
      </section>
    </div>
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
.field input, .field select { width: 100%; min-height: 38px; padding: 6px 9px; border: 1px solid var(--line-strong); border-radius: 6px; background: #fff; color: var(--ink); font: inherit; }
.field input:focus, .field select:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); outline: none; }
.review-table :deep(.data-table td) { padding: .38rem .5rem; }
.review-table :deep(.data-table thead th) { padding: .5rem .6rem; }
.review-table input { width: 100%; min-height: 36px; padding: 5px 7px; border: 1px solid var(--line-strong); border-radius: 5px; background: #fff; color: var(--ink); font: inherit; }
.review-table input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); outline: none; }
.review-table input.spec-invalid { border-color: var(--danger); background: #fff5f5; }
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
.actions span { margin-right: auto; color: var(--muted); font-size: .78rem; }
.empty-card, .error-card { padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.error-card { color: var(--danger); }
.overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgb(24 49 42 / 45%); padding: 16px; }
.dialog { width: min(520px, 100%); padding: 20px; border-radius: 14px; background: #fff; box-shadow: 0 16px 40px rgb(0 0 0 / 18%); }
.dialog h2 { margin: 8px 0 12px; font-size: 1.2rem; }
.dialog p { line-height: 1.6; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.danger-button { min-height: 36px; padding: 7px 12px; border: 0; border-radius: 6px; background: var(--danger); color: #fff; font-weight: 800; }
@media (max-width: 900px) {
  .basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .entry-head { align-items: flex-start; flex-direction: column; }
  .basic-grid { grid-template-columns: 1fr; }
  .summary-head, .summary-line { grid-template-columns: 1fr .95fr 1fr; gap: 6px; padding: 10px 8px; font-size: .76rem; }
  .manual-summary .summary-head,
  .manual-summary .summary-line { grid-template-columns: 1fr 1fr; }
  .actions span { flex-basis: 100%; }
}
</style>
