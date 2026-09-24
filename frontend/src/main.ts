import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import { ApiError } from './api/client'
import { currentUser, firstAllowedPath, restoreSession, setCurrentUser } from './auth'
import {
  AUTH_EXPIRED_EVENT,
  FATAL_ERROR_EVENT,
  createFatalErrorState,
  readFatalError,
  reportFatalError,
  saveFatalError,
  type FatalErrorState,
} from './utils/errorRecovery'
import {
  reportNavigationEnd,
  reportNavigationStart,
} from './utils/navigationFeedback'
import { createRouteChunkRecovery } from './utils/routeChunkRecovery'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/preview', component: () => import('./views/PublicPreviewView.vue'), meta: { publicPreview: true } },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', component: () => import('./views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/forgot-password', component: () => import('./views/ForgotPasswordView.vue'), meta: { guestOnly: true } },
    { path: '/error', component: () => import('./views/ErrorView.vue'), meta: { errorPage: true } },
    { path: '/welcome', component: () => import('./views/WelcomeView.vue'), meta: { requiresAuth: true } },
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
    {
      path: '/:pathMatch(.*)*',
      redirect: (to) => {
        saveFatalError(createFatalErrorState({
          kind: 'not-found',
          from: to.fullPath,
          status: 404,
          source: 'navigation',
        }))
        return { path: '/error', replace: true }
      },
    },
  ],
})

const routeChunkRecovery = createRouteChunkRecovery({
  storage: window.sessionStorage,
  origin: window.location.origin,
  replace: (url) => window.location.replace(url),
})
let navigationTargetPath = window.location.pathname + window.location.search

router.beforeEach(async (to) => {
  navigationTargetPath = to.fullPath
  reportNavigationStart(to.fullPath)
  if (to.meta.errorPage) return true
  try {
    await restoreSession()
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (!readFatalError()) {
      reportFatalError({
        kind: error instanceof ApiError && error.kind ? error.kind : 'server',
        from: to.fullPath,
        status: error instanceof ApiError ? error.status : null,
        requestId: error instanceof ApiError ? error.requestId : null,
        source: 'auth',
      })
    }
    return { path: '/error', replace: true }
  }
  const user = currentUser.value
  if (to.meta.requiresAuth && !user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  const permissions = user?.permissions ?? []
  if (to.meta.guestOnly && user) {
    const fallback = firstAllowedPath(permissions, user.menus)
    return { path: fallback ?? '/welcome' }
  }
  if (to.meta.permission && !permissions.includes(String(to.meta.permission))) {
    saveFatalError(createFatalErrorState({
      kind: 'forbidden',
      from: to.fullPath,
      status: 403,
      source: 'auth',
    }))
    return { path: '/error', replace: true }
  }
  return true
})

function reportRouteFailure(path: string): void {
  reportFatalError({
    kind: 'route',
    from: path,
    status: null,
    source: 'router',
  })
}

router.onError((error, to) => {
  if (to.fullPath === navigationTargetPath) reportNavigationEnd()
  console.error('[router] navigation failed', error)
  if (to.path === '/error') {
    window.location.replace('/error-static.html')
    return
  }
  const recovery = routeChunkRecovery.handle(error, to.fullPath)
  if (recovery === 'reload' || recovery === 'pending') return
  reportRouteFailure(to.fullPath)
})

router.afterEach((to, _from, failure) => {
  if (to.fullPath === navigationTargetPath) reportNavigationEnd()
  if (!failure && to.path !== '/error') routeChunkRecovery.clear()
})

window.addEventListener('vite:preloadError', (event) => {
  const preloadEvent = event as Event & { payload?: unknown }
  const error = preloadEvent.payload ?? new Error('Unable to preload CSS for route asset')
  const targetPath = navigationTargetPath || router.currentRoute.value.fullPath
  if (targetPath.startsWith('/error')) {
    event.preventDefault()
    window.location.replace('/error-static.html')
    return
  }
  const recovery = routeChunkRecovery.handle(error, targetPath)
  if (recovery === 'ignored') return
  event.preventDefault()
  reportNavigationEnd()
  if (recovery === 'exhausted') reportRouteFailure(targetPath)
})

function handleFatalErrorEvent(event: Event): void {
  const state = (event as CustomEvent<FatalErrorState>).detail
  if (!state || router.currentRoute.value.path === '/error') return
  void router.replace('/error')
}

function handleAuthExpired(): void {
  setCurrentUser(null)
  if (router.currentRoute.value.path === '/login') return
  const redirect = router.currentRoute.value.fullPath
  void router.replace({ path: '/login', query: { reason: 'session-expired', redirect } })
}

function handleRuntimeFailure(): void {
  if (router.currentRoute.value.path === '/error') return
  reportFatalError({
    kind: 'runtime',
    from: router.currentRoute.value.fullPath,
    status: null,
    source: 'runtime',
  })
}

window.addEventListener(FATAL_ERROR_EVENT, handleFatalErrorEvent)
window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
window.addEventListener('error', (event) => {
  if (event instanceof ErrorEvent && event.error) handleRuntimeFailure()
})
window.addEventListener('unhandledrejection', () => handleRuntimeFailure())

const app = createApp(AppShell)
app.config.errorHandler = () => handleRuntimeFailure()
app.use(router).mount('#app')
