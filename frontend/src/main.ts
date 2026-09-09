import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import ContainerComparisonView from './views/ContainerComparisonView.vue'
import ContainerView from './views/ContainerView.vue'
import ImportView from './views/ImportView.vue'
import OverviewView from './views/OverviewView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', component: OverviewView },
    { path: '/container-comparison', component: ContainerComparisonView },
    { path: '/containers', component: ContainerView },
    { path: '/imports', component: ImportView },
  ],
})

createApp(AppShell).use(router).mount('#app')
