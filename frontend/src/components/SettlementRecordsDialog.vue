<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { getSettlementRecords, gradeLabel } from '../api/client'
import { formatCurrency, formatNumber, formatPrice } from '../utils/format'

const props = defineProps<{ merchantNo: string; title: string }>()
const emit = defineEmits<{ close: [] }>()

const loading = ref(true)
const error = ref('')
const records = ref<Awaited<ReturnType<typeof getSettlementRecords>>['records']>([])

async function loadRecords() {
  loading.value = true
  error.value = ''
  try {
    records.value = (await getSettlementRecords(props.merchantNo)).records
  } catch (caught) {
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
      <div v-if="error" class="error-banner" role="alert"><span><strong>明细加载失败</strong>{{ error }}</span><button type="button" @click="loadRecords">重新加载</button></div>
      <div v-if="loading" class="skeleton-block">正在加载明细</div>
      <div v-else-if="!records.length" class="empty-inline">该结算单没有销售明细</div>
      <div v-else class="records-results">
        <div class="records-grid" role="list">
          <article v-for="(record, index) in records" :key="record.id" class="record-card" role="listitem">
            <header class="record-card-head">
              <div class="record-title">
                <span class="record-index">#{{ index + 1 }}</span>
                <strong>{{ record.saleDate }}</strong>
              </div>
              <span
                class="record-grade"
                :class="`grade-${(record.grade ?? 'unknown').toLowerCase()}`"
              >
                {{ record.grade ? gradeLabel(record.grade) : record.gradeRaw || '未知' }}
              </span>
            </header>
            <div class="record-metrics" aria-label="销售核心指标">
              <div>
                <span>数量</span>
                <strong>{{ formatNumber(record.quantity) }}</strong>
              </div>
              <div>
                <span>单价</span>
                <strong>{{ formatPrice(record.unitPrice) }}</strong>
              </div>
              <div>
                <span>金额</span>
                <strong>{{ formatCurrency(record.amount) }}</strong>
              </div>
            </div>
            <dl class="record-fields">
              <div>
                <dt>品种</dt>
                <dd>{{ record.fruitType || '—' }}</dd>
              </div>
              <div>
                <dt>等级</dt>
                <dd>{{ record.grade ? gradeLabel(record.grade) : record.gradeRaw || '未知' }}</dd>
              </div>
              <div>
                <dt>等级原文</dt>
                <dd>{{ record.gradeRaw || '—' }}</dd>
              </div>
              <div>
                <dt>规格</dt>
                <dd>{{ record.specRaw || '—' }}</dd>
              </div>
              <div>
                <dt>销售地区</dt>
                <dd>{{ record.salesRegion || '—' }}</dd>
              </div>
              <div class="record-remark">
                <dt>备注</dt>
                <dd>{{ record.remark || '—' }}</dd>
              </div>
            </dl>
          </article>
        </div>
      </div>
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

.records-dialog {
  display: grid;
  gap: 14px;
  width: min(100%, 880px);
  max-height: min(86vh, 720px);
  padding: 20px;
  overflow: auto;
  border: 1px solid var(--line);
  border-top: 3px solid var(--primary);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

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
.records-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.record-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
}

.record-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.record-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.record-title strong {
  overflow-wrap: anywhere;
  font-size: 1rem;
}

.record-index {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: .78rem;
  font-variant-numeric: tabular-nums;
}

.record-grade {
  flex: 0 0 auto;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--primary-dark);
  font-size: .78rem;
  font-weight: 800;
  white-space: nowrap;
}

.record-grade.grade-a { color: var(--grade-a); }
.record-grade.grade-b { color: var(--grade-b); }
.record-grade.grade-c { color: var(--grade-c); }
.record-grade.grade-unknown { color: var(--muted); }

.record-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.record-metrics div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
}

.record-metrics span {
  display: block;
  color: var(--muted);
  font-size: .75rem;
}

.record-metrics strong {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: .95rem;
  font-variant-numeric: tabular-nums;
}

.record-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.record-fields div {
  min-width: 0;
}

.record-fields dt {
  color: var(--muted);
  font-size: .75rem;
}

.record-fields dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: .88rem;
  line-height: 1.4;
}

.record-remark {
  grid-column: 1 / -1;
}

.record-remark dd {
  padding: 8px 9px;
  border-left: 3px solid var(--line-strong);
  background: var(--surface);
  line-height: 1.5;
}

@media (max-width: 560px) {
  .records-overlay { padding: 0; place-items: end center; }
  .records-dialog { width: 100%; max-height: calc(100vh - 18px); padding: 16px 14px calc(16px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0; }
  .records-results { min-width: 0; }
  .records-grid { grid-template-columns: 1fr; gap: 10px; }
  .record-card { padding: 10px; }
  .record-metrics { gap: 6px; }
  .record-metrics div { padding: 7px; }
  .record-metrics span { font-size: .68rem; }
  .record-metrics strong { font-size: .86rem; }
  .record-fields { gap: 6px; }
  .record-fields dt { font-size: .68rem; }
  .record-fields dd { font-size: .82rem; }
}
</style>
