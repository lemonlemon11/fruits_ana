const NOTES = {
  A: '方案 A：菜单只留一项「录单 / 导入」，进页面用顶部两段式切换「文件导入 / 手工录单」。切换不新建页签，URL 带 ?mode=manual。',
  B: '方案 B：菜单保留一项但带二级，「录单 / 导入」展开出「文件导入」「手工录单」两个子项。页面本身不加切换条，两个页面各自独立。',
  C: '方案 C：菜单进一个「选择录入方式」页，两张卡片分别进文件导入与手工录单，同时展示最近导入和未完成的手工单。',
}

const state = { plan: 'A', device: 'desktop', mode: 'import', draft: true }

const stage = document.querySelector('#stage')
const planNote = document.querySelector('#planNote')

const NAV_PRIMARY = [
  ['卖得怎么样', false],
  ['每一单', false],
]
const NAV_MORE = ['结算单详情', '结算单对比', '品牌对比']

function sideItem(label, active, extra = '') {
  return `<button type="button" class="side-item ${active ? 'is-active' : ''} ${extra}">${label}</button>`
}

function renderSide() {
  const { plan } = state
  const merged = plan === 'B'
    ? `
      ${sideItem('录单 / 导入', true)}
      ${sideItem('文件导入', true, 'is-sub')}
      ${sideItem('手工录单', false, 'is-sub')}`
    : sideItem('录单 / 导入', true, 'is-new')

  return `
    <aside class="side">
      <div class="side-brand"><span></span>SLD 水果销售</div>
      <div class="side-group">${NAV_PRIMARY.map(([label, active]) => sideItem(label, active)).join('')}${merged}</div>
      <div class="side-group"><div class="side-title">更多</div>${NAV_MORE.map((label) => sideItem(label, false)).join('')}</div>
    </aside>`
}

function importPane(compact) {
  const batches = [
    ['宝贝-001 结算单', '2026-09-15 09:20', '成功 42 行', 'ok', '成功'],
    ['宝贝-004 结算单', '2026-09-14 18:02', '2 行需要核对', 'warn', '需关注'],
    ['江南-018 结算单', '2026-09-13 11:47', '文件表头无法识别', 'bad', '失败'],
  ]
  return `
    <section class="card">
      <div class="card-head"><div><h3>选择结算单</h3><p>可以一次选择或拖入多个文件，系统会记录导入结果。</p></div></div>
      <div class="dropzone">
        <strong>把结算单拖到这里</strong>
        <span>支持 .xlsx / .csv，单个文件不超过 20 MB</span>
        <button type="button" class="btn btn-primary">选择结算单</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>数据质量概览</h3></div>
      <div class="summary-row">
        <div><span>累计批次</span><strong>12</strong></div>
        <div><span>需关注批次</span><strong class="warn">1</strong></div>
        <div><span>失败批次</span><strong class="bad">1</strong></div>
      </div>
    </section>
    ${compact ? '' : `
    <section class="card">
      <div class="card-head"><div><h3>导入记录和问题</h3><p>只在需要时展开问题明细</p></div><button type="button" class="btn-link">重新加载</button></div>
      ${batches.map(([name, time, note, kind, label]) => `
        <div class="batch"><div><strong>${name}</strong><small>${time} · ${note}</small></div><span class="pill ${kind}">${label}</span></div>`).join('')}
      <button type="button" class="btn-link">导入完成后也可以手工补录一单 →</button>
    </section>`}`
}

function manualPane(compact) {
  const rows = [
    ['2026-09-13', 'A', '4', '10', '40', '22.50', '900.00', '金枕'],
    ['2026-09-13', 'B', '3', '9', '27', '18.00', '486.00', ''],
  ]
  const table = `
    <table class="mini-table">
      <thead><tr><th>销售日期</th><th>品种</th><th>规格（头数）</th><th>规格（KG）</th><th>销售数量</th><th>单价</th><th>金额</th><th>备注</th></tr></thead>
      <tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
  return `
    <section class="card">
      <div class="card-head"><div><h3>基本信息</h3><p>带 * 为必填项</p></div><span class="badge">未保存</span></div>
      <div class="form-grid">
        <label>商号 <input value="637" /></label>
        <label>柜号 <input value="CBHU2970762" /></label>
        <label>单号 <input value="宝贝-001" /></label>
        <label>转运公司 <input value="桂ABW631" /></label>
        <label>市场 <select><option>海吉星2</option><option>江南市场</option></select></label>
        <label>到达市场日期 <input type="date" value="2026-09-13" /></label>
        <label>来货数量（件） <input type="number" value="120" /></label>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><div><h3>销售明细</h3><p>销售数量为录入数字，金额 = 销售数量 × 单价</p></div><button type="button" class="btn-link">+ 添加销售行</button></div>
      ${compact ? '<p>手机端每行是一张可展开的小卡片，点开后在底部浮层里填。</p>' : table}
      <div class="totals"><span>总件数 <strong>67</strong> <em class="diff">差异 +53 件</em></span><span>销售金额 <strong>1386.00</strong></span></div>
    </section>
    <section class="card">
      <div class="card-head"><h3>售后 / 支出费用</h3><button type="button" class="btn-link">+ 添加售后行</button></div>
      <p>售后填正数按减项计算；固定六项费用 + 可添加其他费用。</p>
      <div class="totals"><span>售后合计 <strong>120.00</strong></span><span>费用合计 <strong>110.00</strong></span><span>应付贵方总金额(RMB) <strong>1156.00</strong></span></div>
    </section>`
}

function hubPane() {
  return `
    <section class="card">
      <div class="card-head"><div><h3>选择录入方式</h3><p>两种方式都会保留，按手上有多少数据和什么形式挑一种。</p></div></div>
      <div class="pick-cards">
        <button type="button" class="pick-card">
          <h3>文件导入</h3>
          <p>批发市场给的结算单表格，批量上传，自动生成结算单与明细。</p>
          <span class="go">上传文件 →</span>
        </button>
        <button type="button" class="pick-card">
          <h3>手工录单</h3>
          <p>没有表格或需要现场补录时，按模板一项项填，保存后生成结算单。</p>
          <span class="go">开始录单 →</span>
        </button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>最近导入</h3><button type="button" class="btn-link">查看全部</button></div>
      <div class="batch"><div><strong>宝贝-001 结算单</strong><small>2026-09-15 09:20 · 成功 42 行</small></div><span class="pill ok">成功</span></div>
      <div class="batch"><div><strong>宝贝-004 结算单</strong><small>2026-09-14 18:02 · 2 行需要核对</small></div><span class="pill warn">需关注</span></div>
    </section>
    <section class="card">
      <div class="card-head"><div><h3>未完成的手工单</h3><p>填到一半切走的单子会留在这里，接着填就行。</p></div></div>
      <div class="batch"><div><strong>商号 637</strong><small>宝贝-001 · 2 行明细 · 最后编辑 10 分钟前</small></div><button type="button" class="btn btn-ghost">继续录单</button></div>
    </section>`
}

const SEGMENTS = `
  <div class="segmented-bar">
    <div class="segmented" role="tablist" aria-label="录入方式">
      <button type="button" role="tab" data-mode="import" aria-selected="${state.mode === 'import'}">文件导入</button>
      <button type="button" role="tab" data-mode="manual" aria-selected="${state.mode === 'manual'}">手工录单 <em>草稿</em></button>
    </div>
    <small>${state.mode === 'import' ? '批量上传批发市场的结算单表格' : '没有表格时按模板一项项录入'}</small>
  </div>`

function draftBanner() {
  if (state.mode !== 'import' || state.plan === 'B') return ''
  return `<div class="draft-banner"><b>手工录单有未保存内容</b><span>商号 637 · 宝贝-001 · 2 行明细已保留，切回「手工录单」可以接着填。</span></div>`
}

function pane() {
  if (state.plan === 'C') return hubPane()
  if (state.mode === 'manual') return manualPane(state.device === 'mobile')
  return importPane(state.device === 'mobile')
}

function pageBody() {
  const title = state.plan === 'C' ? '录单 / 导入' : '录单 / 导入'
  const subtitle = state.plan === 'C'
    ? '先挑一种录入方式，也可以从这里接着填没做完的手工单。'
    : '两种方式都可以：文件导入负责批量表格，手工录单负责没有表格的单子。'
  return `
    <div class="page-title">
      <div><h2>${title}</h2><p>${subtitle}</p></div>
      <span class="badge ${state.plan === 'A' ? 'is-primary' : ''}">${state.plan === 'A' ? '一个菜单两个方式' : '入口整合稿'}</span>
    </div>
    ${state.plan === 'C' ? '' : SEGMENTS}
    ${state.mode === 'manual' && state.plan !== 'B' ? draftBanner() : ''}
    ${pane()}`
}

function mobileTabs() {
  const items = state.plan === 'B'
    ? [['卖得怎么样', false], ['每一单', false]]
    : [['卖得怎么样', false], ['每一单', false], ['录单 / 导入', true]]
  return `${items.map(([label, active]) => `<button type="button" class="m-tab ${active ? 'is-active' : ''}">${label}</button>`).join('')}
    <button type="button" class="m-tab ${state.plan === 'B' ? 'is-active' : ''}">更多</button>`
}

function morePanel() {
  if (state.plan !== 'B') return ''
  return `
    <div class="m-more-panel">
      <strong>录单 / 导入</strong>
      <div class="m-more-row"><span>文件导入</span><span>手工录单</span></div>
      <strong style="margin-top:10px">其它页面</strong>
      <div class="m-more-row"><span>结算单详情</span><span>结算单对比</span><span>品牌对比</span></div>
    </div>`
}

function render() {
  planNote.textContent = NOTES[state.plan]
  if (state.device === 'desktop') {
    stage.innerHTML = `
      <div class="shell-desktop">
        ${renderSide()}
        <div class="main-col">
          <div class="topbar"><span>首页 / 录单 · 导入</span><span>test · 退出登录</span></div>
          <div class="tabbar"><span class="tab is-active">录单 / 导入</span><span class="tab">每一单</span></div>
          <div class="page-body">${pageBody()}</div>
        </div>
      </div>`
  } else {
    stage.innerHTML = `
      <div class="shell-mobile">
        <div class="m-topbar"><span>SLD 水果销售</span><span>test</span></div>
        <div class="m-body">${pageBody()}</div>
        ${morePanel()}
        <div class="m-tabbar">${mobileTabs()}</div>
      </div>`
  }
  stage.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode
      state.draft = true
      render()
    })
  })
}

document.querySelectorAll('[data-plan]').forEach((button) => {
  button.addEventListener('click', () => {
    state.plan = button.dataset.plan
    state.mode = state.plan === 'C' ? 'import' : state.mode
    document.querySelectorAll('[data-plan]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    render()
  })
})

document.querySelectorAll('[data-device]').forEach((button) => {
  button.addEventListener('click', () => {
    state.device = button.dataset.device
    stage.dataset.device = state.device
    document.querySelectorAll('[data-device]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    render()
  })
})

render()
