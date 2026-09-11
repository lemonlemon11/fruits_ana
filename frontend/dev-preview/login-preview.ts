import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import '../src/styles.css'
import '../src/styles-shell.css'
import LoginView from '../src/views/LoginView.vue'
import PublicPreviewView from '../src/views/PublicPreviewView.vue'
import RegisterView from '../src/views/RegisterView.vue'

// 视觉伴侣：登录页改版，可切换左侧主图方案。
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: LoginView },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
    { path: '/preview', component: PublicPreviewView },
  ],
})

const OPTIONS = [
  { key: 'a', label: '方案 A', note: '来源：什么值得买（国内）· 榴莲果肉特写 1200×1395' },
  { key: 'b', label: '方案 B', note: '来源：CGTN 中国国际电视台（国内）· 海南榴莲特写 1200×1395' },
  { key: 'c', label: '方案 C', note: '来源：MNN / Treehugger（国外）· 切开榴莲木桌 1400×1628（分辨率最高）' },
]

const App = defineComponent({
  setup() {
    const hero = ref('a')
    return () => {
      const current = OPTIONS.find((item) => item.key === hero.value)!
      return h('div', [
        h('div', { class: `hero-switch hero-${hero.value}` }, [h(LoginView)]),
        h('p', { class: 'hero-note' }, current.note),
        h('div', { class: 'hero-bar', role: 'group', 'aria-label': '主图方案切换' }, [
          h('strong', '左侧主图'),
          ...OPTIONS.map((item) =>
            h('button', {
              type: 'button',
              'aria-pressed': hero.value === item.key,
              onClick: () => { hero.value = item.key },
            }, item.label),
          ),
        ]),
      ])
    }
  },
})

createApp(App).use(router).mount('#app')
