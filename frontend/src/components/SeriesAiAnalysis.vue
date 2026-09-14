<script setup lang="ts">
import { computed } from 'vue'

import { generateSeriesAnalysis } from '../api/client'
import { ANALYSIS_HEADINGS } from '../utils/seriesAnalysis'
import AiAnalysisCard from './AiAnalysisCard.vue'

/** 「品牌对比」的 AI 分析结论；渲染与状态机在 AiAnalysisCard。 */
const props = defineProps<{
  merchantNos: string[]
  startDate?: string
  endDate?: string
  disabled?: boolean
}>()

const resetKey = computed(() =>
  [props.merchantNos.join('|'), props.startDate ?? '', props.endDate ?? ''].join('::'),
)

const canGenerate = computed(() => props.merchantNos.length >= 2 && !props.disabled)

const run = (refresh: boolean) =>
  generateSeriesAnalysis(
    props.merchantNos,
    { startDate: props.startDate, endDate: props.endDate },
    { refresh },
  )
</script>

<template>
  <AiAnalysisCard
    title="AI 分析结论"
    note="把上面的数字写成大白话，只作参考，请以表格数字为准"
    :headings="ANALYSIS_HEADINGS"
    :reset-key="resetKey"
    :can-generate="canGenerate"
    :run="run"
  />
</template>
