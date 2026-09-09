<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getContainerComparison, type ContainerComparisonItem } from '../api/client'
import ContainerComparison from '../components/ContainerComparison.vue'

const router = useRouter()
const filters = reactive({ startDate: '', endDate: '' })
const containers = ref<ContainerComparisonItem[]>([])
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
    const next = await getContainerComparison({ ...filters, includeAllContainers: true })
    if (version === requestVersion) containers.value = next
  } catch (caught) {
    if (version === requestVersion) error.value = caught instanceof Error ? caught.message : '货柜对比加载失败'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

function openContainer(containerId: string) {
  router.push({ path: '/containers', query: { container_id: containerId } })
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack comparison-page">
    <header class="page-header comparison-page-header">
      <div><p class="eyebrow">CONTAINER COMPARISON</p><h1>货柜重点对比</h1><p>选择 2～3 个货柜，在同一筛选范围内查看销售规模、等级结构与贡献率。</p></div>
      <RouterLink class="secondary-button" to="/containers">进入单柜诊断</RouterLink>
    </header>
    <nav class="view-switch" aria-label="分析视图"><RouterLink to="/overview">全局汇总</RouterLink><RouterLink to="/container-comparison" aria-current="page">货柜重点对比</RouterLink><RouterLink to="/containers">单柜诊断</RouterLink></nav>
    <form class="filter-bar comparison-filter" @submit.prevent="refresh">
      <label>开始日期<input v-model="filters.startDate" type="date" @change="refresh"></label>
      <label>结束日期<input v-model="filters.endDate" type="date" @change="refresh"></label>
      <button class="primary-button" type="submit" :disabled="loading">{{ loading ? '加载中' : '刷新对比' }}</button>
    </form>
    <div v-if="error" class="error-banner" role="alert"><span><strong>对比加载失败</strong>{{ error }}</span><button type="button" @click="refresh">重试</button></div>
    <div class="comparison-context"><span class="status-dot" aria-hidden="true" /><strong>横向比较口径</strong><span>{{ filters.startDate || '最早日期' }} 至 {{ filters.endDate || '最新日期' }} · 销量、销售额、加权均价及 A/B/C 贡献率</span></div>
    <ContainerComparison :items="containers" :loading="loading" @select="openContainer" />
  </div>
</template>

<style scoped>
.comparison-page { gap: 14px; }.comparison-page-header { padding-bottom: 14px; }.comparison-page-header h1 { margin-bottom: 4px; }.comparison-page-header p:last-child { margin-bottom: 0; font-size: .84rem; }.comparison-page-header > .secondary-button { min-height: 40px; white-space: nowrap; }.comparison-filter { gap: 10px; padding: 10px 12px; box-shadow: none; }.comparison-filter input { min-height: 42px; }.comparison-context { display: flex; align-items: center; gap: 8px; min-height: 34px; color: var(--muted); font-size: .72rem; }.comparison-context strong { color: var(--ink); }.comparison-context .status-dot { flex: 0 0 auto; }
@media (max-width: 720px) { .comparison-page-header { align-items: flex-start; flex-direction: column; gap: 10px; }.comparison-page-header > .secondary-button { width: 100%; }.comparison-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); }.comparison-filter label:first-child, .comparison-filter button { grid-column: span 2; }.comparison-context { align-items: flex-start; flex-wrap: wrap; line-height: 1.45; } }
</style>
