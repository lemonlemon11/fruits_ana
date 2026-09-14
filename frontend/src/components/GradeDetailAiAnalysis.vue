<script setup lang="ts">
import { computed } from 'vue'

import { generateGradeDetailAnalysis } from '../api/client'
import { GRADE_DETAIL_HEADINGS } from '../utils/seriesAnalysis'
import AiAnalysisCard from './AiAnalysisCard.vue'

/** 「等级细分」的 AI 小结；提示词与品牌对比不同，必须标注样本量。 */
const props = defineProps<{
  merchantNos: string[]
  startDate?: string
  endDate?: string
  disabled?: boolean
  active?: boolean
}>()

const resetKey = computed(() =>
  [props.merchantNos.join('|'), props.startDate ?? '', props.endDate ?? ''].join('::'),
)

const canGenerate = computed(() => props.merchantNos.length >= 2 && !props.disabled)

const run = (refresh: boolean) =>
  generateGradeDetailAnalysis(
    props.merchantNos,
    { startDate: props.startDate, endDate: props.endDate },
    { refresh },
  )
</script>

<template>
  <AiAnalysisCard
    title="号别小结"
    note="按等级号别写成的白话结论；样本不足时只看这批货，只作参考"
    :headings="GRADE_DETAIL_HEADINGS"
    :reset-key="resetKey"
    :can-generate="canGenerate"
    :active="active"
    :run="run"
    generate-text="生成号别小结"
  />
</template>
