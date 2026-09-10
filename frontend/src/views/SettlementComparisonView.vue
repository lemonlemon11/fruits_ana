<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { getSettlementComparison, type SettlementComparisonItem } from '../api/client'
import SettlementComparison from '../components/SettlementComparison.vue'

const filters = reactive({ startDate: '', endDate: '' })
const settlements = ref<SettlementComparisonItem[]>([])
const loading = ref(true)
const error = ref('')
let requestVersion = 0

async function refresh() {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    error.value = '开始日期不能晚于结束日期'
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
    <header class="page-header comparison-page-header">
      <div><h1>结算单对比</h1><p>按日期查看各结算单（按商号归集）的销量、销售额和平均售价。</p></div>
    </header>
    <section class="how-to" aria-label="查看方法">
      <strong>怎么查看</strong>
      <span>第一步：选择日期。第二步：点击“查看结果”。在结果上方可以更换排序方式。</span>
    </section>
    <form class="filter-bar comparison-filter" @submit.prevent="refresh">
      <label>开始日期<input v-model="filters.startDate" type="date"></label>
      <label>结束日期<input v-model="filters.endDate" type="date"></label>
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
  .comparison-filter { grid-template-columns: 1fr; }
}
</style>
