<script setup lang="ts">
import ArrowUp from '@lucide/vue/dist/esm/icons/arrow-up.mjs'
import Boxes from '@lucide/vue/dist/esm/icons/boxes.mjs'
import ChartColumn from '@lucide/vue/dist/esm/icons/chart-column.mjs'
import Clock3 from '@lucide/vue/dist/esm/icons/clock-3.mjs'
import GitCompareArrows from '@lucide/vue/dist/esm/icons/git-compare-arrows.mjs'
import LogOut from '@lucide/vue/dist/esm/icons/log-out.mjs'
import Menu from '@lucide/vue/dist/esm/icons/menu.mjs'
import PackageSearch from '@lucide/vue/dist/esm/icons/package-search.mjs'
import PanelLeftClose from '@lucide/vue/dist/esm/icons/panel-left-close.mjs'
import PanelLeftOpen from '@lucide/vue/dist/esm/icons/panel-left-open.mjs'
import Table2 from '@lucide/vue/dist/esm/icons/table-2.mjs'
import Upload from '@lucide/vue/dist/esm/icons/upload.mjs'
import X from '@lucide/vue/dist/esm/icons/x.mjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { logout as logoutRequest } from './api/client'
import { currentUser, setCurrentUser } from './auth'
import BrandMark from './components/BrandMark.vue'
import {
  HEADER_CLOCK_REFRESH_MS,
  SIDEBAR_STORAGE_KEY,
  formatHeaderClock,
  restoreSidebarCollapsed,
} from './utils/shellHeader'
import {
  TABS_STORAGE_KEY,
  closeOtherTabs,
  closeTab,
  isClosableTab,
  nextActivePath,
  openTab,
  restoreTabs,
  type ShellTab,
} from './utils/shellTabs'

const mobileNavOpen = ref(false)
const signingOut = ref(false)
const sidebarCollapsed = ref(readStoredSidebarState())
const clockNow = ref(new Date())
const showBackToTop = ref(false)
const route = useRoute()
const router = useRouter()
// 面向果农的主导航只保留三个大入口，其余功能收进「更多」，避免同名页面点错。
const primaryNavItems = [
  { path: '/overview', label: '卖得怎么样', icon: ChartColumn },
  { path: '/settlements', label: '每一单', icon: Table2 },
  { path: '/imports', label: '数据导入', icon: Upload },
]
const moreNavItems = [
  { path: '/settlement-detail', label: '结算单详情', icon: PackageSearch },
  { path: '/settlement-comparison', label: '结算单对比', icon: GitCompareArrows },
  { path: '/series-comparison', label: '系列对比', icon: Boxes },
]
const navItems = [...primaryNavItems, ...moreNavItems]
const moreNavActive = computed(() => moreNavItems.some((item) => route.path.startsWith(item.path)))
const authPage = computed(() => Boolean(route.meta.guestOnly || route.meta.publicPreview))
const currentNav = computed(() => navItemFor(route.path))
const activeTabPath = computed(() => currentNav.value.path)
// 页签栏记录本次会话打开过的页面，刷新后仍在（首页固定不可关闭）。
const openedTabs = ref<ShellTab[]>(readStoredTabs())
const openedTabItems = computed(() =>
  openedTabs.value.map((tab) => ({ tab, item: navItemFor(tab.path) })),
)
const userInitial = computed(() => currentUser.value?.displayName?.slice(0, 1) ?? '')
const headerClock = computed(() => formatHeaderClock(clockNow.value))
const tabsStrip = ref<HTMLElement | null>(null)
let clockTimer: number | undefined

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  clockTimer = window.setInterval(() => {
    clockNow.value = new Date()
  }, HEADER_CLOCK_REFRESH_MS)
  window.addEventListener('scroll', handleScroll, { passive: true })
})
watch(
  () => route.fullPath,
  () => {
    mobileNavOpen.value = false
    if (authPage.value) return
    openedTabs.value = openTab(openedTabs.value, activeTabPath.value, route.fullPath)
  },
  { immediate: true },
)
watch(openedTabs, persistTabs, { deep: true })
watch(activeTabPath, () => void scrollActiveTabIntoView())

function navItemFor(path: string) {
  return navItems.find((item) => path.startsWith(item.path)) ?? navItems[0]
}

/** 页签过多时把当前页签滚进可视区，避免激活项藏在横向滚动条外。 */
async function scrollActiveTabIntoView() {
  await nextTick()
  const strip = tabsStrip.value
  const active = strip?.querySelector<HTMLElement>('.app-tab.is-active')
  if (!strip || !active) return
  const stripRect = strip.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  if (activeRect.left < stripRect.left) strip.scrollLeft -= stripRect.left - activeRect.left
  else if (activeRect.right > stripRect.right) strip.scrollLeft += activeRect.right - stripRect.right
}

function isKnownPath(path: string): boolean {
  return navItems.some((item) => item.path === path)
}

function readStoredTabs(): ShellTab[] {
  try {
    const raw = window.sessionStorage.getItem(TABS_STORAGE_KEY)
    return restoreTabs(raw ? JSON.parse(raw) : null, isKnownPath)
  } catch {
    // 存储被禁用或内容损坏时退回只有首页的默认状态。
    return restoreTabs(null, isKnownPath)
  }
}

function persistTabs() {
  try {
    window.sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(openedTabs.value))
  } catch {
    // 隐私模式写入失败不影响页面使用。
  }
}

function readStoredSidebarState(): boolean {
  try {
    return restoreSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY))
  } catch {
    return false
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed.value))
  } catch {
    // 存储不可用时仍保留当前页面内的收起状态。
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') mobileNavOpen.value = false
}

function activateTab(tab: ShellTab) {
  mobileNavOpen.value = false
  if (route.fullPath !== tab.fullPath) void router.push(tab.fullPath)
}

function handleCloseTab(path: string) {
  if (!isClosableTab(path)) return
  const index = openedTabs.value.findIndex((tab) => tab.path === path)
  if (index < 0) return
  openedTabs.value = closeTab(openedTabs.value, path)
  if (activeTabPath.value === path) void router.push(nextActivePath(openedTabs.value, index))
}

function handleCloseOthers() {
  openedTabs.value = closeOtherTabs(openedTabs.value, activeTabPath.value)
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
    openedTabs.value = restoreTabs(null, isKnownPath)
    await router.replace('/login')
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('scroll', handleScroll)
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
})

function handleScroll() {
  showBackToTop.value = window.scrollY > 320
}

function scrollToTop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
}
</script>

<template>
  <RouterView v-if="authPage" />
  <template v-else>
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <header class="app-header">
        <div class="app-header-brand">
          <RouterLink class="app-header-home" to="/overview" title="返回销售总览" aria-label="返回销售总览">
            <BrandMark :size="34" />
          </RouterLink>
          <div class="app-header-copy">
            <strong>SLD-水果市场销售分析</strong>
            <span>{{ currentNav.label }}</span>
          </div>
          <button
            class="sidebar-toggle"
            type="button"
            aria-controls="primary-nav"
            :aria-expanded="!sidebarCollapsed"
            :aria-label="sidebarCollapsed ? '展开左侧导航' : '收起左侧导航'"
            :title="sidebarCollapsed ? '展开左侧导航' : '收起左侧导航'"
            @click="toggleSidebar"
          >
            <PanelLeftOpen v-if="sidebarCollapsed" :size="20" aria-hidden="true" />
            <PanelLeftClose v-else :size="20" aria-hidden="true" />
          </button>
        </div>
        <time
          class="app-header-clock"
          :datetime="headerClock.datetime"
          :title="`当前时间：${headerClock.date} ${headerClock.time}`"
        >
          <Clock3 :size="17" aria-hidden="true" />
          <span class="clock-date">{{ headerClock.date }}</span>
          <strong>{{ headerClock.time }}</strong>
        </time>
        <div class="app-header-account">
          <span class="account-avatar" aria-hidden="true">{{ userInitial }}</span>
          <span class="account-name">{{ currentUser?.displayName }}</span>
          <button class="sign-out-button" type="button" :disabled="signingOut" @click="signOut">
            <LogOut :size="18" aria-hidden="true" />
            <span>{{ signingOut ? '正在退出' : '退出登录' }}</span>
          </button>
        </div>
      </header>
      <div class="app-body">
        <aside class="app-sidebar" aria-label="主要导航">
          <nav id="primary-nav" aria-label="主要导航">
            <RouterLink v-for="item in primaryNavItems" :key="item.path" :to="item.path" :title="item.label" :aria-label="sidebarCollapsed ? item.label : undefined" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
              <component :is="item.icon" class="nav-icon" :size="20" :stroke-width="2" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </RouterLink>
            <p class="nav-group-label">更多功能</p>
            <RouterLink v-for="item in moreNavItems" :key="item.path" :to="item.path" :title="item.label" :aria-label="sidebarCollapsed ? item.label : undefined" class="nav-secondary" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
              <component :is="item.icon" class="nav-icon" :size="20" :stroke-width="2" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </nav>
          <p class="sidebar-foot"><strong>等级说明</strong><span>C果包含原始BC等级</span></p>
        </aside>
        <div class="app-workspace">
          <nav class="app-tabs" aria-label="已打开的页面">
            <div ref="tabsStrip" class="app-tabs-scroll" role="tablist">
              <span v-for="entry in openedTabItems" :key="entry.tab.path" class="app-tab" :class="{ 'is-active': entry.tab.path === activeTabPath }">
                <button
                  type="button"
                  role="tab"
                  class="app-tab-open"
                  :aria-selected="entry.tab.path === activeTabPath"
                  @click="activateTab(entry.tab)"
                >
                  <component :is="entry.item.icon" :size="16" aria-hidden="true" />
                  <span>{{ entry.item.label }}</span>
                </button>
                <button
                  v-if="isClosableTab(entry.tab.path)"
                  type="button"
                  class="app-tab-close"
                  :aria-label="`关闭 ${entry.item.label}`"
                  @click="handleCloseTab(entry.tab.path)"
                >
                  <X :size="15" aria-hidden="true" />
                </button>
              </span>
            </div>
            <button v-if="openedTabs.length > 1" type="button" class="app-tabs-action" @click="handleCloseOthers">关闭其他</button>
          </nav>
          <nav v-if="mobileNavOpen" id="mobile-nav" class="mobile-nav-panel" aria-label="更多功能">
            <RouterLink v-for="item in moreNavItems" :key="item.path" :to="item.path" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
              <component :is="item.icon" class="nav-icon" :size="20" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </nav>
          <main id="main-content" tabindex="-1">
            <RouterView />
          </main>
          <button
            v-show="showBackToTop"
            class="back-to-top"
            type="button"
            aria-label="回到页面顶部"
            @click="scrollToTop"
          >
            <ArrowUp :size="22" aria-hidden="true" />
            <span>回顶部</span>
          </button>
          <nav class="mobile-tabbar" aria-label="主要导航（移动端）">
            <RouterLink v-for="item in primaryNavItems" :key="item.path" :to="item.path" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
              <component :is="item.icon" :size="28" :stroke-width="2" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </RouterLink>
            <button
              class="mobile-tabbar-more"
              type="button"
              aria-controls="mobile-nav"
              :aria-expanded="mobileNavOpen"
              :class="{ 'is-active': moreNavActive }"
              @click="mobileNavOpen = !mobileNavOpen"
            >
              <Menu :size="28" aria-hidden="true" />
              <span>更多</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  </template>
</template>

<style src="./styles.css"></style>
<style src="./styles-shell.css"></style>
