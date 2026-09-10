<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { generateSeriesAnalysis } from '../api/client'
import type { SeriesAnalysisResult } from '../api/types'
import { formatDateTime } from '../utils/format'
import { friendlyErrorMessage, parseAnalysisSections } from '../utils/seriesAnalysis'

const props = defineProps<{
  merchantNos: string[]
  startDate?: string
  endDate?: string
  disabled?: boolean
}>()

const analysis = ref<SeriesAnalysisResult | null>(null)
const loading = ref(false)
const error = ref('')
const askedOnce = ref(false)

const canGenerate = computed(() => props.merchantNos.length >= 2 && !props.disabled)
const sections = computed(() => parseAnalysisSections(analysis.value?.content ?? ''))
const generatedAtText = computed(() => formatDateTime(analysis.value?.generatedAt ?? ''))

watch(
  () => [props.merchantNos.join('|'), props.startDate ?? '', props.endDate ?? ''].join('::'),
  () => {
    analysis.value = null
    error.value = ''
    askedOnce.value = false
  },
)

async function generate(refresh = false) {
  if (!canGenerate.value) return
  loading.value = true
  error.value = ''
  askedOnce.value = true
  try {
    analysis.value = await generateSeriesAnalysis(
      props.merchantNos,
      { startDate: props.startDate, endDate: props.endDate },
      { refresh },
    )
  } catch (caught) {
    error.value = friendlyErrorMessage(caught instanceof Error ? caught.message : '')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="dashboard-section ai-section" aria-labelledby="ai-analysis-title">
    <header class="section-heading">
      <div>
        <h2 id="ai-analysis-title">AI 分析结论</h2>
        <p class="section-note">把上面的数字写成大白话，只作参考，请以表格数字为准</p>
      </div>
      <button
        v-if="analysis && !loading"
        type="button"
        class="text-button"
        :disabled="!canGenerate"
        @click="generate(true)"
      >
        重新生成
      </button>
    </header>

    <div v-if="!canGenerate" class="empty-state compact">
      <strong>先勾选结算单</strong>
      <span>勾选两个及以上结算单后，就可以生成分析。</span>
    </div>

    <div v-else-if="loading" class="ai-loading skeleton-block" aria-live="polite">
      正在生成，请稍候，大约需要半分钟
    </div>

    <div v-else-if="error" class="error-banner" role="alert">
      <span><strong>这次没有生成成功</strong>{{ error }}</span>
      <button type="button" @click="generate(askedOnce)">重试</button>
    </div>

    <template v-else-if="analysis">
      <div class="ai-sections">
        <article v-for="section in sections" :key="section.title" class="ai-block">
          <h3>{{ section.title }}</h3>
          <ul>
            <li v-for="(point, index) in section.points" :key="index">{{ point }}</li>
          </ul>
        </article>
      </div>
      <p class="ai-meta">
        模型 {{ analysis.model }} · 生成于 {{ generatedAtText }}<span v-if="analysis.cached"> · 本次直接使用上次结果</span>
      </p>
    </template>

    <div v-else class="ai-actions">
      <button type="button" class="primary-button" @click="generate(false)">生成分析</button>
      <span class="section-note">点一次就能看到结论，通常需要十几秒</span>
    </div>
  </section>
</template>

<style scoped>
.ai-section { gap: 12px; }
.ai-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.ai-loading { min-height: 96px; display: flex; align-items: center; justify-content: center; }
.ai-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.ai-block { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.ai-block h3 { margin: 0 0 8px; font-size: .92rem; }
.ai-block ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.ai-block li { font-size: .84rem; line-height: 1.6; overflow-wrap: anywhere; }
.ai-meta { margin: 0; color: var(--muted); font-size: .74rem; }
</style>
