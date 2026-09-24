<script setup lang="ts">
import ArrowLeft from '@lucide/vue/dist/esm/icons/arrow-left.mjs'
import CheckCircle2 from '@lucide/vue/dist/esm/icons/circle-check-big.mjs'
import RefreshCw from '@lucide/vue/dist/esm/icons/refresh-cw.mjs'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { currentUser, firstAllowedPath } from '../auth'
import {
  clearFatalError,
  createFatalErrorState,
  readFatalError,
  type FatalErrorKind,
} from '../utils/errorRecovery'

interface ErrorPresentation {
  label: string
  title: string
  lead: string
}

const ERROR_PRESENTATIONS: Record<FatalErrorKind, ErrorPresentation> = {
  server: {
    label: '系统暂时无法响应',
    title: '页面暂时打不开',
    lead: '可能是网络波动或服务繁忙。你可以重新加载当前页面，或者先返回首页继续查看其他数据。',
  },
  network: {
    label: '网络连接出现问题',
    title: '暂时无法连接系统',
    lead: '请检查当前网络连接。网络恢复后，可以重新加载刚才的页面。',
  },
  timeout: {
    label: '等待时间过长',
    title: '页面加载超时',
    lead: '系统可能正忙或网络较慢。请稍后重新加载，避免连续重复提交。',
  },
  route: {
    label: '页面资源加载失败',
    title: '页面暂时打不开',
    lead: '页面文件可能刚刚更新。重新加载通常可以恢复，也可以先返回首页。',
  },
  runtime: {
    label: '页面运行出现异常',
    title: '当前页面发生错误',
    lead: '系统没有完成当前操作。请重新加载页面；如果问题持续出现，请联系管理员。',
  },
  'not-found': {
    label: '没有找到这个页面',
    title: '你访问的页面不存在',
    lead: '地址可能已经变更或输入有误。请返回首页，从系统菜单重新进入。',
  },
  forbidden: {
    label: '当前账号没有访问权限',
    title: '暂时无法访问此页面',
    lead: '请返回首页选择可用功能。如需使用此页面，请联系管理员调整账号权限。',
  },
}

const router = useRouter()
const title = ref<HTMLElement | null>(null)
const errorState = ref(readFatalError() ?? createFatalErrorState({
  kind: 'runtime',
  source: 'navigation',
}))

const presentation = computed(() => ERROR_PRESENTATIONS[errorState.value.kind])
const canRetrySource = computed(() => (
  errorState.value.kind !== 'not-found'
  && errorState.value.kind !== 'forbidden'
))
const errorCode = computed(() => {
  if (errorState.value.status) return `ERROR ${errorState.value.status}`
  return `ERROR ${errorState.value.kind.toUpperCase()}`
})
const homePath = computed(() => firstAllowedPath(
  currentUser.value?.permissions ?? [],
  currentUser.value?.menus ?? [],
) ?? '/welcome')
const occurredAt = computed(() => {
  const date = new Date(errorState.value.occurredAt)
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false })
})
const kindLabel = computed(() => ({
  server: '服务异常',
  network: '网络异常',
  timeout: '请求超时',
  route: '页面加载异常',
  runtime: '页面运行异常',
  'not-found': '页面不存在',
  forbidden: '无访问权限',
})[errorState.value.kind])

onMounted(() => {
  void nextTick(() => title.value?.focus())
})

function retrySource(): void {
  const from = errorState.value.from
  clearFatalError()
  if (from) {
    window.location.assign(from)
    return
  }
  window.location.reload()
}

function returnHome(): void {
  clearFatalError()
  void router.replace(homePath.value)
}
</script>

<template>
  <section class="error-view" aria-labelledby="error-title">
    <article class="error-panel">
      <div class="error-visual" aria-hidden="true">
        <span class="error-code">{{ errorCode }}</span>
        <svg class="error-graphic" viewBox="0 0 160 160">
          <rect x="22" y="27" width="116" height="94" rx="8" />
          <path d="M22 49h116" />
          <circle class="error-window-dot error-window-dot-a" cx="36" cy="38" r="3" />
          <circle class="error-window-dot error-window-dot-b" cx="47" cy="38" r="3" />
          <circle class="error-window-dot error-window-dot-c" cx="58" cy="38" r="3" />
          <path class="error-chart-line" d="M42 98l20-18 16 12 24-29 18 14" />
          <circle class="error-cross-disc" cx="112" cy="108" r="26" />
          <path class="error-cross" d="m101 97 22 22m0-22-22 22" />
        </svg>
      </div>

      <div class="error-copy">
        <div class="error-label">{{ presentation.label }}</div>
        <h1
          id="error-title"
          ref="title"
          role="alert"
          aria-live="assertive"
          tabindex="-1"
        >
          {{ presentation.title }}
        </h1>
        <p class="error-lead">{{ presentation.lead }}</p>

        <div class="error-safe">
          <CheckCircle2 :size="20" aria-hidden="true" />
          <span>
            <strong>已保存的数据不会丢失</strong>
            如果刚完成录单或导入，请先确认结果，不要重复提交。
          </span>
        </div>

        <div class="error-actions">
          <button
            v-if="canRetrySource"
            class="error-action primary"
            type="button"
            @click="retrySource"
          >
            <RefreshCw :size="19" aria-hidden="true" />
            重新加载
          </button>
          <button class="error-action" type="button" @click="returnHome">
            <ArrowLeft :size="19" aria-hidden="true" />
            返回首页
          </button>
        </div>

        <details class="error-details">
          <summary>查看错误详情</summary>
          <dl>
            <div>
              <dt>错误类型</dt>
              <dd>{{ kindLabel }}</dd>
            </div>
            <div v-if="errorState.requestId">
              <dt>错误编号</dt>
              <dd><code>{{ errorState.requestId }}</code></dd>
            </div>
            <div>
              <dt>发生时间</dt>
              <dd>{{ occurredAt }}</dd>
            </div>
            <div v-if="errorState.from">
              <dt>来源页面</dt>
              <dd><code>{{ errorState.from }}</code></dd>
            </div>
          </dl>
        </details>
      </div>
    </article>
  </section>
</template>

<style src="../styles-error.css"></style>
