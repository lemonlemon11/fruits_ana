<script setup lang="ts">
import BrandMark from './BrandMark.vue'

/**
 * 登录与注册共用的 Portal 骨架：左侧品牌视觉，右侧表单。
 * 主图来自国内 CC零素材网的可商用图片，授权记录见 docs/IMAGE_CREDITS.md。
 */

const features = ['销售分析', '数据明细', '结算单对比', '数据导入']

withDefaults(defineProps<{ showFacts?: boolean }>(), { showFacts: true })

const facts = [
  { label: '等级口径', value: 'A / B / C 三级' },
  { label: '核算维度', value: '逐张结算单' },
  { label: '导入格式', value: 'xlsx' },
]
</script>

<template>
  <main class="portal">
    <section class="portal-visual" aria-label="SLD-水果市场销售分析介绍">
      <header class="portal-brand">
        <BrandMark :size="44" tone="inverse" />
        <span class="portal-brand-copy">
          <strong>SLD-水果市场销售分析</strong>
          <small>水果等级销售经营分析</small>
        </span>
      </header>

      <div class="portal-hero">
        <p class="portal-kicker">水果经营数据门户</p>
        <h1>把每一批水果，<br />经营得更明白。</h1>
        <p class="portal-lede">销量、等级与结算单数据，一处掌握，让每天的经营判断都有数据可依。</p>
        <ul class="portal-features">
          <li v-for="feature in features" :key="feature">{{ feature }}</li>
        </ul>
      </div>

      <dl v-if="showFacts" class="portal-facts">
        <div v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="portal-panel">
      <div class="portal-panel-inner">
        <div class="portal-form-card">
          <slot />
        </div>

      </div>
    </section>
  </main>
</template>
