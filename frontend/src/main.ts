import { createApp, h } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'

const makePage = (title: string) => ({
  render: () => h('main', { class: 'page' }, [h('h1', title)]),
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', component: makePage('全局总览') },
    { path: '/containers', component: makePage('货柜诊断') },
    { path: '/imports', component: makePage('导入与数据质量') },
  ],
})

createApp({ render: () => h(RouterView) }).use(router).mount('#app')
