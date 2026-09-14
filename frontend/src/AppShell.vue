<script setup lang="ts">
import ArrowUp from '@lucide/vue/dist/esm/icons/arrow-up.mjs'
import Bell from '@lucide/vue/dist/esm/icons/bell.mjs'
import BellRing from '@lucide/vue/dist/esm/icons/bell-ring.mjs'
import Boxes from '@lucide/vue/dist/esm/icons/boxes.mjs'
import ChartColumn from '@lucide/vue/dist/esm/icons/chart-column.mjs'
import Clock3 from '@lucide/vue/dist/esm/icons/clock-3.mjs'
import GitCompareArrows from '@lucide/vue/dist/esm/icons/git-compare-arrows.mjs'
import LogOut from '@lucide/vue/dist/esm/icons/log-out.mjs'
import Menu from '@lucide/vue/dist/esm/icons/menu.mjs'
import PackageSearch from '@lucide/vue/dist/esm/icons/package-search.mjs'
import PanelLeftClose from '@lucide/vue/dist/esm/icons/panel-left-close.mjs'
import PanelLeftOpen from '@lucide/vue/dist/esm/icons/panel-left-open.mjs'
import PanelRightClose from '@lucide/vue/dist/esm/icons/panel-right-close.mjs'
import RefreshCw from '@lucide/vue/dist/esm/icons/refresh-cw.mjs'
import SquareX from '@lucide/vue/dist/esm/icons/square-x.mjs'
import Table2 from '@lucide/vue/dist/esm/icons/table-2.mjs'
import Type from '@lucide/vue/dist/esm/icons/type.mjs'
import Upload from '@lucide/vue/dist/esm/icons/upload.mjs'
import X from '@lucide/vue/dist/esm/icons/x.mjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import {
  getNotifications,
  logout as logoutRequest,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from './api/client'
import { currentUser, setCurrentUser } from './auth'
import BrandMark from './components/BrandMark.vue'
import {
  FONT_SIZE_OPTIONS,
  FONT_SIZE_STORAGE_KEY,
  HEADER_CLOCK_REFRESH_MS,
  SIDEBAR_STORAGE_KEY,
  fontScaleFor,
  formatHeaderClock,
  restoreFontSize,
  restoreSidebarCollapsed,
  type FontSizePreference,
} from './utils/shellHeader'
import {
  HOME_TAB_PATH,
  TABS_STORAGE_KEY,
  closeOtherTabs,
  closeTab,
  isClosableTab,
  nextActivePath,
  openTab,
  restoreTabs,
  type ShellTab,
} from './utils/shellTabs'
import { notificationPlainText, sanitizeNotificationHtml } from './utils/notificationHtml'

const mobileNavOpen = ref(false)
const signingOut = ref(false)
const notifications = ref<AppNotification[]>([])
const unreadNotificationCount = ref(0)
const notificationPanelOpen = ref(false)
const notificationPanel = ref<HTMLElement | null>(null)
const notificationBanner = ref<AppNotification | null>(null)
const notificationDetail = ref<AppNotification | null>(null)
const sidebarCollapsed = ref(readStoredSidebarState())
const clockNow = ref(new Date())
const showBackToTop = ref(false)
const fontSize = ref(readStoredFontSize())
const fontSizePanelOpen = ref(false)
const fontSizePanel = ref<HTMLElement | null>(null)
const fontSizeOption = computed(
  () => FONT_SIZE_OPTIONS.find((option) => option.value === fontSize.value) ?? FONT_SIZE_OPTIONS[0],
)
const fontSizeIndex = computed<number>({
  get: () => Math.max(0, FONT_SIZE_OPTIONS.findIndex((option) => option.value === fontSize.value)),
  set: (value) => {
    fontSize.value = FONT_SIZE_OPTIONS[Math.max(0, Math.min(FONT_SIZE_OPTIONS.length - 1, value))].value
  },
})
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
  { path: '/series-comparison', label: '品牌对比', icon: Boxes },
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
const tabContextMenu = ref<{ x: number; y: number; path: string } | null>(null)
const tabContextMenuRef = ref<HTMLElement | null>(null)
const tabContextMenuStyle = computed(() => {
  if (!tabContextMenu.value) return {}
  const menuWidth = 168
  const menuHeight = 184
  const left = Math.min(Math.max(8, tabContextMenu.value.x), window.innerWidth - menuWidth - 12)
  const top = Math.min(Math.max(8, tabContextMenu.value.y), window.innerHeight - menuHeight - 12)
  return { left: `${left}px`, top: `${top}px` }
})
const tabsStrip = ref<HTMLElement | null>(null)
const viewKey = ref(0)
let clockTimer: number | undefined
let notificationTimer: number | undefined
let notificationReminderTimer: number | undefined

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  clockTimer = window.setInterval(() => {
    clockNow.value = new Date()
  }, HEADER_CLOCK_REFRESH_MS)
  void loadNotifications()
  notificationTimer = window.setInterval(loadNotifications, 60_000)
  notificationReminderTimer = window.setInterval(() => {
    if (unreadNotificationCount.value > 0 && !notificationPanelOpen.value) showNotificationBanner()
  }, 30 * 60 * 1000)
  window.addEventListener('scroll', handleScroll, { passive: true })
})
watch(
  () => route.fullPath,
  () => {
    mobileNavOpen.value = false
    fontSizePanelOpen.value = false
    tabContextMenu.value = null
    if (authPage.value) return
    openedTabs.value = openTab(openedTabs.value, activeTabPath.value, route.fullPath)
  },
  { immediate: true },
)

function showNotificationBanner() {
  if (notificationPanelOpen.value || notificationDetail.value) return
  const unread =
    notifications.value.find((item) => !item.is_read && item.priority === 'urgent') ??
    notifications.value.find((item) => !item.is_read && item.priority === 'important') ??
    notifications.value.find((item) => !item.is_read) ??
    null
  if (!unread) return
  notificationBanner.value = unread
}

async function loadNotifications() {
  try {
    const data = await getNotifications(12)
    const previousCount = unreadNotificationCount.value
    notifications.value = data.items
    unreadNotificationCount.value = data.unread_count
    if (data.unread_count > previousCount && data.unread_count > 0) showNotificationBanner()
  } catch {
    // 登录态失效或后端暂不可用时静默忽略，避免 header 反复报错。
  }
}

function toggleNotificationPanel() {
  notificationPanelOpen.value = !notificationPanelOpen.value
  if (notificationPanelOpen.value) {
    notificationBanner.value = null
    void loadNotifications()
  }
}

async function markRead(notification: AppNotification) {
  if (notification.is_read) return
  try {
    const updated = await markNotificationRead(notification.id)
    const target = notifications.value.find((item) => item.id === notification.id)
    if (target) {
      target.is_read = updated.is_read
      target.read_at = updated.read_at
    }
    unreadNotificationCount.value = Math.max(0, unreadNotificationCount.value - 1)
  } catch {
    // 网络异常时保留未读状态，用户可稍后重试。
  }
}

async function markAllRead() {
  try {
    await markAllNotificationsRead()
    notifications.value.forEach((item) => {
      item.is_read = true
    })
    unreadNotificationCount.value = 0
  } catch {
    // 保持现有未读状态。
  }
}

function openNotification(notification: AppNotification) {
  notificationDetail.value = notification
  notificationPanelOpen.value = false
  notificationBanner.value = null
  void markRead(notification)
}

function closeNotificationDetail() {
  notificationDetail.value = null
}
watch(openedTabs, persistTabs, { deep: true })
watch(activeTabPath, () => void scrollActiveTabIntoView())
watch(
  fontSize,
  (value) => {
    applyFontScale(value)
    persistFontSize(value)
  },
  { immediate: true },
)

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

function readStoredFontSize(): FontSizePreference {
  try {
    return restoreFontSize(window.localStorage.getItem(FONT_SIZE_STORAGE_KEY))
  } catch {
    return 'small'
  }
}

function applyFontScale(value: FontSizePreference) {
  document.documentElement.style.setProperty('--font-scale', String(fontScaleFor(value)))
}

function persistFontSize(value: FontSizePreference) {
  try {
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, value)
  } catch {
    // 隐私模式或存储不可用时仍保留本次页面内的字号设置。
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

function toggleFontSizePanel() {
  fontSizePanelOpen.value = !fontSizePanelOpen.value
}

function handleGlobalPointerDown(event: PointerEvent) {
  if (tabContextMenu.value && tabContextMenuRef.value && !tabContextMenuRef.value.contains(event.target as Node)) {
    tabContextMenu.value = null
  }
  if (fontSizePanelOpen.value && fontSizePanel.value && !fontSizePanel.value.contains(event.target as Node)) {
    fontSizePanelOpen.value = false
  }
  if (notificationPanelOpen.value && notificationPanel.value && !notificationPanel.value.contains(event.target as Node)) {
    notificationPanelOpen.value = false
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  tabContextMenu.value = null
  mobileNavOpen.value = false
  fontSizePanelOpen.value = false
  notificationPanelOpen.value = false
  notificationBanner.value = null
  notificationDetail.value = null
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

function openTabContextMenu(event: MouseEvent, path: string) {
  tabContextMenu.value = { x: event.clientX, y: event.clientY, path }
}

function closeTabContextMenu() {
  tabContextMenu.value = null
}

function refreshTab(path: string) {
  closeTabContextMenu()
  if (route.path !== path) {
    void router.push(path).then(() => {
      viewKey.value += 1
    })
  } else {
    viewKey.value += 1
  }
}

function closeTabFromMenu(path: string) {
  closeTabContextMenu()
  handleCloseTab(path)
}

function closeOtherTabsFromMenu(path: string) {
  closeTabContextMenu()
  openedTabs.value = closeOtherTabs(openedTabs.value, path)
  if (route.path !== path) void router.push(path)
}

function closeAllTabsFromMenu() {
  closeTabContextMenu()
  openedTabs.value = restoreTabs(null, isKnownPath)
  if (route.path !== HOME_TAB_PATH) void router.push(HOME_TAB_PATH)
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
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  window.removeEventListener('scroll', handleScroll)
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
  if (notificationTimer !== undefined) window.clearInterval(notificationTimer)
  if (notificationReminderTimer !== undefined) window.clearInterval(notificationReminderTimer)
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
        <div ref="fontSizePanel" class="app-header-font-size">
          <button
            type="button"
            class="font-size-trigger"
            :class="{ 'is-active': fontSizePanelOpen }"
            :aria-expanded="fontSizePanelOpen"
            aria-controls="font-size-popover"
            :aria-label="`页面字号：${fontSizeOption.label}`"
            @click="toggleFontSizePanel"
          >
            <Type :size="17" aria-hidden="true" />
            <span class="font-size-trigger-label">字号</span>
          </button>
          <div v-if="fontSizePanelOpen" id="font-size-popover" class="font-size-popover">
            <span class="font-size-current" aria-live="polite">当前字号：{{ fontSizeOption.label }}</span>
            <input
              id="font-size-slider"
              v-model="fontSizeIndex"
              type="range"
              min="0"
              max="3"
              step="1"
              :aria-label="`调整页面字号，当前为${fontSizeOption.label}`"
              :aria-valuetext="fontSizeOption.label"
            />
            <span class="font-size-options" aria-hidden="true">小 · 标准 · 大 · 特大</span>
          </div>
        </div>
        <div ref="notificationPanel" class="app-header-notification">
          <button
            type="button"
            class="notification-trigger"
            :class="{ 'is-active': notificationPanelOpen }"
            :aria-expanded="notificationPanelOpen"
            aria-controls="notification-popover"
            :aria-label="`站内通知，${unreadNotificationCount} 条未读`"
            @click="toggleNotificationPanel"
          >
            <Bell :size="18" aria-hidden="true" />
            <span v-if="unreadNotificationCount > 0" class="notification-badge" aria-hidden="true">
              {{ unreadNotificationCount > 99 ? '99+' : unreadNotificationCount }}
            </span>
          </button>
          <div v-if="notificationPanelOpen" id="notification-popover" class="notification-popover">
            <div class="notification-popover-head">
              <strong>站内通知</strong>
              <button type="button" class="link-button" @click="markAllRead">全部已读</button>
            </div>
            <div v-if="notifications.length" class="notification-list">
              <button
                v-for="item in notifications"
                :key="item.id"
                type="button"
                class="notification-item"
                :class="{ 'is-unread': !item.is_read }"
                @click="openNotification(item)"
              >
                <span class="notification-item-head">
                  <strong>{{ item.title }}</strong>
                  <span v-if="!item.is_read" class="unread-dot" aria-label="未读"></span>
                </span>
                <span class="notification-item-body">{{ notificationPlainText(item.content) }}</span>
                <span class="notification-item-meta">
                  {{ item.priority === 'urgent' ? '紧急' : item.priority === 'important' ? '重要' : '普通' }}
                  · {{ item.publish_at ? new Date(item.publish_at).toLocaleString() : '—' }}
                </span>
              </button>
            </div>
            <div v-else class="notification-empty">暂无通知</div>
          </div>
        </div>
        <div class="app-header-account">
          <span class="account-avatar" aria-hidden="true">{{ userInitial }}</span>
          <span class="account-name">{{ currentUser?.displayName }}</span>
          <button class="sign-out-button" type="button" :disabled="signingOut" @click="signOut">
            <LogOut :size="18" aria-hidden="true" />
            <span>{{ signingOut ? '正在退出' : '退出登录' }}</span>
          </button>
        </div>
      </header>
      <div v-if="notificationBanner && !notificationPanelOpen" class="notification-banner" role="status">
        <div class="notification-banner-head">
          <BellRing :size="18" aria-hidden="true" />
          <div class="notification-banner-copy">
            <strong>{{ notificationBanner.title }}</strong>
            <span>{{ notificationPlainText(notificationBanner.content) }}</span>
          </div>
          <button type="button" class="notification-banner-close" aria-label="关闭提醒" @click="notificationBanner = null">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
        <button type="button" class="notification-banner-view" @click="openNotification(notificationBanner)">查看详情</button>
      </div>
      <div v-if="notificationDetail" class="notification-detail-mask" @click.self="closeNotificationDetail">
        <article class="notification-detail-card" role="dialog" aria-modal="true" aria-label="通知详情">
          <header class="notification-detail-head">
            <div>
              <h2>{{ notificationDetail.title }}</h2>
              <p>
                {{ notificationDetail.priority === 'urgent' ? '紧急' : notificationDetail.priority === 'important' ? '重要' : '普通' }}
                · {{ notificationDetail.publish_at ? new Date(notificationDetail.publish_at).toLocaleString() : '—' }}
              </p>
            </div>
            <button type="button" class="notification-detail-close" aria-label="关闭通知详情" @click="closeNotificationDetail">
              <X :size="18" aria-hidden="true" />
            </button>
          </header>
          <div class="notification-detail-content" v-html="sanitizeNotificationHtml(notificationDetail.content)"></div>
        </article>
      </div>
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
              <span
                v-for="entry in openedTabItems"
                :key="entry.tab.path"
                class="app-tab"
                :class="{ 'is-active': entry.tab.path === activeTabPath }"
                @contextmenu.prevent="openTabContextMenu($event, entry.tab.path)"
              >
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
          <div
            v-if="tabContextMenu"
            ref="tabContextMenuRef"
            class="tab-context-menu"
            :style="tabContextMenuStyle"
            role="menu"
            @pointerdown.stop
            @contextmenu.prevent
          >
            <button type="button" role="menuitem" @click="refreshTab(tabContextMenu.path)">
              <RefreshCw :size="15" aria-hidden="true" />
              刷新当前
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="tabContextMenu.path === HOME_TAB_PATH"
              @click="closeTabFromMenu(tabContextMenu.path)"
            >
              <X :size="15" aria-hidden="true" />
              关闭当前
            </button>
            <button type="button" role="menuitem" @click="closeOtherTabsFromMenu(tabContextMenu.path)">
              <PanelRightClose :size="15" aria-hidden="true" />
              关闭其他
            </button>
            <button type="button" role="menuitem" class="danger-text" @click="closeAllTabsFromMenu">
              <SquareX :size="15" aria-hidden="true" />
              关闭全部
            </button>
          </div>
          <nav v-if="mobileNavOpen" id="mobile-nav" class="mobile-nav-panel" aria-label="更多功能">
            <RouterLink v-for="item in moreNavItems" :key="item.path" :to="item.path" :aria-current="route.path.startsWith(item.path) ? 'page' : undefined">
              <component :is="item.icon" class="nav-icon" :size="20" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </nav>
          <main id="main-content" tabindex="-1">
            <RouterView :key="viewKey" />
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
<style src="./styles-responsive.css"></style>
