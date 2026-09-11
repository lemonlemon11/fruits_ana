<script setup lang="ts">
import { computed } from 'vue'

import { gradeLabel } from '../api/client'
import type { Grade, SeriesComparisonItem } from '../api/types'
import { useChartTooltip } from '../utils/chartTooltip'
import { formatNumber, formatPrice } from '../utils/format'
import { gradePrice } from '../utils/seriesComparison'
import { displayOrderNo, rawOrderNo } from '../utils/orderNo'
import { displayMerchantNo, rawMerchantNo } from '../utils/merchantNo'
import ChartLegend from './ChartLegend.vue'
import ChartTooltip from './ChartTooltip.vue'

const props = defineProps<{ items: SeriesComparisonItem[]; loading?: boolean }>()

const gradeOrder: Grade[] = ['A', 'B', 'C']
const gradeColors: Record<Grade, string> = { A: '#16856b', B: '#bd7414', C: '#b94a3c' }

const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()
const legendItems = gradeOrder.map((grade) => ({
  label: gradeLabel(grade),
  color: gradeColors[grade],
  variant: 'block' as const,
}))

const maxPrice = computed(() =>
  Math.max(
    0,
    ...props.items.flatMap((item) =>
      gradeOrder.map((grade) => gradePrice(item, grade) ?? 0),
    ),
  ),
)

/** 纵轴刻度：把峰值向上取整到 1/2/2.5/5 的整倍数，柱子不会顶到上边框。 */
const axisTicks = computed(() => {
  const peak = maxPrice.value
  if (!peak) return [] as number[]
  const step = niceStep(peak / 3)
  const top = Math.ceil(peak / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
})

const axisTop = computed(() => axisTicks.value[axisTicks.value.length - 1] ?? 0)

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const candidate = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * magnitude)
    .find((value) => value >= raw)
  return candidate ?? magnitude * 10
}

const groups = computed(() =>
  props.items.map((item) => ({
    merchantNo: displayMerchantNo(item),
    rawMerchantNo: rawMerchantNo(item),
    orderNo: displayOrderNo(item),
    rawOrderNo: rawOrderNo(item),
    bars: gradeOrder.map((grade) => ({
      grade,
      color: gradeColors[grade],
      value: gradePrice(item, grade),
    })),
  })),
)

/** 每个等级的最高价：柱顶数字加粗用深色，柱子加一圈内描边。 */
const bestPrices = computed(() => {
  const best: Record<Grade, number> = { A: 0, B: 0, C: 0 }
  gradeOrder.forEach((grade) => {
    best[grade] = Math.max(0, ...props.items.map((item) => gradePrice(item, grade) ?? 0))
  })
  return best
})

const plotMinWidth = computed(() => `${Math.max(props.items.length, 2) * 132}px`)

/** 柱高与刻度位置共用同一套比例，保证柱顶和左侧刻度对得上。 */
function position(value: number | null): string {
  if (!axisTop.value || value === null) return '0%'
  return `${Math.max((value / axisTop.value) * 100, 3)}%`
}

function barLabel(value: number | null): string {
  return value === null ? '—' : formatNumber(Math.round(value))
}

/** 柱状图下方标签的 tooltip：回溯填写人员的原始商号 / 单号写法。 */
function rawClusterTrace(group: { merchantNo: string; rawMerchantNo: string; orderNo: string; rawOrderNo: string }): string {
  const parts = []
  if (group.rawMerchantNo && group.rawMerchantNo !== group.merchantNo) {
    parts.push(`原始商号：${group.rawMerchantNo}`)
  }
  if (group.rawOrderNo && group.rawOrderNo !== group.orderNo) {
    parts.push(`原始单号：${group.rawOrderNo}`)
  }
  return parts.join(' / ')
}

function isBest(grade: Grade, value: number | null): boolean {
  return value !== null && value > 0 && value === bestPrices.value[grade]
}

function showBarTooltip(event: MouseEvent, group: { merchantNo: string; orderNo: string }, bar: { grade: Grade; value: number | null; color: string }) {
  showTooltip(event, {
    title: `${group.merchantNo}${group.orderNo ? ` · ${group.orderNo}` : ''}`,
    rows: [
      { label: gradeLabel(bar.grade), value: `${formatPrice(bar.value)}/件`, color: bar.color },
    ],
    note: isBest(bar.grade, bar.value) ? `该等级所选结算单中的最高价` : undefined,
  })
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="series-price-title">
    <header class="section-heading">
      <div>
        <h2 id="series-price-title">A/B/C 平均每件售价对比</h2>
        <p class="section-note">每张结算单一组，柱内从左到右为 A、B、C，同一颜色的柱子可跨结算单比较；单位：元/件，深色数字为该等级最高价</p>
      </div>
      <ChartLegend :items="legendItems" />
    </header>

    <div v-if="loading" class="chart-skeleton skeleton-block">正在加载价格对比</div>
    <div v-else-if="!items.length" class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>在上方勾选两个及以上结算单后即可对比。</span>
    </div>
    <div v-else class="price-figure">
      <div class="price-axis" aria-hidden="true">
        <span v-for="tick in axisTicks" :key="tick" :style="{ bottom: position(tick) }">
          {{ formatNumber(tick) }}
        </span>
      </div>
      <div class="price-plot-scroll">
        <div class="price-plot" :style="{ minWidth: plotMinWidth }">
          <div class="price-grid-lines" aria-hidden="true">
            <span v-for="tick in axisTicks" :key="`grid-${tick}`" :style="{ bottom: position(tick) }" />
          </div>
          <div class="price-clusters">
            <div v-for="group in groups" :key="group.merchantNo" class="price-cluster">
              <div class="price-bars">
                <div
                  v-for="bar in group.bars"
                  :key="bar.grade"
                  class="price-bar-item"
                  :class="{ 'is-best': isBest(bar.grade, bar.value) }"
                  @mouseenter="showBarTooltip($event, group, bar)"
                  @mousemove="moveTooltip"
                  @mouseleave="hideTooltip"
                >
                  <span class="price-bar-value" :style="{ bottom: position(bar.value) }">
                    {{ barLabel(bar.value) }}
                  </span>
                  <span
                    class="price-bar"
                    :style="{ height: position(bar.value), backgroundColor: bar.color }"
                  />
                </div>
              </div>
              <span
                class="price-cluster-label"
                :title="rawClusterTrace(group)"
              >
                <strong>{{ group.merchantNo }}</strong>
                <small>{{ group.orderNo || '—' }}</small>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ChartTooltip :tooltip="tooltip" />
  </section>
</template>

<style scoped>
.price-figure { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr); column-gap: 10px; }
/* 左侧刻度与柱区同为 200px，刻度用百分比定位后能和网格线一一对齐。 */
.price-axis { position: relative; height: 200px; }
.price-axis span { position: absolute; right: 0; transform: translateY(50%); color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
.price-plot-scroll { min-width: 0; overflow-x: auto; }
.price-plot { position: relative; }
.price-grid-lines { position: absolute; top: 0; left: 0; right: 0; height: 200px; }
.price-grid-lines span { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); }
.price-grid-lines span:first-child { border-top-color: var(--line-strong); }
.price-clusters { position: relative; display: flex; align-items: flex-start; gap: 20px; }
.price-cluster { display: grid; flex: 1 1 0; gap: 6px; min-width: 108px; }
.price-bars { display: flex; align-items: stretch; gap: 6px; height: 200px; min-height: 200px; }
.price-bar-item { position: relative; display: flex; flex: 1 1 0; align-items: flex-end; justify-content: center; min-width: 0; }
.price-bar { width: 100%; max-width: 34px; min-height: 2px; border-radius: 4px 4px 0 0; transition: height 240ms ease; }
.price-bar-item.is-best .price-bar { box-shadow: inset 0 0 0 2px var(--surface); }
.price-bar-value { position: absolute; left: 50%; margin-bottom: 5px; transform: translateX(-50%); color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.price-bar-item.is-best .price-bar-value { color: var(--ink); font-weight: 700; }
.price-cluster-label { display: grid; justify-items: center; gap: 1px; text-align: center; }
.price-cluster-label strong { font-size: .95rem; overflow-wrap: anywhere; }
.price-cluster-label small { color: var(--muted); font-size: .85rem; }
.chart-skeleton { min-height: 250px; }

@media (max-width: 720px) {
  .section-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
}
</style>
