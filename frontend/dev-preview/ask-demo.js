// 顺仔悬浮问答 Demo：点击右下角机器人按钮弹出对话窗，调用 /api/ask 取答案。
// 登录、会话与错误码都走业务端同一套接口，不在前端伪造数据。

const MAX_HISTORY = 6
const SCROLL_TRIGGER = 320

const state = { history: [], busy: false, open: false, greeted: false }

const els = {
  toTop: document.querySelector('#toTop'),
  fab: document.querySelector('#askFab'),
  fabAvatar: document.querySelector('#fabAvatar'),
  panel: document.querySelector('#askPanel'),
  close: document.querySelector('#askClose'),
  status: document.querySelector('#statusText'),
  gate: document.querySelector('#loginGate'),
  loginForm: document.querySelector('#loginForm'),
  loginName: document.querySelector('#loginName'),
  loginPass: document.querySelector('#loginPass'),
  loginError: document.querySelector('#loginError'),
  body: document.querySelector('#askBody'),
  log: document.querySelector('#chatLog'),
  foot: document.querySelector('#askFoot'),
  form: document.querySelector('#askForm'),
  input: document.querySelector('#askInput'),
  submit: document.querySelector('#askSubmit'),
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return { response, payload }
}

function errorText(response, payload) {
  if (payload && typeof payload.detail === 'string') return payload.detail
  if (response.status === 401) return '登录已过期，请刷新页面重新登录。'
  if (response.status === 503) return '后端没有配置大模型 Key，问答暂时不可用。'
  if (response.status === 502) return '这次没等到模型回答，请再问一次。'
  return `请求失败（${response.status}）`
}

// ---- 渲染 ----

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderAnswer(text) {
  const body = element('div', 'msg-body')
  const list = element('ul', 'answer-list')
  let hasList = false
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('- ') || line.startsWith('• ')) {
      list.append(element('li', null, line.slice(2).trim()))
      hasList = true
    } else {
      body.append(element('p', null, line))
    }
  }
  if (hasList) body.append(list)
  return body
}

function scrollToEnd() {
  els.body.scrollTop = els.body.scrollHeight
}

// kind: bot / user / pending / error；role 为空则不显示小标题。
function pushMessage(kind, role, body) {
  const article = element('article', `msg msg-${kind}`)
  const avatar = element('span', 'msg-avatar', kind === 'user' ? '我' : '顺')
  avatar.setAttribute('aria-hidden', 'true')
  const main = element('div', 'msg-main')
  if (role) main.append(element('p', 'msg-role', role))
  main.append(body)
  article.append(avatar, main)
  els.log.append(article)
  scrollToEnd()
  return article
}

function pushPending() {
  const body = element('div', 'msg-body')
  const text = element('p', null, '正在查数据…')
  body.append(text)
  return { article: pushMessage('pending', '顺仔', body), text }
}

function pushWelcome() {
  const body = element('div', 'msg-body')
  body.append(element('p', null, '你好，我是顺仔。结算单、等级、价格、销量都能问，'));
  body.append(element('p', null, '比如：「哪张单卖得最好？」「晴牌这个品牌卖得怎么样？」「这批货的采购成本是多少？」'));
  pushMessage('bot', '顺仔', body)
}

// ---- 悬浮窗开关 ----

function setOpen(open) {
  state.open = open
  els.panel.hidden = !open
  els.fab.classList.toggle('is-open', open)
  els.fab.setAttribute('aria-expanded', String(open))
  els.fab.setAttribute('aria-label', open ? '收起顺仔数据问答' : '打开顺仔数据问答')
  document.body.classList.toggle('is-ask-open', open)
  if (open) {
    els.input.focus()
    scrollToEnd()
  } else {
    els.fab.focus()
  }
}

function autoGrow() {
  els.input.style.height = 'auto'
  // 内容多时输入框自己长高，不出现内部滚动条；上限跟着对话窗高度走，
  // 避免输入区把消息区挤没（走的是面板高度，不会和消息区互相挤压）。
  // scrollHeight 不含上下边框且会向上取整，这里补 4px 余量，避免差一两像素时冒滚动条。
  const wanted = els.input.scrollHeight + 4
  const room = Math.max(96, els.panel.clientHeight * 0.6)
  els.input.style.height = `${Math.min(wanted, room)}px`
}

function syncControls() {
  // 与线上「回顶部」一致：滚动超过约 320px 才出现；对话窗打开时让位。
  els.toTop.hidden = state.open || window.scrollY <= SCROLL_TRIGGER
}

// ---- 问答 ----

function setBusy(busy) {
  state.busy = busy
  els.submit.disabled = busy
  els.submit.textContent = busy ? '查询中…' : '发送'
}

async function ask(question) {
  if (state.busy || !question.trim()) return
  setBusy(true)
  pushMessage('user', '', element('div', 'msg-body', question.trim()))
  const pending = pushPending()
  const startedAt = performance.now()

  const { response, payload } = await api('/api/ask', {
    method: 'POST',
    body: JSON.stringify({ question, history: state.history }),
  })

  pending.article.remove()
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1)

  if (!response.ok || !payload) {
    pushMessage('error', '顺仔', element('div', 'msg-body', errorText(response, payload)))
    setBusy(false)
    return
  }

  els.status.textContent = `用时 ${seconds}s`
  pushMessage('bot', `顺仔 · 用时 ${seconds}s`, renderAnswer(payload.answer))

  state.history.push({ role: 'user', content: question })
  state.history.push({ role: 'assistant', content: payload.answer })
  state.history = state.history.slice(-MAX_HISTORY)
  setBusy(false)
}

// ---- 事件 ----

els.fab.addEventListener('click', () => setOpen(!state.open))
els.close.addEventListener('click', () => setOpen(false))
els.toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
window.addEventListener('scroll', syncControls, { passive: true })
window.addEventListener('resize', syncControls)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.open) setOpen(false)
})

els.form.addEventListener('submit', (event) => {
  event.preventDefault()
  const question = els.input.value.trim()
  if (!question) return
  els.input.value = ''
  autoGrow()
  ask(question)
})

els.input.addEventListener('input', autoGrow)
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    els.form.requestSubmit()
  }
})

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  els.loginError.hidden = true
  const { response, payload } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      display_name: els.loginName.value.trim(),
      password: els.loginPass.value,
    }),
  })
  if (!response.ok) {
    els.loginError.textContent = errorText(response, payload)
    els.loginError.hidden = false
    return
  }
  await start()
})

async function start() {
  const { response } = await api('/api/auth/me')
  if (!response.ok) {
    els.gate.hidden = false
    els.body.hidden = true
    els.foot.hidden = true
    els.status.textContent = '未登录'
    return
  }
  els.gate.hidden = true
  els.body.hidden = false
  els.foot.hidden = false
  if (!state.greeted) {
    state.greeted = true
    pushWelcome()
  }
  els.status.textContent = '在线'
}

start()
syncControls()
