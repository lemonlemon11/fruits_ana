<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import type { EChartsOption } from 'echarts'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  option: EChartsOption
  height?: string
  loading?: boolean
  ariaLabel?: string
}>(), {
  height: '260px',
  loading: false,
  ariaLabel: '',
})

const componentReady = ref(false)
const AsyncBaseEChart = defineAsyncComponent({
  loader: () => import('./BaseEChart.vue').then((component) => {
    componentReady.value = true
    return component
  }),
  suspensible: false,
})
</script>

<template>
  <div
    class="deferred-echart"
    :style="{ minHeight: height }"
    :aria-busy="!componentReady"
  >
    <AsyncBaseEChart
      v-bind="$attrs"
      :option="option"
      :height="height"
      :loading="loading"
      :aria-label="ariaLabel"
    />
    <div v-if="!componentReady" class="deferred-echart-placeholder skeleton-block">
      <span class="sr-only">图表组件正在加载</span>
    </div>
  </div>
</template>

<style scoped>
.deferred-echart {
  position: relative;
  width: 100%;
  min-width: 0;
}

.deferred-echart-placeholder {
  position: absolute;
  inset: 0;
}
</style>
