<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import type { SeriesAnalysisResult } from '../api/types'
import { formatDateTime } from '../utils/format'
import { friendlyErrorMessage, parseAnalysisSections } from '../utils/seriesAnalysis'

/** 通用 AI 结论卡片：只负责状态机与渲染，调哪个接口、用哪些小标题由调用方决定。 */
const props = defineProps<{
  title: string
  note: string
  headings: readonly string[]
  /** 条件变化时用它重置卡片，避免显示上一批数据的结论。 */
  resetKey: string
  canGenerate: boolean
  run: (refresh: boolean) => Promise<SeriesAnalysisResult>
  generateText?: string
  loadingText?: string
}>()

const analysis = ref<SeriesAnalysisResult | null>(null)
const loading = ref(false)
const error = ref('')
const askedOnce = ref(false)
// 同一页可能同时挂载两张卡片（按系列 / 按等级号别），标题 id 必须唯一。
const titleId = `ai-analysis-title-${useId()}`

const sections = computed(() => parseAnalysisSections(analysis.value?.content ?? '', props.headings))
const generatedAtText = computed(() => formatDateTime(analysis.value?.generatedAt ?? ''))
const buttonText = computed(() => props.generateText ?? '生成分析')
const loadingHint = computed(() => props.loadingText ?? '正在生成，请稍候，大约需要半分钟')

watch(() => props.resetKey, () => {
  analysis.value = null
  error.value = ''
  askedOnce.value = false
})

async function generate(refresh = false) {
  if (!props.canGenerate || loading.value) return
  loading.value = true
  error.value = ''
  askedOnce.value = true
  try {
    analysis.value = await props.run(refresh)
  } catch (caught) {
    error.value = friendlyErrorMessage(caught instanceof Error ? caught.message : '')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="dashboard-section ai-section" :aria-labelledby="titleId">
    <header class="section-heading">
      <div>
        <h2 :id="titleId">{{ title }}</h2>
        <p class="section-note">{{ note }}</p>
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
      {{ loadingHint }}
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
      <button type="button" class="primary-button" @click="generate(false)">{{ buttonText }}</button>
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
.ai-block li { font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
.ai-meta { margin: 0; color: var(--muted); font-size: .85rem; }
</style>
