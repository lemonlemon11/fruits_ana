import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import type { AskHistoryMessage } from '../src/api/types.ts'
import {
  ASK_MAX_HISTORY,
  appendAskHistory,
  askErrorText,
  formatAskElapsed,
  parseAnswerBlocks,
} from '../src/utils/askWidget.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

function read(...parts: string[]): string {
  return fs.readFileSync(path.join(src, ...parts), 'utf8')
}

function withStatus(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

test('parseAnswerBlocks 把「- 」行并成一个列表，其余行各自成段', () => {
  assert.deepEqual(parseAnswerBlocks('共 12 张结算单\n- 晴牌-001\n- 香香-002'), [
    { kind: 'paragraph', lines: ['共 12 张结算单'] },
    { kind: 'list', lines: ['晴牌-001', '香香-002'] },
  ])
})

test('parseAnswerBlocks 保持段落与列表的先后顺序', () => {
  const blocks = parseAnswerBlocks('- 第一条\n小结一句\n- 第二条')

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['list', 'paragraph', 'list'],
  )
})

test('parseAnswerBlocks 支持「• 」开头，并丢弃空行', () => {
  assert.deepEqual(parseAnswerBlocks('• 晴牌-001\n\n   \n- 香香-002'), [
    { kind: 'list', lines: ['晴牌-001', '香香-002'] },
  ])
  assert.deepEqual(parseAnswerBlocks('   \n\n'), [])
  assert.deepEqual(parseAnswerBlocks(''), [])
})

test('formatAskElapsed 保留一位小数', () => {
  assert.equal(formatAskElapsed(1234), '1.2')
  assert.equal(formatAskElapsed(0), '0.0')
  assert.equal(formatAskElapsed(Number.NaN), '0.0')
})

test('askErrorText 优先使用后端给的中文文案', () => {
  assert.equal(askErrorText(new Error('问题太长，请拆成几句再问')), '问题太长，请拆成几句再问')
})

test('askErrorText 在后端文案不可读时按状态码兜底', () => {
  assert.equal(askErrorText(withStatus(503, 'Service Unavailable')), '后端没有配置大模型 Key，问答暂时不可用。')
  assert.equal(askErrorText(withStatus(502, 'Bad Gateway')), '这次没等到模型回答，请再问一次。')
  assert.equal(askErrorText(withStatus(401, 'Unauthorized')), '登录已过期，请刷新页面重新登录。')
  assert.equal(askErrorText(withStatus(500, 'Internal Server Error')), '请求失败（500）')
})

test('askErrorText 把网络异常翻译成人话', () => {
  assert.equal(askErrorText(new TypeError('Failed to fetch')), '网络异常，请稍后重试。')
  assert.equal(askErrorText(undefined), '网络异常，请稍后重试。')
})

test('appendAskHistory 追加一轮问答并只保留最近若干条', () => {
  let history: AskHistoryMessage[] = []
  for (let index = 0; index < 5; index += 1) {
    history = appendAskHistory(history, `问 ${index}`, `答 ${index}`)
  }

  assert.equal(ASK_MAX_HISTORY, 6)
  assert.equal(history.length, ASK_MAX_HISTORY)
  assert.deepEqual(history.at(0), { role: 'user', content: '问 2' })
  assert.deepEqual(history.at(-1), { role: 'assistant', content: '答 4' })
})

test('外壳在登录后的页面挂载顺仔，并在对话窗打开时让出「回顶部」', () => {
  const shell = read('AppShell.vue')
  const askIndex = shell.indexOf('<AskWidget')

  assert.ok(askIndex > 0, 'AppShell 未渲染顺仔')
  assert.ok(askIndex > shell.indexOf('<template v-else>'), '顺仔不应出现在登录 / 公开预览页')
  assert.match(shell, /v-show="showBackToTop && !askOpen"/)
})

test('顺仔只对拥有 ask:view 的角色显示', () => {
  const shell = read('AppShell.vue')

  assert.match(shell, /<AskWidget v-if="canAsk"/)
  assert.match(
    shell,
    /const canAsk = computed\(\(\) => Boolean\(currentUser\.value\?\.permissions\.includes\('ask:view'\)\)\)/,
  )
})

test('顺仔与「回顶部」的分层与避让约定保持稳定', () => {
  const css = read('components', 'ask-widget.css')

  assert.match(css, /\.ask-fab \{[^}]*z-index: 40/)
  assert.match(css, /\.ask-panel \{[^}]*z-index: 45/)
  assert.match(read('styles-shell.css'), /\.back-to-top \{[^}]*z-index: 35/)
  assert.match(css, /--ask-lift: 64px/)
  assert.match(css, /bottom: calc\(var\(--ask-gap\) \+ var\(--ask-lift\)\)/)
})

test('对话窗保持已确认形态：无登录门、无常见问题、不显示模型名', () => {
  const widget = read('components', 'AskWidget.vue')

  assert.doesNotMatch(read('components', 'ask-widget.css'), /login-gate/)
  assert.doesNotMatch(widget, /常见问题/)
  assert.doesNotMatch(widget, /deepseek/i)
  assert.match(widget, /你好，我是顺仔/)
  assert.match(widget, /顺仔 · 用时/)
})

test('输入框随内容长高且不出现滚动条', () => {
  const widget = read('components', 'AskWidget.vue')

  assert.match(widget, /scrollHeight \+ 4/)
  assert.match(widget, /clientHeight \?\? 0\) \* 0\.6/)
  assert.match(read('components', 'ask-widget.css'), /\.composer textarea \{[^}]*overflow-y: hidden/)
})

test('答案只来自后端 /api/ask，前端不自行取数', () => {
  assert.match(read('api', 'client.ts'), /`\$\{API_ROOT\}\/ask`/)
  assert.doesNotMatch(read('components', 'AskWidget.vue'), /analytics\//)
})

test('移动端对话窗跟随可视视口，软键盘弹出时不遮挡输入框', () => {
  const css = read('components', 'ask-widget.css')
  const widget = read('components', 'AskWidget.vue')
  const mobile = css.match(/@media \(max-width: 820px\) \{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(mobile, /top: var\(--ask-vv-top, 0px\)/)
  assert.match(mobile, /height: var\(--ask-vv-height, 100dvh\)/)
  assert.match(widget, /function syncVisualViewport\(\): void/)
  assert.match(widget, /const height = viewport \? Math\.round\(viewport\.height\) : 0/)
  assert.match(widget, /node\.style\.setProperty\('--ask-vv-height', `\$\{height\}px`\)/)
  assert.match(widget, /node\.style\.setProperty\('--ask-vv-top', `\$\{Math\.max\(0, Math\.round\(viewport\.offsetTop\)\)\}px`\)/)
  // 可视视口不可用或高度非法时清掉变量，回落到整屏，避免对话窗塌成内容高度
  assert.match(widget, /!viewport \|\| !Number\.isFinite\(height\) \|\| height <= 0/)
  assert.match(widget, /node\.style\.removeProperty\('--ask-vv-height'\)/)
  assert.match(widget, /window\.visualViewport\?\.addEventListener\('resize', syncVisualViewport\)/)
  assert.match(widget, /window\.visualViewport\?\.removeEventListener\('resize', syncVisualViewport\)/)
})

test('移动端对话窗避让刘海与底部横条，且不会裁掉自己的输入区', () => {
  const css = read('components', 'ask-widget.css')
  const mobile = css.match(/@media \(max-width: 820px\) \{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(mobile, /\.ask-panel__head \{ padding-top: calc\(12px \+ env\(safe-area-inset-top, 0px\)\); \}/)
  assert.match(mobile, /\.ask-panel__foot \{ padding-bottom: calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\); \}/)
  // 消息区可收缩：面板高度不足时优先保留完整输入区，而不是被 overflow 裁掉
  assert.match(css, /\.ask-panel__scroll \{\s*flex: 1 1 auto; min-height: 0;/)
})

test('站内通知横幅不在顺仔对话窗打开时压住窗口', () => {
  const shell = read('AppShell.vue')

  assert.match(shell, /notificationBanner && !notificationPanelOpen && !askOpen/)
})

test('悬浮入口默认收起来，悬停 / 聚焦 / 打开对话窗时弹性展开名字', () => {
  const css = read('components', 'ask-widget.css')
  const widget = read('components', 'AskWidget.vue')

  // 名字标签收进按钮里，收起态宽度为 0，不占位也不挡内容。
  assert.match(widget, /<span class="ask-fab__label" aria-hidden="true">\{\{ open \? '收起' : '顺仔' \}\}<\/span>/)
  assert.match(css, /\.ask-fab \{[^}]*--ask-open: 0/)
  assert.match(css, /\.ask-fab__label \{[^}]*width: calc\(3\.9rem \* var\(--ask-open\)\)/)
  // 三处触发共用 --ask-open，收回与展开走同一条过渡。
  assert.match(css, /\.ask-fab\.is-open,\n\.ask-fab:focus-visible \{ --ask-open: 1; \}/)
  assert.match(css, /@media \(hover: hover\) \{\n  \.ask-fab:hover \{ --ask-open: 1; \}\n\}/)
  // 弹性曲线：回弹收尾，不是生硬闪现。
  assert.match(css, /--ask-ease: cubic-bezier\(\.34, 1\.42, \.64, 1\)/)
  // 收起态仍要能看清（触摸目标不小于 44px）且提示可点。
  assert.match(css, /opacity: calc\(\.\d+ \+ \.\d+ \* var\(--ask-open\)\)/)
  assert.match(css, /\.ask-fab__avatar::after/)
})
