<script setup lang="ts">
/**
 * 登录与注册共用的 Portal 骨架：左侧品牌视觉，右侧表单插槽。
 * 主图使用本地化的国内来源图片 public/auth-portal-durian.jpg。
 */

const features = ['销售分析', '数据明细', '结算单对比', '数据导入']
</script>

<template>
  <main class="portal">
    <section class="portal-visual" aria-label="果级经营台介绍">
      <div class="portal-brand">
        <span class="portal-mark" aria-hidden="true">果</span>
        <span class="portal-brand-copy">
          <strong>果级经营台</strong>
          <small>水果销售分析</small>
        </span>
      </div>
      <div class="portal-hero">
        <p class="portal-kicker">果园经营数据门户</p>
        <h1>把每一批水果，<br />经营得更明白。</h1>
        <p class="portal-lede">销量、等级与结算单数据，一处掌握，让每天的经营判断都有数据可依。</p>
      </div>
      <ul class="portal-features">
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>
    </section>
    <section class="portal-panel">
      <div class="portal-form-wrap">
        <slot />
      </div>
    </section>
  </main>
</template>
