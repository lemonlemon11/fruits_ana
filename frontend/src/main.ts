import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import { currentUser, restoreSession } from './auth'
import ImportView from './views/ImportView.vue'
import LoginView from './views/LoginView.vue'
import OverviewView from './views/OverviewView.vue'
import PublicPreviewView from './views/PublicPreviewView.vue'
import RegisterView from './views/RegisterView.vue'
import SeriesComparisonView from './views/SeriesComparisonView.vue'
import SettlementComparisonView from './views/SettlementComparisonView.vue'
import SettlementListView from './views/SettlementListView.vue'
import SettlementView from './views/SettlementView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/preview', component: PublicPreviewView, meta: { publicPreview: true } },
    { path: '/login', component: LoginView, meta: { guestOnly: true } },
    { path: '/register', component: RegisterView, meta: { guestOnly: true } },
    { path: '/overview', component: OverviewView, meta: { requiresAuth: true } },
    { path: '/settlements', component: SettlementListView, meta: { requiresAuth: true } },
    { path: '/settlement-comparison', component: SettlementComparisonView, meta: { requiresAuth: true } },
    { path: '/settlement-detail', component: SettlementView, meta: { requiresAuth: true } },
    { path: '/series-comparison', component: SeriesComparisonView, meta: { requiresAuth: true } },
    { path: '/container-comparison', redirect: '/settlement-comparison' },
    { path: '/containers', redirect: '/settlement-detail' },
    { path: '/imports', component: ImportView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  try {
    await restoreSession()
  } catch {
    if (to.meta.requiresAuth) return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAuth && !currentUser.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && currentUser.value) return '/overview'
  return true
})

createApp(AppShell).use(router).mount('#app')
