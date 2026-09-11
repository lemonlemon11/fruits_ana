import { createApp, h } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'

import '../src/styles.css'
import '../src/styles-shell.css'
import SeriesComparisonView from '../src/views/SeriesComparisonView.vue'
import fixture from './fixture.json'

// 视觉伴侣预览：用真实结算单数据 + 假 AI 返回，验证「系列对比 / 按等级号别」两个视图。
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })

const AI_PLACEHOLDER = [
  '这批货的等级结构',
  '- 本次共 3 821 件，平均每件 433.01 元。',
  '哪个号最值钱',
  '- A6 平均每件 530.28 元，是这批货里最贵的。',
  '哪个号在拖后腿',
  '- B5 平均每件 381.13 元。',
  '可以留意的地方',
  '- 只有 4 张结算单，先看这批货，不下趋势结论。',
].join('\n')

const seriesPlaceholder = ['整体行情', '- 预览占位结论，仅用于布局检查。'].join('\n')

const nativeFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // 分析类接口要排在基础接口之前判断，否则会被前缀匹配吃掉。
  if (url.includes('/api/analytics/grade-detail/analysis')) {
    return Promise.resolve(json({ content: AI_PLACEHOLDER, model: 'preview', generated_at: new Date().toISOString(), cached: false }))
  }
  if (url.includes('/api/analytics/series-comparison/analysis')) {
    return Promise.resolve(json({ content: seriesPlaceholder, model: 'preview', generated_at: new Date().toISOString(), cached: false }))
  }
  if (url.includes('/api/settlements')) return Promise.resolve(json(fixture.settlements))
  if (url.includes('/api/analytics/series-comparison')) return Promise.resolve(json(fixture.comparison))
  return nativeFetch(input, init)
}

// 真实页面用到了 useRoute / useRouter，预览宿主也要装上路由，否则注入会报错。
const router = createRouter({
  // 用 hash 路由，预览时也能看到地址栏里的 selected 参数变化。
  history: createWebHashHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
})

const App = { render: () => h('div', { class: 'app-workspace' }, [h('main', [h(SeriesComparisonView)])]) }
const app = createApp(App).use(router)
router.isReady().then(() => app.mount('#app'))
