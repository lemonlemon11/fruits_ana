import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import { currentUser, firstAllowedPath, restoreSession } from './auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/preview', component: () => import('./views/PublicPreviewView.vue'), meta: { publicPreview: true } },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', component: () => import('./views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/forgot-password', component: () => import('./views/ForgotPasswordView.vue'), meta: { guestOnly: true } },
    { path: '/overview', component: () => import('./views/OverviewView.vue'), meta: { requiresAuth: true, permission: 'overview:view' } },
    { path: '/settlements', component: () => import('./views/SettlementListView.vue'), meta: { requiresAuth: true, permission: 'settlement:list' } },
    { path: '/settlement-comparison', component: () => import('./views/SettlementComparisonView.vue'), meta: { requiresAuth: true, permission: 'settlement:comparison' } },
    { path: '/settlement-detail', component: () => import('./views/SettlementView.vue'), meta: { requiresAuth: true, permission: 'settlement:detail' } },
    { path: '/series-comparison', component: () => import('./views/SeriesComparisonView.vue'), meta: { requiresAuth: true, permission: 'series:comparison' } },
    { path: '/container-comparison', redirect: '/settlement-comparison' },
    { path: '/containers', redirect: '/settlement-detail' },
    { path: '/entry-hub', redirect: '/imports' },
    { path: '/imports', component: () => import('./views/ImportView.vue'), meta: { requiresAuth: true, permission: 'import:view' } },
    { path: '/import-review', component: () => import('./views/ImportReviewView.vue'), meta: { requiresAuth: true, modal: true, permission: 'import:view' } },
    { path: '/entry', component: () => import('./views/EntryView.vue'), meta: { requiresAuth: true, permission: 'entry:view' } },
  ],
})

router.beforeEach(async (to) => {
  try {
    await restoreSession()
  } catch {
    if (to.meta.requiresAuth) return { path: '/login', query: { redirect: to.fullPath } }
  }
  const user = currentUser.value
  if (to.meta.requiresAuth && !user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  const permissions = user?.permissions ?? []
  if (to.meta.guestOnly && user) {
    const fallback = firstAllowedPath(permissions)
    return fallback ? { path: fallback } : true
  }
  if (to.meta.permission && !permissions.includes(String(to.meta.permission))) {
    const fallback = firstAllowedPath(permissions)
    return fallback ? { path: fallback } : { path: '/login', query: { reason: 'no-access' } }
  }
  return true
})

function isStaleRouteChunkError(error: unknown): boolean {
  return error instanceof Error
    && /Failed to fetch dynamically imported module/i.test(error.message)
}

const ROUTE_RELOAD_PARAM = '_route_reload'
const ROUTE_RELOAD_MARKER = 'fruit-ana:route-chunk-reload'

router.onError((error, to) => {
  console.error('[router] navigation failed', error)
  if (!isStaleRouteChunkError(error)) return
  if (window.sessionStorage.getItem(ROUTE_RELOAD_MARKER)) return
  window.sessionStorage.setItem(ROUTE_RELOAD_MARKER, '1')
  const url = new URL(to.fullPath, window.location.origin)
  url.searchParams.set(ROUTE_RELOAD_PARAM, String(Date.now()))
  window.location.replace(url.toString())
})

router.afterEach(() => {
  window.sessionStorage.removeItem(ROUTE_RELOAD_MARKER)
})

createApp(AppShell).use(router).mount('#app')
