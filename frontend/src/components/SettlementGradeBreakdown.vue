<script setup lang="ts">
import { computed } from 'vue'

import type { Grade, GradeMetric, SettlementRecord } from '../api/client'
import { gradeLabel } from '../api/client'
import { activeGrades, gradeColors } from '../utils/grades'
import { formatNumber, formatPercent, formatPrice } from '../utils/format'
import GradePieChart from './GradePieChart.vue'

const props = defineProps<{
  grades: GradeMetric[]
  records: SettlementRecord[]
  loading?: boolean
  gradeOrder?: Grade[]
  /** 区块标题；两个页面共用组件，标题随页面传入。 */
  title?: string
  /** 详情页（单张结算单）传入的品牌：优先于记录级 brand，避免详情记录无 brand 时落到「未识别品牌」。 */
  brand?: string
  /** overview：「卖得怎么样」版式——删均价图、规格表（方案A）整行展示；品牌柜数统计在「市场销售分析」块。 */
  variant?: 'detail' | 'overview'
}>()

const isOverview = computed(() => props.variant === 'overview')

const priceGradeOrder = computed(() => props.gradeOrder ?? activeGrades(props.grades))
const specGradeOrder = computed(() => props.gradeOrder ?? activeGrades(props.records))

const sectionTitle = computed(() => props.title ?? '等级图表')

const totalQuantity = computed(() =>
  props.records.reduce((total, record) => total + record.quantity, 0),
)

/** 规格表（方案A，两页共用）：一行 = 品牌+等级+头数+KG+备注，相同组合合并统计；
 *  按 品牌×等级 给小计、表底给合计，小计/合计的每件均价按金额加权；
 *  类别（品牌×等级）按小计件数从多到少排，类别内行按件数从多到少排（同件数回退原有字典序）。 */
type OverviewSpecRow = {
  brand: string
  grade: Grade
  head: string
  kg: string
  remark: string
  quantity: number
  amount: number
  share: number | null
  price: number | null
}
type OverviewSpecGroup = {
  key: string
  brand: string
  grade: Grade
  rows: OverviewSpecRow[]
  quantity: number
  amount: number
  price: number | null
}

const overviewSpecGroups = computed<OverviewSpecGroup[]>(() => {
  const grouped = new Map<string, OverviewSpecRow>()
  props.records.forEach((record) => {
    const grade = record.grade
    if (!grade || !specGradeOrder.value.includes(grade)) return
    const brand = props.brand?.trim() || record.brand.trim() || '未识别品牌'
    const head = record.headCount?.trim() ?? ''
    const kg = record.specKg?.trim() ?? ''
    const remark = record.remark?.trim() ?? ''
    const key = `${brand}::${grade}::${head}::${kg}::${remark}`
    const current = grouped.get(key)
    if (current) {
      current.quantity += record.quantity
      current.amount += record.amount
      return
    }
    grouped.set(key, { brand, grade, head, kg, remark, quantity: record.quantity, amount: record.amount, share: null, price: null })
  })
  const rows = [...grouped.values()]
    .map((row) => ({
      ...row,
      share: totalQuantity.value ? row.quantity / totalQuantity.value : null,
      price: row.quantity ? row.amount / row.quantity : null,
    }))
    .sort((left, right) => {
      if (left.quantity !== right.quantity) return right.quantity - left.quantity
      if (left.brand !== right.brand) return left.brand.localeCompare(right.brand, 'zh-Hans-CN')
      if (left.grade !== right.grade) return specGradeOrder.value.indexOf(left.grade) - specGradeOrder.value.indexOf(right.grade)
      if (left.head !== right.head) return left.head.localeCompare(right.head, 'zh-Hans-CN', { numeric: true })
      if (left.kg !== right.kg) return left.kg.localeCompare(right.kg, 'zh-Hans-CN', { numeric: true })
      return left.remark.localeCompare(right.remark, 'zh-Hans-CN')
    })
  const groupKeys = new Map<string, { brand: string; grade: Grade }>()
  rows.forEach((row) => groupKeys.set(`${row.brand}::${row.grade}`, { brand: row.brand, grade: row.grade }))
  return [...groupKeys.entries()]
    .map(([key, { brand, grade }]) => {
      const groupRows = rows.filter((row) => row.brand === brand && row.grade === grade)
      const quantity = groupRows.reduce((total, row) => total + row.quantity, 0)
      const amount = groupRows.reduce((total, row) => total + row.amount, 0)
      return { key, brand, grade, rows: groupRows, quantity, amount, price: quantity ? amount / quantity : null }
    })
    .filter((group) => group.rows.length > 0)
    .sort((left, right) => {
      if (left.quantity !== right.quantity) return right.quantity - left.quantity
      if (left.brand !== right.brand) return left.brand.localeCompare(right.brand, 'zh-Hans-CN')
      return specGradeOrder.value.indexOf(left.grade) - specGradeOrder.value.indexOf(right.grade)
    })
})

const overviewSpecTotal = computed(() => {
  const quantity = overviewSpecGroups.value.reduce((total, group) => total + group.quantity, 0)
  const amount = overviewSpecGroups.value.reduce((total, group) => total + group.amount, 0)
  return { quantity, price: quantity ? amount / quantity : null }
})

const hasOverviewSpecRows = computed(() =>
  overviewSpecGroups.value.some((group) => group.rows.length > 0),
)

function overviewBarWidth(share: number | null): string {
  return `${Math.max((share ?? 0) * 100, 0.8)}%`
}

const GRADE_BADGE_BACKGROUNDS: Record<Grade, string> = {
  A: '#e8f4ef',
  B: '#faf1e4',
  AB: '#f5f1e3',
  C: '#faece9',
  D: '#e9f1f6',
  E: '#f1ecf7',
  F: '#f8eaf1',
  OTHER: '#eef1f3',
}

</script>

<template>
  <section class="dashboard-section settlement-grade-breakdown" aria-labelledby="settlement-grade-breakdown-title">
    <header class="section-heading">
      <div>
        <h2 id="settlement-grade-breakdown-title">{{ sectionTitle }}</h2>
      </div>
    </header>

    <div v-if="loading" class="breakdown-skeleton skeleton-block">正在加载等级图表</div>
    <template v-else>
      <div class="breakdown-grid" :class="{ 'breakdown-grid--overview': isOverview }">
        <!-- 饼图（件数结构）仅「卖得怎么样」保留；结算单详情已按用户要求删除件数结构与均价两图。 -->
        <div v-if="isOverview" class="chart-block pie-chart-block">
          <GradePieChart
            :grades="grades"
            :loading="false"
            :grade-order="priceGradeOrder"
            height="176px"
          />
        </div>

        <!-- overview 专属：与饼图同行的附加图（卖得怎么样传入「每日销售金额」折线图）。 -->
        <div v-if="isOverview" class="chart-block overview-aside-block">
          <slot name="overview-aside" />
        </div>

        <section class="chart-block spec-block" aria-label="规格件数与均价">
          <header v-if="isOverview" class="block-heading">
            <div>
              <h3 id="grade-spec-title">规格件数与均价</h3>
            </div>
          </header>

          <div v-if="!hasOverviewSpecRows" class="empty-inline">{{ isOverview ? '当前筛选范围没有可统计的规格数据' : '当前结算单没有可统计的规格数据' }}</div>
          <div v-else class="spec-table-wrap">
            <table class="spec-table">
              <thead>
                <tr>
                  <th>品牌</th>
                  <th>等级</th>
                  <th>头数</th>
                  <th>KG</th>
                  <th>备注</th>
                  <th>总件数</th>
                  <th>每件均价</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in overviewSpecGroups" :key="group.key">
                  <tr v-for="row in group.rows" :key="`${row.brand}-${row.grade}-${row.head}-${row.kg}-${row.remark || 'none'}`">
                    <td class="spec-brand">{{ row.brand }}</td>
                    <td>
                      <span
                        class="spec-badge"
                        :style="{ color: gradeColors[row.grade], backgroundColor: GRADE_BADGE_BACKGROUNDS[row.grade] }"
                      >{{ gradeLabel(row.grade) }}</span>
                    </td>
                    <td class="spec-cell">{{ row.head || '—' }}</td>
                    <td class="spec-cell">{{ row.kg || '—' }}</td>
                    <td><span class="spec-remark" :class="{ 'spec-remark--empty': !row.remark }">{{ row.remark || '—' }}</span></td>
                    <td>
                      <div class="spec-qty">
                        <b>{{ formatNumber(row.quantity) }}</b>
                        <small>件 · 占比 {{ formatPercent(row.share) }}</small>
                        <span class="spec-mini-track">
                          <i class="spec-mini" :style="{ width: overviewBarWidth(row.share), backgroundColor: gradeColors[row.grade] }" />
                        </span>
                      </div>
                    </td>
                    <td class="spec-price">{{ formatPrice(row.price) }}</td>
                  </tr>
                  <tr class="spec-subtotal">
                    <td colspan="5">小计 · {{ group.brand }} {{ gradeLabel(group.grade) }}</td>
                    <td><b>{{ formatNumber(group.quantity) }}</b> <small>件</small></td>
                    <td class="spec-price"><b>{{ formatPrice(group.price) }}</b></td>
                  </tr>
                </template>
                <tr class="spec-total">
                  <td colspan="5">合计 · 全部品牌等级</td>
                  <td><b>{{ formatNumber(overviewSpecTotal.quantity) }}</b> <small>件</small></td>
                  <td><b>{{ formatPrice(overviewSpecTotal.price) }}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.settlement-grade-breakdown { gap: 14px; }
.breakdown-skeleton { min-height: 180px; }
.breakdown-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: stretch; }
.chart-block { display: flex; min-width: 0; flex-direction: column; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.block-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.block-heading h3 { margin: 0; font-size: 1rem; }
.block-heading span,
.block-heading p { margin: 0; color: var(--muted); font-size: .82rem; }
.pie-chart-block :deep(.grade-pie-section) { display: flex; flex: 1; flex-direction: column; padding: 0; border-top: 0; }
.pie-chart-block :deep(.section-heading) { margin-bottom: 8px; }
.pie-chart-block :deep(.section-heading h2) { margin: 0; font-size: 1rem; }
.pie-chart-block :deep(.pie-layout) { flex: 1; align-content: center; min-height: 116px; gap: 8px; }
.spec-block { padding: 10px; }

/* 规格表（方案A，两页共用）：品牌+等级+头数+KG+备注 一行一个组合，含小计与合计；
   全部字段内容居中（用户要求，不按数字右对齐）。 */
.spec-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); }
.spec-table { width: 100%; min-width: 700px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.spec-table thead th {
  padding: 8px 10px;
  background: #1f2923;
  color: #fff;
  font-size: .8rem;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}
.spec-table tbody td { padding: 7px 10px; border-top: 1px solid var(--line); font-size: .88rem; vertical-align: middle; text-align: center; }
.spec-table tbody tr:nth-child(even) { background: #fafcfa; }
.spec-table tbody tr:hover { background: #eef6f0; }
.spec-brand { font-weight: 700; white-space: nowrap; }
.spec-badge { display: inline-block; min-width: 3.2em; padding: 1px 8px; border-radius: 6px; font-size: .82rem; font-weight: 800; text-align: center; }
.spec-cell { font-weight: 800; }
.spec-remark {
  display: inline-block;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #f1f4f2;
  color: #41544a;
  font-size: .82rem;
  white-space: nowrap;
}
.spec-remark--empty { border-color: transparent; background: none; color: var(--muted); }
.spec-qty { text-align: center; }
.spec-qty b { font-size: .95rem; }
.spec-qty small { color: var(--muted); }
.spec-mini-track { display: block; height: 4px; margin-top: 3px; border-radius: 999px; background: var(--surface-soft); overflow: hidden; }
.spec-mini { display: block; height: 100%; border-radius: 999px; }
.spec-price { color: var(--primary-dark); font-weight: 800; }
.spec-table .spec-subtotal td { padding: 6px 10px; border-top: 1px solid var(--line-strong); background: var(--surface-soft); color: var(--muted); font-size: .84rem; text-align: center; }
.spec-table .spec-subtotal td b { color: var(--ink); }
.spec-table .spec-total td { padding: 8px 10px; border-top: none; background: #173c2c; color: #fff; font-size: .9rem; text-align: center; }
.spec-table .spec-total td b,
.spec-table .spec-total td small,
.spec-table .spec-total .spec-price { color: #fff; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }

@media (min-width: 900px) {
  .breakdown-grid { grid-template-columns: minmax(240px, .78fr) minmax(300px, 1.22fr); }
  .spec-block { grid-column: 1 / -1; }
  /* overview：饼图与「每日销售金额」折线图同行（.58fr/1.42fr），规格长表独占下一行全宽；
     品牌柜数统计已移至「市场销售分析」块。 */
  .breakdown-grid--overview { grid-template-columns: minmax(220px, .58fr) minmax(0, 1.42fr); }
  .breakdown-grid--overview .pie-chart-block { grid-row: 1; }
  .breakdown-grid--overview .overview-aside-block { grid-row: 1; grid-column: 2; }
  .breakdown-grid--overview .spec-block { grid-column: 1 / -1; grid-row: 2; }
}

@media (max-width: 899px) {
  .breakdown-grid--overview { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 820px) {
  .spec-table { min-width: 640px; }
}
</style>
