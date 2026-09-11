import '../src/styles.css'
import '../src/styles-shell.css'
import './showcase.css'

// 设计呈现页：左侧说明 + 右侧原型（可切桌面 / 移动宽度）。
const NOTES: Array<[string, string]> = [
  ['顶部 header', '左侧是品牌，右侧显示当前登录用户的用户名与「退出登录」。原来放在侧边栏底部的账号区移到 header 右上角，视线固定、随时可退出。'],
  ['页签栏', '打开过的页面各留一个页签：点导航或链接首次进入时新增，重复进入只激活不新增。首页固定不可关闭，其余页签可单个关闭，也可以一键「关闭其他」。'],
  ['关闭后的落点', '关掉当前页签时自动跳到右边那个；右边没有就跳左边，不会出现「全部关掉后空白」的情况。'],
  ['移动端', 'header 收成一行（品牌 + 退出登录），用户名收进菜单；页签栏横向滚动；侧边导航沿用现有底部标签栏。'],
]

const root = document.querySelector('#app')
if (root) {
  root.innerHTML = `
    <main class="showcase shell-preview">
      <header class="showcase-head">
        <h1>系统外壳设计：header + 页签</h1>
        <p>2026-09-11 · 53002 端口 · 右侧是可交互原型，点导航会开页签，页签可以关</p>
      </header>
      <section class="showcase-card">
        <h2>设计要点</h2>
        <ul class="showcase-list">
          ${NOTES.map(([title, text]) => `<li><strong>${title}</strong><span>${text}</span></li>`).join('')}
        </ul>
      </section>
      <section class="showcase-card shell-preview-stage">
        <div class="shell-preview-bar">
          <strong>原型预览</strong>
          <span class="shell-preview-toggle" role="group" aria-label="预览宽度">
            <button type="button" data-width="desktop" aria-pressed="true">桌面</button>
            <button type="button" data-width="mobile" aria-pressed="false">移动</button>
          </span>
        </div>
        <div class="shell-preview-frame" data-mode="desktop">
          <iframe src="./shell-prototype.html" title="外壳原型"></iframe>
        </div>
      </section>
    </main>
  `

  const frame = root.querySelector<HTMLElement>('.shell-preview-frame')
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.shell-preview-toggle button'))
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.width === 'mobile' ? 'mobile' : 'desktop'
      frame?.setAttribute('data-mode', mode)
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    })
  })
}
