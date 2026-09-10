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
      <div v-else class="table-wrap records-table">
        <table>
          <thead>
            <tr><th>销售日期</th><th>等级</th><th>规格</th><th>数量</th><th>单价</th><th>金额</th></tr>
          </thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td>{{ record.saleDate }}</td>
              <td>{{ record.grade ? gradeLabel(record.grade) : record.gradeRaw || '未知' }}</td>
              <td>{{ record.specRaw || '—' }}</td>
              <td>{{ formatNumber(record.quantity) }}</td>
              <td>{{ formatPrice(record.unitPrice) }}</td>
              <td>{{ formatCurrency(record.amount) }}</td>
            </tr>
          </tbody>
        </table>
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
.records-head p { margin: 0; color: var(--muted); font-size: .84rem; }

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
.records-table { max-height: 60vh; }
.records-table table { min-width: 620px; }
.records-table thead th { position: sticky; top: 0; background: var(--surface); }
</style>
