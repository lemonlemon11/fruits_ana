<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { getSettlementComparison, type SettlementComparisonItem } from '../api/client'
import DateRangeFilter from '../components/DateRangeFilter.vue'
import SettlementComparison from '../components/SettlementComparison.vue'

const filters = reactive({ startDate: '', endDate: '' })
const settlements = ref<SettlementComparisonItem[]>([])
const loading = ref(true)
const error = ref('')
let requestVersion = 0

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '到达日期起不能晚于到达日期止'
    return
  }
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const next = await getSettlementComparison({ ...filters, includeAllSettlements: true })
    if (version === requestVersion) settlements.value = next
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '结算单对比加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack comparison-page">
    <form class="filter-bar comparison-filter" @submit.prevent="refresh">
      <DateRangeFilter
        v-model:start-date="filters.startDate"
        v-model:end-date="filters.endDate"
      />
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '正在查询' : '查看结果' }}</button>
    </form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>结算单数据没有加载成功</strong>请检查网络后重新查询。{{ error }}</span><button type="button" @click="refresh">重新查询</button></div>
    <SettlementComparison :items="settlements" :loading="loading" />
  </div>
</template>

<style scoped>
.comparison-page { gap: 18px; }
.comparison-filter { grid-template-columns: repeat(2, minmax(180px, 1fr)) auto; }

@media (max-width: 720px) {
  .comparison-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .comparison-filter .primary-button { grid-column: 1 / -1; }
}
</style>
