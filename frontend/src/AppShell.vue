<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const sidebarCollapsed = ref(false)
const mobileNavOpen = ref(false)
const route = useRoute()
type Theme = 'natural' | 'command' | 'contrast'
const theme = ref<Theme>('natural')
const themes: Array<{ id: Theme; label: string }> = [
  { id: 'natural', label: '自然经营' },
  { id: 'command', label: '深色指挥台' },
  { id: 'contrast', label: '高对比' },
]
const navItems = [
  { path: '/overview', index: '01', label: '全局总览', caption: '经营盘面' },
  { path: '/containers', index: '02', label: '单柜诊断', caption: '货柜对比' },
  { path: '/imports', index: '03', label: '导入与质量', caption: '数据治理' },
]
const currentNav = computed(() => navItems.find((item) => route.path.startsWith(item.path)) ?? navItems[0])

function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value
  localStorage.setItem('fruit-analysis-theme', value)
}

onMounted(() => {
  const saved = localStorage.getItem('fruit-analysis-theme') as Theme | null
  if (saved && themes.some((item) => item.id === saved)) theme.value = saved
  applyTheme(theme.value)
  window.addEventListener('keydown', handleGlobalKeydown)
})
watch(theme, applyTheme)
watch(() => route.path, () => {
  mobileNavOpen.value = false
})

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') mobileNavOpen.value = false
}

onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown))
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-nav-open': mobileNavOpen }">
    <aside class="app-sidebar" :aria-label="sidebarCollapsed ? '已收起的主要导航' : '主要导航'">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <div class="brand-copy">
          <strong>果级经营台</strong>
          <small>FRUIT OPERATIONS</small>
        </div>
      </div>
      <button class="sidebar-toggle" type="button" :aria-expanded="!sidebarCollapsed" aria-controls="primary-nav" @click="sidebarCollapsed = !sidebarCollapsed">
        <span class="sidebar-toggle-icon" aria-hidden="true">{{ sidebarCollapsed ? '→' : '←' }}</span>
        <span>{{ sidebarCollapsed ? '展开菜单' : '收起菜单' }}</span>
      </button>
      <nav id="primary-nav" aria-label="主要导航">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" :title="item.label">
          <span class="nav-index" aria-hidden="true">{{ item.index }}</span>
          <span class="nav-label"><b>{{ item.label }}</b><small>{{ item.caption }}</small></span>
        </RouterLink>
      </nav>
      <div class="theme-switcher" role="group" aria-label="界面主题">
        <span>主题</span>
        <button v-for="item in themes" :key="item.id" type="button" :aria-pressed="theme === item.id" @click="theme = item.id">{{ item.label }}</button>
      </div>
      <p class="sidebar-foot">A / B / C 等级统一经营口径<br>C果包含原始 BC 等级</p>
    </aside>
    <div class="app-workspace">
      <header class="mobile-brand">
        <div class="mobile-brand-copy">
          <span class="brand-mark" aria-hidden="true"><i /></span>
          <div>
            <strong>果级经营台</strong>
            <span>{{ currentNav.label }}</span>
          </div>
        </div>
        <div class="mobile-header-actions">
          <label class="mobile-theme-control">
            <span class="sr-only">界面主题</span>
            <select v-model="theme" class="mobile-theme-select" aria-label="界面主题">
              <option v-for="item in themes" :key="item.id" :value="item.id">{{ item.label }}</option>
            </select>
          </label>
          <button
            class="mobile-menu-toggle"
            type="button"
            aria-controls="mobile-nav"
            :aria-expanded="mobileNavOpen"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <span class="menu-glyph" aria-hidden="true"><i /><i /><i /></span>
            <span class="sr-only">{{ mobileNavOpen ? '关闭导航菜单' : '打开导航菜单' }}</span>
          </button>
        </div>
      </header>
      <nav v-if="mobileNavOpen" id="mobile-nav" class="mobile-nav-panel" aria-label="移动端主要导航">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path">
          <span class="nav-index" aria-hidden="true">{{ item.index }}</span>
          <span><b>{{ item.label }}</b><small>{{ item.caption }}</small></span>
        </RouterLink>
      </nav>
      <main id="main-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style src="./styles.css"></style>
<style src="./styles-shell.css"></style>
