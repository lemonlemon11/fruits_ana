<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = withDefaults(defineProps<{
  option: EChartsOption
  height?: string
  loading?: boolean
  ariaLabel?: string
}>(), {
  height: '260px',
  loading: false,
  ariaLabel: '',
})

const container = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function syncOption() {
  chart?.setOption(props.option, { notMerge: true })
}

function syncLoading() {
  if (!chart) return
  if (props.loading) chart.showLoading('default', { text: '正在加载', color: 'var(--primary)' })
  else chart.hideLoading()
}

onMounted(() => {
  if (!container.value) return
  chart = echarts.init(container.value)
  syncOption()
  syncLoading()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

watch(() => props.option, syncOption, { deep: true })
watch(() => props.loading, syncLoading)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div
    ref="container"
    class="base-echart"
    role="img"
    :aria-label="ariaLabel"
    :style="{ height }"
  />
</template>

<style scoped>
.base-echart {
  width: 100%;
  min-width: 0;
}
</style>
