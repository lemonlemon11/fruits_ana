import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import { currentUser, restoreSession } from './auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/preview', component: () => import('./views/PublicPreviewView.vue'), meta: { publicPreview: true } },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', component: () => import('./views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/overview', component: () => import('./views/OverviewView.vue'), meta: { requiresAuth: true } },
    { path: '/settlements', component: () => import('./views/SettlementListView.vue'), meta: { requiresAuth: true } },
    { path: '/settlement-comparison', component: () => import('./views/SettlementComparisonView.vue'), meta: { requiresAuth: true } },
    { path: '/settlement-detail', component: () => import('./views/SettlementView.vue'), meta: { requiresAuth: true } },
    { path: '/series-comparison', component: () => import('./views/SeriesComparisonView.vue'), meta: { requiresAuth: true } },
    { path: '/container-comparison', redirect: '/settlement-comparison' },
    { path: '/containers', redirect: '/settlement-detail' },
    { path: '/entry-hub', redirect: '/imports' },
    { path: '/imports', component: () => import('./views/ImportView.vue'), meta: { requiresAuth: true } },
    { path: '/import-review', component: () => import('./views/ImportReviewView.vue'), meta: { requiresAuth: true, modal: true } },
    { path: '/entry', component: () => import('./views/EntryView.vue'), meta: { requiresAuth: true, permission: 'entry:view' } },
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
  if (to.meta.permission && !currentUser.value?.permissions.includes(String(to.meta.permission))) {
    return '/overview'
  }
  return true
})

createApp(AppShell).use(router).mount('#app')
