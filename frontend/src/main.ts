import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import AppShell from './AppShell.vue'
import { currentUser, restoreSession } from './auth'
import ContainerComparisonView from './views/ContainerComparisonView.vue'
import ContainerView from './views/ContainerView.vue'
import ImportView from './views/ImportView.vue'
import LoginView from './views/LoginView.vue'
import OverviewView from './views/OverviewView.vue'
import PublicPreviewView from './views/PublicPreviewView.vue'
import RegisterView from './views/RegisterView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/preview' },
    { path: '/preview', component: PublicPreviewView, meta: { publicPreview: true } },
    { path: '/login', component: LoginView, meta: { guestOnly: true } },
    { path: '/register', component: RegisterView, meta: { guestOnly: true } },
    { path: '/overview', component: OverviewView, meta: { requiresAuth: true } },
    { path: '/container-comparison', component: ContainerComparisonView, meta: { requiresAuth: true } },
    { path: '/containers', component: ContainerView, meta: { requiresAuth: true } },
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
