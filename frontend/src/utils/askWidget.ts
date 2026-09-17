// 顺仔问答的纯逻辑：答案分段、历史裁剪与错误文案，便于单独测试。
import type { AskHistoryMessage } from '../api/types'

/** 每次提问最多带上的历史条数，避免上下文无限增长。 */
export const ASK_MAX_HISTORY = 6

/** 答案里的一段：连续的文字行，或一组「- 」开头的列表项。 */
export interface AskAnswerBlock {
  kind: 'paragraph' | 'list'
  lines: string[]
}

const BULLET = /^[-•]\s+/
const HAS_CHINESE = /[\u4e00-\u9fa5]/

const STATUS_HINTS: Record<number, string> = {
  401: '登录已过期，请刷新页面重新登录。',
  502: '这次没等到模型回答，请再问一次。',
  503: '后端没有配置大模型 Key，问答暂时不可用。',
}

/** 把模型返回的纯文本按行切成段落与列表，空行直接丢弃。 */
export function parseAnswerBlocks(answer: string): AskAnswerBlock[] {
  const blocks: AskAnswerBlock[] = []
  let list: string[] = []
  const flush = (): void => {
    if (list.length) {
      blocks.push({ kind: 'list', lines: list })
      list = []
    }
  }
  for (const rawLine of String(answer ?? '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (BULLET.test(line)) {
      list.push(line.replace(BULLET, '').trim())
      continue
    }
    flush()
    blocks.push({ kind: 'paragraph', lines: [line] })
  }
  flush()
  return blocks
}

/** 已用秒数，保留一位小数。 */
export function formatAskElapsed(elapsedMs: number): string {
  const safe = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return (safe / 1000).toFixed(1)
}

/** 后端文案可读时优先用它，否则按状态码给一句人话。 */
export function askErrorText(error: unknown): string {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message.trim() : ''
  if (HAS_CHINESE.test(message)) return message
  return STATUS_HINTS[status] ?? (status > 0 ? `请求失败（${status}）` : '网络异常，请稍后重试。')
}

/** 追加一轮问答，只保留最近若干条作为下一次提问的上下文。 */
export function appendAskHistory(
  history: readonly AskHistoryMessage[],
  question: string,
  answer: string,
): AskHistoryMessage[] {
  const next: AskHistoryMessage[] = [
    ...history,
    { role: 'user', content: question },
    { role: 'assistant', content: answer },
  ]
  return next.slice(-ASK_MAX_HISTORY)
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : 0
}
