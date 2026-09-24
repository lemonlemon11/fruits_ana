<script setup lang="ts">
import { computed } from 'vue'

import { currentUser, firstAllowedPath } from '../auth'
import BrandMark from '../components/BrandMark.vue'

const hasAssignedMenu = computed(() => Boolean(firstAllowedPath(
  currentUser.value?.permissions ?? [],
  currentUser.value?.menus ?? [],
)))
</script>

<template>
  <section class="welcome-lobby" aria-labelledby="welcome-title">
    <div class="welcome-brand" aria-hidden="true">
      <BrandMark :size="52" />
    </div>
    <p class="welcome-kicker">SLD · 水果市场销售分析</p>
    <h1 id="welcome-title">
      {{ currentUser?.displayName }}，欢迎访问
    </h1>
    <span class="welcome-divider" aria-hidden="true"></span>
    <p v-if="hasAssignedMenu" class="welcome-guidance">
      请选择左侧或底部菜单继续使用
    </p>
    <p v-else class="welcome-guidance welcome-guidance-empty">
      当前账号暂未分配业务菜单，请联系管理员完成角色菜单授权
    </p>
  </section>
</template>

<style scoped>
.welcome-lobby {
  box-sizing: border-box;
  display: flex;
  min-height: clamp(28rem, 70dvh, 48rem);
  width: min(100%, 72rem);
  margin: 0 auto;
  padding: clamp(4.5rem, 13vh, 9rem) clamp(1.25rem, 5vw, 4rem) 4rem;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.welcome-brand {
  margin-bottom: 1.75rem;
}

.welcome-kicker {
  margin: 0 0 .9rem;
  color: var(--primary-dark);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .16em;
}

h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(1.85rem, 4vw, 3.25rem);
  font-weight: 650;
  line-height: 1.22;
  letter-spacing: -.035em;
}

.welcome-divider {
  display: block;
  width: 2.75rem;
  height: 2px;
  margin: 2rem 0 1.65rem;
  border-radius: 999px;
  background: var(--primary);
}

.welcome-guidance {
  max-width: 36rem;
  margin: 0;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.75;
}

.welcome-guidance-empty {
  color: var(--text-secondary, var(--muted));
}

@media (max-width: 820px) {
  .welcome-lobby {
    min-height: calc(100dvh - var(--app-header-height) - var(--mobile-tabbar-height) - 5rem);
    padding-top: clamp(4rem, 15vh, 7rem);
  }

  .welcome-kicker {
    font-size: .72rem;
    letter-spacing: .11em;
  }

  h1 {
    font-size: clamp(1.65rem, 8vw, 2.35rem);
  }
}
</style>
