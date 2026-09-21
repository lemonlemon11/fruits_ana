<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import type { SeriesAnalysisResult } from '../api/types'
import { formatDateTime } from '../utils/format'
import {
  friendlyErrorMessage,
  highlightNumbers,
  isAdviceHeading,
  parseAnalysisSections,
} from '../utils/seriesAnalysis'

/** 通用 AI 结论卡片：只负责状态机与渲染，调哪个接口、用哪些小标题由调用方决定。 */
const props = withDefaults(defineProps<{
  title: string
  note: string
  headings: readonly string[]
  /** 条件变化时用它重置卡片，避免显示上一批数据的结论。 */
  resetKey: string
  canGenerate: boolean
  run: (refresh: boolean) => Promise<SeriesAnalysisResult>
  generateText?: string
  loadingText?: string
  /** 条件不满足时的空状态文案。 */
  emptyTitle?: string
  emptyHint?: string
  /** 只在卡片可见时自动加载；隐藏的 AI 卡片不请求。 */
  active?: boolean
  /** 条件满足后默认自动读取缓存，没有缓存才生成。 */
  autoRun?: boolean
}>(), {
  active: true,
  autoRun: true,
  emptyTitle: '先勾选结算单',
  emptyHint: '勾选两个及以上结算单后，就可以生成分析。',
})

const analysis = ref<SeriesAnalysisResult | null>(null)
/** 手机端结论文本很长，默认只露出前几屏内容，展开后再看全文。 */
const narrowQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 820px)')
  : null
const isNarrow = ref(narrowQuery?.matches ?? false)
const expanded = ref(false)
function onNarrowChange(event: MediaQueryListEvent) { isNarrow.value = event.matches }
const loading = ref(false)
const error = ref('')
const askedOnce = ref(false)
// 同一页可能同时挂载两张卡片（按品牌 / 按等级号别），标题 id 必须唯一。
const titleId = `ai-analysis-title-${useId()}`

const sections = computed(() => parseAnalysisSections(analysis.value?.content ?? '', props.headings))

watch(analysis, () => { expanded.value = false })

onMounted(() => narrowQuery?.addEventListener('change', onNarrowChange))
onBeforeUnmount(() => narrowQuery?.removeEventListener('change', onNarrowChange))
const generatedAtText = computed(() => formatDateTime(analysis.value?.generatedAt ?? ''))
const buttonText = computed(() => props.generateText ?? '生成分析')
const loadingHint = computed(() => props.loadingText ?? '正在生成，请稍候，大约需要半分钟')

let lastAutoKey = ''
let requestVersion = 0

watch(
  () => [props.resetKey, props.canGenerate, props.active, props.autoRun] as const,
  ([resetKey, canGenerate, active, autoRun]) => {
    const key = [resetKey, String(canGenerate), String(active), String(autoRun)].join('::')
    if (key === lastAutoKey) return
    lastAutoKey = key
    requestVersion += 1
    loading.value = false
    analysis.value = null
    error.value = ''
    askedOnce.value = false
    if (autoRun && active && canGenerate) void generate(false)
  },
  { immediate: true },
)

async function generate(refresh = false) {
  if (!props.canGenerate) return
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  askedOnce.value = true
  try {
    const result = await props.run(refresh)
    if (version !== requestVersion) return
    analysis.value = result
  } catch (caught) {
    if (version !== requestVersion) return
    error.value = friendlyErrorMessage(caught instanceof Error ? caught.message : '')
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
</script>

<template>
  <section class="dashboard-section ai-section" :aria-labelledby="titleId">
    <header class="section-heading ai-heading">
      <div>
        <h2 :id="titleId">{{ title }}</h2>
        <p class="section-note">{{ note }}</p>
      </div>
      <div class="ai-heading-side">
        <span class="ai-badge">AI 解读</span>
        <button
          v-if="analysis && !loading"
          type="button"
          class="text-button"
          :disabled="!canGenerate"
          @click="generate(true)"
        >
          重新生成
        </button>
      </div>
    </header>

    <div v-if="!canGenerate" class="empty-state compact">
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyHint }}</span>
    </div>

    <div v-else-if="loading" class="ai-loading skeleton-block" aria-live="polite">
      {{ loadingHint }}
    </div>

    <div v-else-if="error" class="error-banner" role="alert">
      <span><strong>这次没有生成成功</strong>{{ error }}</span>
      <button type="button" @click="generate(askedOnce)">重试</button>
    </div>

    <template v-else-if="analysis">
      <div class="ai-sections" :class="{ 'is-clamped': isNarrow && !expanded }">
        <article
          v-for="section in sections"
          :key="section.title"
          class="ai-block"
          :class="{ 'is-advice': isAdviceHeading(section.title) }"
        >
          <h3>{{ section.title }}</h3>
          <ul>
            <li v-for="(point, index) in section.points" :key="index">
              <span class="ai-index" aria-hidden="true">{{ index + 1 }}</span>
              <span class="ai-text">
                <template v-for="(segment, segmentIndex) in highlightNumbers(point)" :key="segmentIndex">
                  <strong v-if="segment.strong" class="ai-num">{{ segment.text }}</strong>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </span>
            </li>
          </ul>
        </article>
      </div>
      <button
        v-if="isNarrow"
        type="button"
        class="ai-expand-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >{{ expanded ? '收起结论' : '展开全部结论' }}</button>
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
/* 结论区整体做成醒目的主色卡片，和上面的数字表格区分开。 */
.ai-section {
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--primary);
  border-left: 6px solid var(--primary);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary-soft) 45%, white);
}
.ai-heading h2 { font-size: 1.2rem; }
.ai-heading-side { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.ai-badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--primary);
  color: white;
  font-size: .82rem;
  font-weight: 700;
  white-space: nowrap;
}
.ai-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.ai-loading { min-height: 96px; display: flex; align-items: center; justify-content: center; }
.ai-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.ai-block {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
/* 建议类小节换暖色底，让「接下来该做什么」一眼能看见。 */
.ai-block.is-advice { border-color: var(--warning); background: #fff8e6; }
.ai-block h3 {
  margin: 0 0 10px;
  padding-left: 10px;
  border-left: 3px solid var(--primary);
  font-size: 1.05rem;
}
.ai-block.is-advice h3 { border-left-color: var(--warning); }
.ai-block ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.ai-block li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; }
.ai-index {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; margin-top: 2px;
  border-radius: 50%; background: var(--primary-soft); color: var(--primary-dark);
  font-size: .78rem; font-weight: 700; font-variant-numeric: tabular-nums;
}
.ai-block.is-advice .ai-index { background: #f6e3bb; color: var(--warning); }
.ai-text { font-size: 1rem; line-height: 1.75; overflow-wrap: anywhere; }
/* 关键数字加粗放大，果农扫一眼就能看到价格、件数和占比。 */
.ai-num { color: var(--primary-dark); font-size: 1.06rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.ai-block.is-advice .ai-num { color: var(--warning); }
.ai-meta { margin: 0; color: var(--muted); font-size: .85rem; }

/* 手机端折叠：默认只露出开头，底部渐隐提示还有内容。 */
.ai-sections.is-clamped { position: relative; max-height: 17rem; overflow: hidden; }
.ai-sections.is-clamped::after {
  position: absolute;
  inset: auto 0 0 0;
  height: 4.5rem;
  background: linear-gradient(to bottom, rgb(255 255 255 / 0), color-mix(in srgb, var(--primary-soft) 45%, white));
  content: '';
  pointer-events: none;
}
.ai-expand-toggle {
  min-height: 42px;
  border: 1px solid var(--primary);
  border-radius: 999px;
  background: var(--surface);
  color: var(--primary-dark);
  font: inherit;
  font-size: .88rem;
  font-weight: 800;
  cursor: pointer;
}

@media (max-width: 820px) {
  .ai-section { padding: 12px; border-left-width: 5px; gap: 10px; }
  .ai-heading h2 { font-size: 1.02rem; }
  .ai-sections { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .ai-block { padding: 10px 12px; }
  .ai-block h3 { margin-bottom: 8px; font-size: .96rem; }
  .ai-block ul { gap: 8px; }
  .ai-text { font-size: .92rem; line-height: 1.6; }
  .ai-meta { font-size: .78rem; }
}
</style>
