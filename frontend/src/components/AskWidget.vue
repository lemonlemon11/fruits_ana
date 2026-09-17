<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { askQuestion } from '../api/client'
import type { AskHistoryMessage } from '../api/types'
import {
  appendAskHistory,
  askErrorText,
  formatAskElapsed,
  parseAnswerBlocks,
  type AskAnswerBlock,
} from '../utils/askWidget'

/**
 * 顺仔：右下角悬浮入口 + 微信式悬浮对话窗。
 * 答案全部来自后端 /api/ask，前端不做任何取数或计算。
 */
import './ask-widget.css'

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

interface ChatMessage {
  id: number
  kind: 'bot' | 'user' | 'pending' | 'error'
  role: string
  blocks: AskAnswerBlock[]
}

const WELCOME_BLOCKS: AskAnswerBlock[] = [
  { kind: 'paragraph', lines: ['你好，我是顺仔。结算单、等级、价格、销量都能问，'] },
  {
    kind: 'paragraph',
    lines: ['比如：「哪张单卖得最好？」「晴牌这个品牌卖得怎么样？」「这批货的采购成本是多少？」'],
  },
]

const open = ref(false)
const busy = ref(false)
const greeted = ref(false)
const statusText = ref('在线')
const messages = ref<ChatMessage[]>([])
const input = ref<HTMLTextAreaElement | null>(null)
const scrollBox = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const fab = ref<HTMLButtonElement | null>(null)
let history: AskHistoryMessage[] = []
let nextId = 1

function scrollToEnd(): void {
  void nextTick(() => {
    const node = scrollBox.value
    if (node) node.scrollTop = node.scrollHeight
  })
}

function pushMessage(kind: ChatMessage['kind'], role: string, blocks: AskAnswerBlock[]): ChatMessage {
  const message: ChatMessage = { id: nextId++, kind, role, blocks }
  messages.value.push(message)
  scrollToEnd()
  return message
}

function removeMessage(id: number): void {
  messages.value = messages.value.filter((item) => item.id !== id)
}

/**
 * 移动端对话窗跟随「可视视口」：软键盘弹出时浏览器只缩小可视视口，
 * 固定定位的整屏窗口不会自动收缩，输入框会被键盘盖住。
 * 这里把可视视口的高度与偏移写进 CSS 变量，交给样式决定整窗尺寸。
 */
function syncVisualViewport(): void {
  const node = panel.value
  const viewport = window.visualViewport
  const height = viewport ? Math.round(viewport.height) : 0
  if (!node) return
  // 取不到有效高度时清掉变量，让样式回落到整屏（100dvh），避免窗口塌成内容高度。
  if (!viewport || !Number.isFinite(height) || height <= 0) {
    node.style.removeProperty('--ask-vv-height')
    node.style.removeProperty('--ask-vv-top')
    return
  }
  node.style.setProperty('--ask-vv-height', `${height}px`)
  node.style.setProperty('--ask-vv-top', `${Math.max(0, Math.round(viewport.offsetTop))}px`)
}

function setOpen(value: boolean): void {
  open.value = value
  emit('update:open', value)
  if (!value) {
    fab.value?.focus()
    return
  }
  if (!greeted.value) {
    greeted.value = true
    pushMessage('bot', '顺仔', WELCOME_BLOCKS)
  }
  void nextTick(() => {
    syncVisualViewport()
    input.value?.focus()
    const node = scrollBox.value
    if (node) node.scrollTop = node.scrollHeight
  })
}

/**
 * 输入框内容变多时自己长高，不出现内部滚动条。
 * 上限走对话窗高度的 60%，避免输入区把消息区挤没；补 4px 余量抵消边框与取整误差。
 */
function autoGrow(): void {
  const node = input.value
  if (!node) return
  node.style.height = 'auto'
  const room = Math.max(96, (panel.value?.clientHeight ?? 0) * 0.6)
  node.style.height = `${Math.min(node.scrollHeight + 4, room)}px`
}

function resetInput(): void {
  const node = input.value
  if (node) node.value = ''
  autoGrow()
}

async function send(): Promise<void> {
  const question = input.value?.value.trim() ?? ''
  if (!question || busy.value) return
  resetInput()
  busy.value = true
  pushMessage('user', '', [{ kind: 'paragraph', lines: [question] }])
  const pending = pushMessage('pending', '顺仔', [{ kind: 'paragraph', lines: ['正在查数据…'] }])
  const startedAt = performance.now()
  try {
    const result = await askQuestion({ question, history })
    removeMessage(pending.id)
    const seconds = formatAskElapsed(performance.now() - startedAt)
    statusText.value = `用时 ${seconds}s`
    pushMessage('bot', `顺仔 · 用时 ${seconds}s`, parseAnswerBlocks(result.answer))
    history = appendAskHistory(history, question, result.answer)
  } catch (error) {
    removeMessage(pending.id)
    pushMessage('error', '顺仔', [{ kind: 'paragraph', lines: [askErrorText(error)] }])
  } finally {
    busy.value = false
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) setOpen(false)
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.addEventListener('resize', syncVisualViewport)
  window.visualViewport?.addEventListener('scroll', syncVisualViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.removeEventListener('resize', syncVisualViewport)
  window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
})
</script>

<template>
  <button
    ref="fab"
    class="ask-fab"
    :class="{ 'is-open': open }"
    type="button"
    aria-controls="ask-panel"
    :aria-expanded="open"
    :aria-label="open ? '收起顺仔数据问答' : '打开顺仔数据问答'"
    @click="setOpen(!open)"
  >
    <span class="ask-fab__label" aria-hidden="true">{{ open ? '收起' : '顺仔' }}</span>
    <span class="ask-fab__avatar" aria-hidden="true">
      <img class="ask-fab__avatar-img" src="/durian-mascot.svg" alt="" />
      <span class="ask-fab__avatar-close">×</span>
    </span>
  </button>

  <section v-if="open" id="ask-panel" ref="panel" class="ask-panel" aria-label="顺仔 · 数据问答">
    <header class="ask-panel__head">
      <span class="ask-panel__avatar" aria-hidden="true">顺</span>
      <div class="ask-panel__meta">
        <strong>顺仔</strong>
        <span aria-live="polite">{{ statusText }}</span>
      </div>
      <button class="ask-panel__close" type="button" aria-label="收起对话窗口" @click="setOpen(false)">×</button>
    </header>

    <div ref="scrollBox" class="ask-panel__scroll">
      <div class="chat-log">
        <article v-for="message in messages" :key="message.id" class="msg" :class="`msg-${message.kind}`">
          <span class="msg-avatar" aria-hidden="true">{{ message.kind === 'user' ? '我' : '顺' }}</span>
          <div class="msg-main">
            <p v-if="message.role" class="msg-role">{{ message.role }}</p>
            <div class="msg-body">
              <template v-for="(block, blockIndex) in message.blocks" :key="blockIndex">
                <ul v-if="block.kind === 'list'">
                  <li v-for="(line, lineIndex) in block.lines" :key="lineIndex">{{ line }}</li>
                </ul>
                <template v-else>
                  <p v-for="(line, lineIndex) in block.lines" :key="lineIndex">{{ line }}</p>
                </template>
              </template>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div class="ask-panel__foot">
      <form class="composer" @submit.prevent="send">
        <textarea
          ref="input"
          rows="1"
          maxlength="500"
          placeholder="例如：哪张单卖得最好？"
          aria-label="输入你的问题"
          @input="autoGrow"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <button type="submit" :disabled="busy">{{ busy ? '查询中…' : '发送' }}</button>
      </form>
    </div>
  </section>
</template>
