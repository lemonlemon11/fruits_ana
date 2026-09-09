<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const sidebarCollapsed = ref(false)
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="app-sidebar" :aria-label="sidebarCollapsed ? '已收起的主要导航' : '主要导航'">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <div class="brand-copy"><strong>果级经营台</strong><small>FRUIT OPERATIONS</small></div>
      </div>
      <button class="sidebar-toggle" type="button" :aria-expanded="!sidebarCollapsed" aria-controls="primary-nav" @click="sidebarCollapsed = !sidebarCollapsed">
        <span aria-hidden="true">{{ sidebarCollapsed ? '→' : '←' }}</span>
        <span>{{ sidebarCollapsed ? '展开菜单' : '收起菜单' }}</span>
      </button>
      <nav id="primary-nav" aria-label="主要导航">
        <RouterLink to="/overview" title="全局总览"><span aria-hidden="true">01</span><b>全局总览</b></RouterLink>
        <RouterLink to="/containers" title="单柜诊断"><span aria-hidden="true">02</span><b>单柜诊断</b></RouterLink>
        <RouterLink to="/imports" title="导入与质量"><span aria-hidden="true">03</span><b>导入与质量</b></RouterLink>
      </nav>
      <p class="sidebar-foot">A / B / C 等级统一经营口径<br>C果包含原始 BC 等级</p>
    </aside>
    <div class="app-workspace">
      <header class="mobile-brand">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <strong>果级经营台</strong>
      </header>
      <main id="main-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style src="./styles.css"></style>
