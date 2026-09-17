<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { getSettlementRecords, gradeLabel, type SettlementRecord, type SettlementRecordsData } from '../api/client'
import { formatCurrency, formatNumber, formatPrice } from '../utils/format'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import { displayOrderNo, rawOrderNo } from '../utils/orderNo'
import DataTable, { type DataTableColumn } from './DataTable.vue'

const props = defineProps<{ merchantNo: string; title: string }>()
const emit = defineEmits<{ close: [] }>()

const loading = ref(true)
const error = ref('')
const data = ref<SettlementRecordsData | null>(null)

const records = computed<SettlementRecord[]>(() => data.value?.records ?? [])

/** 明细列：与「结算单详情」同口径，等级原文以小字跟在等级后面，不单独占一列。 */
const columns: DataTableColumn<SettlementRecord>[] = [
  { key: 'saleDate', label: '到达日期' },
  { key: 'fruitType', label: '品种', value: (record) => record.fruitType || '—' },
  { key: 'grade', label: '等级' },
  { key: 'specRaw', label: '规格', value: (record) => record.specRaw || '—' },
  { key: 'quantity', label: '数量', numeric: true, value: (record) => formatNumber(record.quantity) },
  { key: 'unitPrice', label: '单价', numeric: true, value: (record) => formatPrice(record.unitPrice) },
  { key: 'amount', label: '金额', numeric: true, value: (record) => formatCurrency(record.amount) },
  { key: 'salesRegion', label: '销售地区', value: (record) => record.salesRegion || '—' },
  { key: 'remark', label: '备注', value: (record) => record.remark || '—' },
]

const totals = computed(() =>
  records.value.reduce(
    (sum, record) => ({
      quantity: sum.quantity + (Number.isFinite(record.quantity) ? record.quantity : 0),
      amount: sum.amount + (Number.isFinite(record.amount) ? record.amount : 0),
    }),
    { quantity: 0, amount: 0 },
  ),
)

const salesPeriod = computed(() => {
  const dates = records.value.map((record) => record.saleDate).filter(Boolean).sort()
  if (!dates.length) return '—'
  const start = dates[0]
  const end = dates[dates.length - 1]
  return start === end ? start : `${start} 至 ${end}`
})

const merchantLabel = computed(() =>
  displayMerchantNo({
    merchantNo: data.value?.merchantNo || props.merchantNo,
    merchantNoNormalized: data.value?.merchantNoNormalized,
  }),
)
const merchantRaw = computed(() =>
  rawMerchantNo({ merchantNo: data.value?.merchantNo || props.merchantNo }),
)
const orderNoLabel = computed(() =>
  displayOrderNo({ orderNo: data.value?.orderNo, orderNoNormalized: data.value?.orderNoNormalized }),
)
const orderNoRaw = computed(() => rawOrderNo({ orderNo: data.value?.orderNo }))

/** 弹窗头部信息：接口已返回但旧版弹窗丢弃了的结算单身份字段。 */
const metaItems = computed(() => [
  {
    key: 'merchantNo',
    label: '商号',
    value: merchantLabel.value || '—',
    hint: merchantRaw.value && merchantRaw.value !== merchantLabel.value ? `原始商号：${merchantRaw.value}` : '',
  },
  {
    key: 'orderNo',
    label: '单号',
    value: orderNoLabel.value || '—',
    hint: orderNoRaw.value && orderNoRaw.value !== orderNoLabel.value ? `原始单号：${orderNoRaw.value}` : '',
  },
  { key: 'containerNo', label: '柜号', value: data.value?.containerNo || '—', hint: '' },
  { key: 'vehicleNo', label: '车牌', value: data.value?.vehicleNo || '—', hint: '' },
  { key: 'salesPeriod', label: '到达日期', value: salesPeriod.value, hint: '' },
  { key: 'count', label: '明细条数', value: records.value.length ? `${records.value.length} 条` : '—', hint: '' },
])

async function loadRecords() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getSettlementRecords(props.merchantNo)
  } catch (caught) {
    data.value = null
    error.value = caught instanceof Error ? caught.message : '明细加载失败'
  } finally {
    loading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadRecords()
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="records-overlay" @click.self="emit('close')">
    <section class="records-dialog" role="dialog" aria-modal="true" :aria-label="`${title} 全部明细`">
      <header class="records-head">
        <div>
          <h2>{{ title }}</h2>
          <p>{{ loading ? '正在加载明细' : `共 ${records.length} 条销售明细` }}</p>
        </div>
        <button class="records-close" type="button" @click="emit('close')">关闭</button>
      </header>

      <dl class="records-meta" aria-label="结算单信息">
        <div v-for="item in metaItems" :key="item.key">
          <dt>{{ item.label }}</dt>
          <dd :title="item.hint">{{ item.value }}</dd>
        </div>
      </dl>

      <div v-if="error" class="error-banner" role="alert">
        <span><strong>明细加载失败</strong>{{ error }}</span>
        <button type="button" @click="loadRecords">重新加载</button>
      </div>
      <div v-else-if="loading" class="skeleton-block">正在加载明细</div>
      <div v-else-if="!records.length" class="empty-inline">该结算单没有销售明细</div>
      <DataTable
        v-else
        class="records-table"
        :columns="columns"
        :rows="records"
        :row-key="(record) => record.id"
        caption="销售明细：每条记录的到达日期、品种、等级、规格、数量、单价、金额、销售地区与备注"
        min-width="980px"
        bordered
        cards-on-narrow
      >
        <template #cell-grade="{ row }">
          <span class="grade-cell">
            <span class="grade-badge" :class="`grade-${(row.grade ?? 'unknown').toLowerCase()}`">
              {{ row.grade ? gradeLabel(row.grade) : row.gradeRaw || '未知' }}
            </span>
            <small v-if="row.gradeRaw && row.gradeRaw !== gradeLabel(row.grade)">{{ row.gradeRaw }}</small>
          </span>
        </template>
        <template #footer>
          <div class="records-summary">
            <span>数量合计 <b>{{ formatNumber(totals.quantity) }}</b></span>
            <span>金额合计 <b>{{ formatCurrency(totals.amount) }}</b></span>
          </div>
        </template>
      </DataTable>
    </section>
  </div>
</template>

<style scoped>
.records-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: rgb(20 28 24 / 55%);
}

/* 头部信息 + 明细表：表格区吃掉剩余高度，只有列表内部滚动，合计条常驻底部。 */
.records-dialog {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  width: min(100%, 1180px);
  max-height: min(92vh, 880px);
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-top: 3px solid var(--primary);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.records-dialog > .skeleton-block,
.records-dialog > .empty-inline { align-self: start; }

.records-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
}

.records-head h2 { margin: 0 0 4px; font-size: 1.05rem; }
.records-head p { margin: 0; color: var(--muted); font-size: .85rem; }

.records-close {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--ink);
  cursor: pointer;
  font-weight: 700;
}

.records-close:hover { border-color: var(--primary); color: var(--primary-dark); }

.records-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.records-meta div { min-width: 0; }
.records-meta dt { color: var(--muted); font-size: .75rem; }
.records-meta dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: .88rem;
  font-weight: 700;
}

.records-table :deep(.data-table-foot) { padding: .45rem .8rem; }

.records-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 20px;
  color: var(--muted);
  font-size: .85rem;
}

.records-summary b { color: var(--ink); font-size: .95rem; font-variant-numeric: tabular-nums; }

.grade-cell {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.grade-badge {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-soft) 60%, var(--surface));
  color: var(--primary-dark);
  font-size: .78rem;
  font-weight: 800;
  white-space: nowrap;
}

.grade-badge.grade-a { color: var(--grade-a); }
.grade-badge.grade-b { color: var(--grade-b); }
.grade-badge.grade-c { color: var(--grade-c); }
.grade-badge.grade-unknown { color: var(--muted); }

.grade-cell small {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: .82rem;
}

@media (max-width: 560px) {
  .records-overlay { padding: 0; place-items: end center; }

  /* 窄屏走卡片模式，行高不再受视口约束，改由弹窗整体滚动。 */
  .records-dialog {
    grid-template-rows: auto auto auto;
    width: 100%;
    max-height: calc(100dvh - 18px);
    padding: 16px 14px calc(16px + env(safe-area-inset-bottom));
    overflow: auto;
    border-radius: 18px 18px 0 0;
  }

  .records-table :deep(.data-table) {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  /* 卡片模式下列表很长，合计条吸在弹窗底部，不用滚到最后一条才看得到。 */
  .records-table :deep(.data-table-foot) {
    position: sticky;
    z-index: 3;
    bottom: 0;
    border-top: 2px solid var(--line-strong);
    background: color-mix(in srgb, var(--surface-soft) 75%, var(--surface));
  }

  .records-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 10px; padding: 10px; }
  .records-head h2 { font-size: 1rem; }
  .records-close { min-height: 36px; padding: 0 12px; }
}
</style>
