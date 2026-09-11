import '../src/styles.css'
import '../src/styles-shell.css'
import './showcase.css'

const PAGES: Array<[string, string, string]> = [
  ['系统外壳设计（header + 页签）', 'shell-preview.html', '顶部 header 显示用户名与退出登录，页签记录已打开的页面'],
  ['本轮改动呈现（推荐先看）', 'review-2026-09-11.html', 'AI 结论醒目化 + 抽屉式结算单选择器'],
  ['系列对比真实页面', 'grade-preview.html', '真实组件 + 真实结算单数据，含按系列 / 按等级号别两个视图'],
  ['等级细分设计稿', 'grade-detail-design.html', '等级细分（号别）视图的静态设计稿'],
]

const root = document.querySelector('#app')
if (root) {
  root.innerHTML = `
    <main class="showcase">
      <header class="showcase-head">
        <h1>视觉伴侣 · 预览索引</h1>
        <p>端口 53001 · 全部页面使用真实组件；标「真实数据」的页面来自线上结算单</p>
      </header>
      <ul class="showcase-links">
        ${PAGES.map(
          ([title, href, note]) =>
            `<li><a href="./${href}"><strong>${title}</strong><span>${note}</span></a></li>`,
        ).join('')}
      </ul>
    </main>
  `
}
