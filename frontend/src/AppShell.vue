<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true"><i /></span>
        <div><strong>果级经营台</strong><small>FRUIT OPERATIONS</small></div>
      </div>
      <nav aria-label="主要导航">
        <RouterLink to="/overview"><span aria-hidden="true">01</span> 全局总览</RouterLink>
        <RouterLink to="/containers"><span aria-hidden="true">02</span> 单柜诊断</RouterLink>
        <RouterLink to="/imports"><span aria-hidden="true">03</span> 导入与质量</RouterLink>
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
