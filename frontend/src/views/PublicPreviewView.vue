<script setup lang="ts">
import { computed, ref } from 'vue'
import ArrowRight from '@lucide/vue/dist/esm/icons/arrow-right.mjs'
import Download from '@lucide/vue/dist/esm/icons/download.mjs'
import LockKeyhole from '@lucide/vue/dist/esm/icons/lock-keyhole.mjs'
import Sparkles from '@lucide/vue/dist/esm/icons/sparkles.mjs'
import { RouterLink } from 'vue-router'

import ChartLegend from '../components/ChartLegend.vue'
import ChartTooltip from '../components/ChartTooltip.vue'
import BrandMark from '../components/BrandMark.vue'
import { useChartTooltip } from '../utils/chartTooltip'
import { activeGrades, gradeColors, gradeLabels, type Grade } from '../utils/grades'

type GradeRow = { quantity: number; amount: number; price: number }
type PreviewOrder = { name: string; date: string; totalQuantity: number; totalAmount: number; grades: Partial<Record<Grade, GradeRow>> }

const orders: PreviewOrder[] = [
  { name: '宝贝-001', date: '8/27', totalQuantity: 973, totalAmount: 412240, grades: { A: { quantity: 325, amount: 155850, price: 479.54 }, B: { quantity: 524, amount: 217790, price: 415.63 }, C: { quantity: 124, amount: 38600, price: 311.29 } } },
  { name: '宝贝-002', date: '8/27', totalQuantity: 974, totalAmount: 432300, grades: { A: { quantity: 340, amount: 180030, price: 529.50 }, B: { quantity: 386, amount: 164370, price: 425.83 }, C: { quantity: 248, amount: 87900, price: 354.44 } } },
  { name: '宝贝-003', date: '9/05', totalQuantity: 900, totalAmount: 406570, grades: { A: { quantity: 248, amount: 133880, price: 539.84 }, B: { quantity: 406, amount: 186260, price: 458.77 }, C: { quantity: 246, amount: 86430, price: 351.34 } } },
]

const activeGrade = ref<Grade>('A')
const gradeOrder = computed(() => activeGrades(orders.flatMap((order) => Object.keys(order.grades).map((grade) => ({ grade })))))
const totalQuantity = computed(() => orders.reduce((sum, order) => sum + order.totalQuantity, 0))
const totalAmount = computed(() => orders.reduce((sum, order) => sum + order.totalAmount, 0))
const totalPrice = computed(() => totalAmount.value / totalQuantity.value)
function gradeRow(order: PreviewOrder, grade: Grade): GradeRow {
  return order.grades[grade] ?? { quantity: 0, amount: 0, price: 0 }
}
const activeRows = computed(() => orders.map((order) => ({ order, row: gradeRow(order, activeGrade.value) })))
const gradeTotals = computed(() => gradeOrder.value.map((grade) => {
  const quantity = orders.reduce((sum, order) => sum + gradeRow(order, grade).quantity, 0)
  const amount = orders.reduce((sum, order) => sum + gradeRow(order, grade).amount, 0)
  return { grade, quantity, amount, price: amount / quantity, share: quantity / totalQuantity.value }
}))
const chart = { width: 720, height: 260, left: 48, right: 18, top: 24, bottom: 42 }
const plotWidth = chart.width - chart.left - chart.right
const plotHeight = chart.height - chart.top - chart.bottom

function xPosition(index: number): number { return chart.left + (orders.length === 1 ? plotWidth / 2 : (plotWidth / (orders.length - 1)) * index) }
function yPosition(value: number): number { return chart.top + plotHeight - ((value - 280) / 300) * plotHeight }
function linePoints(grade: Grade): string { return orders.map((order, index) => `${xPosition(index)},${yPosition(gradeRow(order, grade).price)}`).join(' ') }
function money(value: number): string { return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` }
function price(value: number): string { return `¥${Math.round(value).toLocaleString('zh-CN')}` }
function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }

const { tooltip, showTooltip, moveTooltip, hideTooltip } = useChartTooltip()
const previewLegend = gradeOrder.value.map((grade) => ({
  label: gradeLabels[grade],
  color: gradeColors[grade],
  variant: 'line' as const,
}))

function showOrderTooltip(event: MouseEvent, order: PreviewOrder) {
  showTooltip(event, {
    title: `${order.name} · ${order.date}`,
    rows: gradeOrder.value.map((grade) => ({
      label: gradeLabels[grade],
      value: `${price(gradeRow(order, grade).price)}/公斤`,
      color: gradeColors[grade],
    })),
    note: `该单 ${order.totalQuantity.toLocaleString()} 件 · ${money(order.totalAmount)}`,
  })
}

const ringRadius = 48
const ringCircumference = 2 * Math.PI * ringRadius
const ringSegments = computed(() => {
  let accumulated = 0
  return gradeTotals.value.map((row) => {
    const segment = {
      ...row,
      color: gradeColors[row.grade],
      dash: Math.max(row.share, 0) * ringCircumference,
      offset: -accumulated * ringCircumference,
    }
    accumulated += row.share
    return segment
  })
})

function showShareTooltip(event: MouseEvent, row: (typeof gradeTotals.value)[number]) {
  showTooltip(event, {
    title: gradeLabels[row.grade],
    rows: [
      { label: '件数占比', value: percent(row.share), color: gradeColors[row.grade] },
      { label: '件数', value: `${row.quantity.toLocaleString()} 件` },
      { label: '每件均价', value: price(row.price) },
    ],
    note: `全部 ${totalQuantity.value.toLocaleString()} 件`,
  })
}
</script>

<template>
  <main class="preview-page">
    <header class="preview-header">
      <div class="preview-brand"><BrandMark :size="42" /><div><strong>SLD-水果市场销售分析</strong><span>演示预览</span></div></div>
      <div class="preview-actions"><span class="demo-chip"><Sparkles :size="15" aria-hidden="true" />演示数据</span><RouterLink class="preview-login" to="/login"><LockKeyhole :size="16" aria-hidden="true" />登录查看真实数据</RouterLink></div>
    </header>

    <div class="preview-demo-notice" role="note">本页为演示数据，不代表真实经营结果。</div>
    <section class="preview-hero" aria-labelledby="preview-title"><div><p class="eyebrow">宝贝品牌 · 3 个业务单</p><h1 id="preview-title">等级独立分析</h1><p class="hero-copy">行情走强：A 果越卖越贵，B 果量价齐升，C 果占比抬升。</p></div><div class="hero-meta"><span>销售日期</span><strong>8/27 — 9/05</strong><small>按业务单分别核算</small></div></section>

    <section class="metric-grid" aria-label="宝贝品牌关键指标"><article class="metric-card"><span>总件数</span><strong>{{ totalQuantity.toLocaleString() }}</strong><small>3 个业务单合计</small></article><article class="metric-card accent-amount"><span>销售金额</span><strong>{{ money(totalAmount) }}</strong><small>全部等级</small></article><article class="metric-card accent-price"><span>每件均价</span><strong>{{ price(totalPrice) }}</strong><small>销售金额 ÷ 总件数</small></article><article class="metric-card accent-orders"><span>分析单数</span><strong>{{ orders.length }}</strong><small>按销售日期排序</small></article></section>

    <section class="visual-grid" aria-label="价格趋势与等级占比">
      <article class="preview-card trend-card"><header class="card-heading"><div><p class="eyebrow">价格趋势</p><h2>各单每件均价</h2></div><span class="heading-note">单位：元/件</span></header><div class="chart-wrap"><svg class="preview-line-chart" :viewBox="`0 0 ${chart.width} ${chart.height}`" role="img" aria-label="宝贝品牌各等级各单每件均价趋势图"><g class="chart-grid" aria-hidden="true"><line v-for="tick in [300, 400, 500]" :key="tick" :x1="chart.left" :x2="chart.width - chart.right" :y1="yPosition(tick)" :y2="yPosition(tick)" /><text v-for="tick in [300, 400, 500]" :key="`label-${tick}`" :x="chart.left - 10" :y="yPosition(tick) + 4" text-anchor="end">{{ tick }}</text></g><polyline v-for="grade in gradeOrder" :key="grade" class="price-line" :points="linePoints(grade)" :stroke="gradeColors[grade]" /><g v-for="grade in gradeOrder" :key="`dots-${grade}`"><circle v-for="(order, index) in orders" :key="`${grade}-${order.name}`" :cx="xPosition(index)" :cy="yPosition(gradeRow(order, grade).price)" r="5" :fill="gradeColors[grade]" /><circle v-for="(order, index) in orders" :key="`hit-${grade}-${order.name}`" class="price-hit" :cx="xPosition(index)" :cy="yPosition(gradeRow(order, grade).price)" r="14" @mouseenter="showOrderTooltip($event, order)" @mousemove="moveTooltip" @mouseleave="hideTooltip" /></g><g class="chart-x-labels"><text v-for="(order, index) in orders" :key="order.name" :x="xPosition(index)" :y="chart.height - 14" text-anchor="middle">{{ order.name }}</text></g></svg></div><ChartLegend class="legend-row" :items="previewLegend" /></article>
      <article class="preview-card share-card"><header class="card-heading"><div><p class="eyebrow">数量结构</p><h2>等级件数占比</h2></div><span class="heading-note">占全部件数</span></header><div class="share-layout"><div class="share-ring"><svg class="share-ring-chart" viewBox="0 0 136 136" role="img" aria-label="各等级件数占比环形图"><circle class="share-ring-track" cx="68" cy="68" :r="ringRadius" /><circle v-for="segment in ringSegments" :key="segment.grade" class="share-ring-segment" cx="68" cy="68" :r="ringRadius" :stroke="segment.color" :stroke-dasharray="`${segment.dash} ${ringCircumference}`" :stroke-dashoffset="segment.offset" @mouseenter="showShareTooltip($event, segment)" @mousemove="moveTooltip" @mouseleave="hideTooltip" /></svg><div class="ring-center"><strong>{{ totalQuantity.toLocaleString() }}</strong><span>总件数</span></div></div><ul class="share-list"><li v-for="row in gradeTotals" :key="row.grade"><span class="legend-item"><i :style="{ background: gradeColors[row.grade] }" />{{ gradeLabels[row.grade] }}</span><strong>{{ percent(row.share) }}</strong><small>{{ row.quantity.toLocaleString() }} 件</small></li></ul></div><p class="chart-caption">B 果件数最多，是当前品牌的走量主力；鼠标放在色环或色条上可查看明细。</p></article>
    </section>
    <ChartTooltip :tooltip="tooltip" />

    <section class="preview-card analysis-card" aria-labelledby="grade-analysis-title"><header class="card-heading"><div><p class="eyebrow">分等级核算</p><h2 id="grade-analysis-title">等级独立对比</h2></div><span class="heading-note">点击标签切换等级</span></header><div class="grade-tabs" role="tablist" aria-label="选择水果等级"><button v-for="grade in gradeOrder" :key="grade" :class="['grade-tab', { active: activeGrade === grade }]" type="button" role="tab" :aria-selected="activeGrade === grade" @click="activeGrade = grade"><span :style="{ background: gradeColors[grade] }" />{{ gradeLabels[grade] }}</button></div><div class="table-wrap"><table><thead><tr><th>单号</th><th>销售日期</th><th>件数</th><th>销售金额</th><th>每件均价</th><th>占本单销售金额</th></tr></thead><tbody><tr v-for="item in activeRows" :key="item.order.name"><th scope="row">{{ item.order.name }}</th><td>{{ item.order.date }}</td><td>{{ item.row.quantity }}</td><td>{{ money(item.row.amount) }}</td><td class="table-price">{{ price(item.row.price) }}</td><td>{{ percent(item.row.amount / item.order.totalAmount) }}</td></tr><tr class="total-row"><th scope="row">品牌合计</th><td>—</td><td>{{ gradeTotals.find((row) => row.grade === activeGrade)?.quantity }}</td><td>{{ money(gradeTotals.find((row) => row.grade === activeGrade)?.amount ?? 0) }}</td><td class="table-price">{{ price(gradeTotals.find((row) => row.grade === activeGrade)?.price ?? 0) }}</td><td>—</td></tr></tbody></table></div></section>

    <section class="ai-preview" aria-labelledby="ai-title"><div class="ai-icon"><Sparkles :size="20" aria-hidden="true" /></div><div class="ai-content"><div class="ai-heading"><div><p class="eyebrow">AI 分析结论 · 预览</p><h2 id="ai-title">一句话看懂宝贝品牌</h2></div><span class="ai-status">示例结论</span></div><p class="ai-summary">A 果越卖越贵、B 果量价齐升、C 果占比抬升，整体行情逐柜走强。</p><div class="ai-points"><p><strong>整体总览</strong>整体每件均价从 {{ price(orders[0].totalAmount / orders[0].totalQuantity) }} 升至 {{ price(orders[2].totalAmount / orders[2].totalQuantity) }}，晚到业务单价格更好。</p><p><strong>A 果</strong>合计 {{ gradeTotals[0].quantity.toLocaleString() }} 件，每件均价 {{ price(gradeTotals[0].price) }}，是利润核心。</p><p><strong>B 果</strong>合计 {{ gradeTotals[1].quantity.toLocaleString() }} 件，占全部件数 {{ percent(gradeTotals[1].share) }}，是走量主力。</p><p><strong>C 果</strong>合计 {{ gradeTotals[2].quantity.toLocaleString() }} 件，02/03 占比抬升，需关注小箱货比例。</p></div></div></section>

    <footer class="preview-footer"><span>这是视觉预览，数字来自示例数据</span><RouterLink to="/login">登录后查看真实数据与 Excel 导出 <ArrowRight :size="15" aria-hidden="true" /></RouterLink><span class="footer-export"><Download :size="15" aria-hidden="true" />导出功能需登录</span></footer>
  </main>
</template>

<style scoped>
.preview-page { --preview-ink: #24302b; --preview-muted: #627069; --preview-line: #dbe3dc; --preview-card: #fff; min-height: 100vh; padding: 26px clamp(18px, 4vw, 64px) 42px; color: var(--preview-ink); background: #f7f6ef; }
.preview-page * { box-sizing: border-box; }.preview-header, .preview-hero, .metric-grid, .visual-grid, .analysis-card, .gap-card, .ai-preview, .preview-footer { width: min(100%, 1320px); margin-inline: auto; }.preview-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }.preview-brand, .preview-actions, .preview-brand > div, .card-heading, .ai-heading, .preview-footer, .legend-item { display: flex; align-items: center; }.preview-brand { gap: 11px; }.preview-brand > div { flex-direction: column; align-items: flex-start; gap: 2px; }.preview-brand strong { font-size: 1.05rem; }.preview-brand span { color: var(--preview-muted); font-size: .85rem; }.preview-actions { gap: 14px; }.demo-chip, .ai-status { display: inline-flex; align-items: center; gap: 5px; padding: 7px 10px; border: 1px solid #cadbce; border-radius: 999px; background: #edf5ef; color: #35604f; font-size: .85rem; font-weight: 700; }.preview-login { display: inline-flex; min-height: 42px; align-items: center; gap: 7px; padding: 0 14px; border: 1px solid #1f5a4a; border-radius: 8px; color: #1f5a4a; font-size: .85rem; font-weight: 800; text-decoration: none; }.preview-login:hover { background: #e6f0e8; }
.preview-demo-notice { width: min(100%, 1320px); margin: 18px auto 0; padding: 11px 14px; border: 1px solid #ead9b8; border-radius: 8px; background: #fff8e9; color: #805c1c; font-size: .88rem; line-height: 1.5; }
.preview-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; padding: 70px 0 34px; }.eyebrow { margin: 0 0 8px; color: #567467; font-size: .85rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }.preview-hero h1 { margin: 0; font-size: 3rem; letter-spacing: 0; line-height: 1.12; }.hero-copy { margin: 16px 0 0; color: #4e5e56; font-size: 1.1rem; line-height: 1.6; }.hero-meta { display: grid; min-width: 188px; gap: 5px; padding: 15px 18px; border-left: 3px solid #c18420; background: #fffdf6; }.hero-meta span, .hero-meta small { color: var(--preview-muted); font-size: .85rem; }.hero-meta strong { font-size: .98rem; }
.metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; }.metric-card { display: grid; min-height: 126px; gap: 8px; padding: 18px 19px; border: 1px solid var(--preview-line); border-radius: 8px; background: var(--preview-card); box-shadow: 0 8px 20px rgb(39 61 49 / 4%); }.metric-card span, .metric-card small { color: var(--preview-muted); font-size: .85rem; }.metric-card strong { font-size: 1.55rem; letter-spacing: 0; font-variant-numeric: tabular-nums; }.metric-card.accent-amount { border-top: 3px solid #c18420; }.metric-card.accent-price { border-top: 3px solid #1f7257; }.metric-card.accent-orders { border-top: 3px solid #bd6048; }
.visual-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(310px, .85fr); gap: 16px; margin-top: 16px; }.preview-card { padding: 21px; border: 1px solid var(--preview-line); border-radius: 8px; background: var(--preview-card); box-shadow: 0 8px 20px rgb(39 61 49 / 4%); }.card-heading { justify-content: space-between; gap: 18px; margin-bottom: 18px; }.card-heading h2, .ai-heading h2 { margin: 0; font-size: 1.1rem; }.heading-note { color: var(--preview-muted); font-size: .85rem; }.chart-wrap { min-height: 260px; }.preview-line-chart { width: 100%; height: 260px; overflow: visible; }.chart-grid line { stroke: #dfe7e1; stroke-dasharray: 3 5; }.chart-grid text, .chart-x-labels text { fill: #5c6b63; font-size: 15px; }.price-line { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }.preview-line-chart circle { stroke: white; stroke-width: 2; }.price-hit { fill: transparent; stroke: none; pointer-events: all; }.legend-row { margin-top: 2px; }.legend-item { gap: 7px; color: #53645b; font-size: .85rem; }.legend-item i { width: 9px; height: 9px; border-radius: 50%; }
.share-layout { display: grid; grid-template-columns: minmax(150px, .9fr) minmax(130px, 1.1fr); align-items: center; gap: 18px; min-height: 260px; }.share-ring { position: relative; width: min(100%, 215px); aspect-ratio: 1; margin-inline: auto; }.share-ring-chart { width: 100%; height: 100%; transform: rotate(-90deg); }.share-ring-track, .share-ring-segment { fill: none; stroke-width: 15; }.share-ring-track { stroke: #e7ece8; }.share-ring-segment { transition: stroke-width 160ms ease; }.share-ring-segment:hover { stroke-width: 18; }.ring-center { position: absolute; z-index: 1; inset: 0; display: grid; place-content: center; pointer-events: none; text-align: center; }.ring-center strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; }.ring-center span { color: var(--preview-muted); font-size: .85rem; }.share-list { display: grid; gap: 17px; margin: 0; padding: 0; list-style: none; }.share-list li { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; }.share-list li strong { font-size: .96rem; }.share-list li small { grid-column: 1 / -1; color: var(--preview-muted); font-size: .85rem; }.chart-caption { margin: 3px 0 0; padding-top: 12px; border-top: 1px solid var(--preview-line); color: var(--preview-muted); font-size: .85rem; line-height: 1.5; }
.analysis-card, .gap-card { margin-top: 16px; }.grade-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }.grade-tab { display: inline-flex; min-height: 42px; align-items: center; gap: 8px; padding: 0 13px; border: 1px solid var(--preview-line); border-radius: 8px; background: #fff; color: #53645b; font-size: .85rem; font-weight: 800; }.grade-tab span { width: 9px; height: 9px; border-radius: 50%; }.grade-tab.active { border-color: #1f5a4a; background: #e8f1e9; color: #1f5a4a; }.table-wrap { overflow-x: auto; } table { width: 100%; min-width: 680px; border-collapse: collapse; font-size: .85rem; } th, td { padding: 12px 10px; border-bottom: 1px solid var(--preview-line); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } th:first-child, td:first-child { text-align: left; } thead th { color: var(--preview-muted); font-size: .85rem; font-weight: 700; } tbody th { font-weight: 800; }.table-price, .gap-value { color: #1f5a4a; font-weight: 800; }.total-row th, .total-row td { border-bottom: 0; background: #f1f6f1; font-weight: 800; }.discount-pill { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #fff2dc; color: #976014; font-weight: 800; }
.ai-preview { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 15px; margin-top: 16px; padding: 22px; border: 1px solid #cbded0; border-radius: 8px; background: #eaf3eb; }.ai-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 8px; background: #1f5a4a; color: white; }.ai-heading { justify-content: space-between; gap: 18px; }.ai-summary { margin: 13px 0; color: #274e3f; font-size: 1rem; font-weight: 800; line-height: 1.6; }.ai-points { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }.ai-points p { margin: 0; color: #4e6559; font-size: .85rem; line-height: 1.65; }.ai-points strong { color: #214e3c; margin-right: 5px; }
.preview-footer { justify-content: space-between; gap: 15px; padding-top: 22px; color: var(--preview-muted); font-size: .85rem; }.preview-footer a { display: inline-flex; align-items: center; gap: 5px; color: #1f5a4a; font-weight: 800; text-decoration: none; }.footer-export { display: inline-flex; align-items: center; gap: 5px; }
@media (max-width: 860px) { .preview-hero { align-items: flex-start; flex-direction: column; padding-top: 48px; }.hero-meta { width: 100%; }.metric-grid { grid-template-columns: repeat(2, 1fr); }.visual-grid { grid-template-columns: 1fr; }.ai-points { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .preview-page { padding: 17px 14px 30px; }.preview-header { align-items: flex-start; flex-direction: column; }.preview-actions { width: 100%; justify-content: space-between; }.preview-login { flex: 1; justify-content: center; }.preview-hero { padding-top: 38px; }.preview-hero h1 { font-size: 2.1rem; }.metric-grid { gap: 9px; }.metric-card { min-height: 112px; padding: 14px; }.metric-card strong { font-size: 1.2rem; }.preview-card, .ai-preview { padding: 16px; }.share-layout { grid-template-columns: 1fr; min-height: unset; }.share-ring { width: 170px; }.share-list { grid-template-columns: repeat(3, 1fr); gap: 8px; }.share-list li { display: block; }.share-list li strong, .share-list li small { display: block; margin-top: 4px; }.preview-footer { align-items: flex-start; flex-direction: column; }.heading-note { display: none; } }
</style>
