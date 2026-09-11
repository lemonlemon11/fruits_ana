<script setup lang="ts">
/**
 * 系统标识：三根递增的行情柱 + 一片叶，表示「水果 · 分级行情」。
 * 颜色沿用全站等级色，保证与 A/B/C 果的配色一致。
 * tone="solid" 用于浅色背景（侧栏、移动端头部），tone="inverse" 用于深色底（登录页）。
 */
withDefaults(defineProps<{ size?: number; tone?: 'solid' | 'inverse' }>(), {
  size: 38,
  tone: 'solid',
})

const palettes = {
  solid: { badge: '#17663f', leaf: '#ffffff', bars: ['#8fd3a8', '#f0c163', '#e58a7c'] },
  inverse: { badge: '#ffffff', leaf: '#17663f', bars: ['#177454', '#c18420', '#bf4b3e'] },
} as const
</script>

<template>
  <svg
    class="brand-mark-svg"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    role="img"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="64" height="64" rx="16" :fill="palettes[tone].badge" />
    <rect x="11" y="37" width="11" height="16" rx="3.6" :fill="palettes[tone].bars[2]" />
    <rect x="26.5" y="26" width="11" height="27" rx="3.6" :fill="palettes[tone].bars[1]" />
    <rect x="42" y="15" width="11" height="38" rx="3.6" :fill="palettes[tone].bars[0]" />
    <path d="M47.5 15.5c0-6.6 4.6-11 11-11 0 7-4.6 11-11 11z" :fill="palettes[tone].leaf" />
  </svg>
</template>

<style scoped>
.brand-mark-svg { display: block; flex: 0 0 auto; }
</style>
