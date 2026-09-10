<script setup lang="ts">
/**
 * 登录与注册共用的 Portal 骨架：左侧品牌视觉，右侧表单插槽。
 */

const features = ['销售分析', '货柜对比', '数据导入']

const spikeCount = 40
const bodyRadius = 97
const spikeRadius = 112
const fruitCenter = 120

const spikes = Array.from({ length: spikeCount }, (_, index) => {
  const angle = (index / spikeCount) * Math.PI * 2
  const half = (Math.PI / spikeCount) * 1.08
  const point = (radius: number, offset: number) => [
    (fruitCenter + Math.cos(angle + offset) * radius).toFixed(1),
    (fruitCenter + Math.sin(angle + offset) * radius).toFixed(1),
  ]
  const [startX, startY] = point(bodyRadius - 2, -half)
  const [tipX, tipY] = point(spikeRadius, 0)
  const [endX, endY] = point(bodyRadius - 2, half)
  return `M${startX} ${startY} L${tipX} ${tipY} L${endX} ${endY} Z`
}).join(' ')
</script>

<template>
  <main class="portal">
    <section class="portal-visual" aria-label="果级经营台介绍">
      <svg class="portal-fruit" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="portal-fruit-body" cx="36%" cy="28%" r="82%">
            <stop offset="0%" stop-color="#f6d27f" />
            <stop offset="55%" stop-color="#d9a02c" />
            <stop offset="100%" stop-color="#a7751c" />
          </radialGradient>
        </defs>
        <path :d="spikes" fill="#c08d24" />
        <circle :cx="fruitCenter" :cy="fruitCenter" :r="bodyRadius" fill="url(#portal-fruit-body)" />
        <path class="portal-fruit-seam" d="M120 28 C 94 80, 94 162, 120 212" />
        <path class="portal-fruit-seam" d="M120 28 C 146 80, 146 162, 120 212" />
      </svg>
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
        <p class="portal-lede">销量、等级与货柜数据，一处掌握，让每天的经营判断都有数据可依。</p>
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
