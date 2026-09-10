<script setup lang="ts">
import { ChartColumn, GitCompareArrows, LogOut, Menu, PackageSearch, Table2, Upload, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { logout as logoutRequest } from './api/client'
import { currentUser, setCurrentUser } from './auth'

const mobileNavOpen = ref(false)
const signingOut = ref(false)
const route = useRoute()
const router = useRouter()
const navItems = [
  { path: '/overview', label: '销售总览', icon: ChartColumn },
  { path: '/settlements', label: '数据明细', icon: Table2 },
  { path: '/settlement-comparison', label: '结算单对比', icon: GitCompareArrows },
  { path: '/settlement-detail', label: '结算单详情', icon: PackageSearch },
  { path: '/imports', label: '数据导入', icon: Upload },
]
const authPage = computed(() => Boolean(route.meta.guestOnly || route.meta.publicPreview))
const currentNav = computed(() => navItems.find((item) => route.path.startsWith(item.path)) ?? navItems[0])

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})
watch(() => route.path, () => {
  mobileNavOpen.value = false
})

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') mobileNavOpen.value = false
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await logoutRequest()
  } catch {
    // 本地会话仍需清除，避免失效 Cookie 让用户停留在受保护页面。
  } finally {
    setCurrentUser(null)
    signingOut.value = false
    await router.replace('/login')
  }
}

onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown))
</script>

<template>
  <RouterView v-if="authPage" />
  <template v-else>
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div class="app-shell">
      <aside class="app-sidebar" aria-label="主要导航">
        <div class="brand-block">
          <span class="brand-mark" aria-hidden="true">果</span>
          <div class="brand-copy">
            <strong>果级经营台</strong>
            <small>水果销售分析</small>
          </div>
        </div>
        <nav id="primary-nav" aria-label="主要导航">
          <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :title="item.label" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
            <component :is="item.icon" class="nav-icon" :size="20" :stroke-width="2" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
        <div class="sidebar-bottom">
          <div class="account-summary"><strong>{{ currentUser?.displayName }}</strong><span>已登录</span></div>
          <button class="sign-out-button" type="button" :disabled="signingOut" @click="signOut">
            <LogOut :size="18" aria-hidden="true" />
            <span>{{ signingOut ? '正在退出' : '退出登录' }}</span>
          </button>
          <p class="sidebar-foot"><strong>等级说明</strong><span>C果包含原始BC等级</span></p>
        </div>
      </aside>
      <div class="app-workspace">
        <header class="mobile-brand" aria-label="移动端应用工具栏">
          <div class="mobile-brand-copy">
            <span class="brand-mark" aria-hidden="true">果</span>
            <div>
              <strong>果级经营台</strong>
              <span>{{ currentNav.label }}</span>
            </div>
          </div>
          <button
            class="mobile-menu-toggle"
            type="button"
            aria-controls="mobile-nav"
            :aria-expanded="mobileNavOpen"
            :aria-label="mobileNavOpen ? '关闭导航菜单' : '打开导航菜单'"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <X v-if="mobileNavOpen" :size="24" aria-hidden="true" />
            <Menu v-else :size="24" aria-hidden="true" />
          </button>
        </header>
        <nav v-if="mobileNavOpen" id="mobile-nav" class="mobile-nav-panel" aria-label="移动端主要导航">
          <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
            <component :is="item.icon" class="nav-icon" :size="20" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
          <div class="mobile-nav-account"><span>{{ currentUser?.displayName }}</span><button type="button" :disabled="signingOut" @click="signOut"><LogOut :size="18" aria-hidden="true" />退出登录</button></div>
        </nav>
        <main id="main-content" tabindex="-1">
          <RouterView />
        </main>
      </div>
    </div>
  </template>
</template>

<style src="./styles.css"></style>
<style src="./styles-shell.css"></style>
