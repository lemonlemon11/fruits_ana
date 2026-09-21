import '../src/styles.css'
import '../src/styles-shell.css'
import './showcase.css'

const PAGES: Array<[string, string, string]> = [
  ['顺仔 · 悬浮问答机器人（Demo）', 'ask-demo.html', '右下角悬浮机器人「顺仔」，点开是微信式悬浮对话窗；答案里的数字来自与看板同一批分析函数'],
  ['系统外壳设计（header + 页签）', 'shell-preview.html', '顶部 header 显示用户名与退出登录，页签记录已打开的页面'],
  ['手工录单界面交互稿', 'entry-design.html', '基本信息、销售/售后/费用动态行、自动计算与冲突覆盖交互'],
  ['本轮改动呈现（推荐先看）', 'review-2026-09-11.html', 'AI 结论醒目化 + 抽屉式结算单选择器'],
  ['2026-09-14 优化预览', '20260914-optimization-preview.html', '平均每公斤售价、等级 A-F + 其他、日期全展示、取消价差/价比'],
  ['系列对比真实页面', 'grade-preview.html', '真实组件 + 真实结算单数据，含按系列 / 按等级号别两个视图'],
  ['等级细分设计稿', 'grade-detail-design.html', '等级细分（号别）视图的静态设计稿'],
  ['结算单详情页设计测试', 'settlement-detail-taste.html', '用 taste skill 重新组织的结算单详情页测试稿，数据为 mock 示例'],
  ['结算单详情改造预览', 'settlement-detail-facts.html', '基础信息条、规格级占比/总件数/均价，移除整单均价与销售金额排名'],
  ['卖得怎么样等级图表预览', 'overview-grade-breakdown.html', '复用结算单详情三个等级图表，全部结算单也展示规格聚合'],
  ['等级图表 · 紧凑版', 'grade-breakdown-compact.html', '饼图与均价横条并排，规格件数表全宽展开，桌面一屏看完三张图'],
  ['手机版改版设计稿（2026-09-20）', 'mobile-20260920/index.html', '8 个页面的手机端改版截图与设计规范，取自 53000 真实前端 390×844 视口'],
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
