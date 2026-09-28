<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'

import type { BrandMarketContainerStat } from '../api/client'
import { echartTheme } from '../utils/echartTheme'
import { formatNumber, formatPercent } from '../utils/format'
import { monthBounds, yearBounds } from '../utils/salePeriods.ts'
import DeferredEChart from './DeferredEChart.vue'

const props = defineProps<{
  rows: BrandMarketContainerStat[]
  startDate?: string
  endDate?: string
  loading?: boolean
}>()

// 市场与品牌共用一套色板（按出现顺序取色，保证同一市场在各图中颜色一致）。
const PALETTE = ['#16856b', '#bd7414', '#2f6f8f', '#7a5aa6', '#b94a3c', '#8a6f2f', '#b34f82', '#6e7780']

/** 标题期间跟随筛选：年边界→「2026年」，月边界→「2026年9月」，其余→起止区间。 */
const periodLabel = computed(() => {
  const start = props.startDate
  const end = props.endDate
  if (!start || !end) return '全部期间'
  const monthMatch = /^(\d{4})-(\d{2})/.exec(start)
  if (monthMatch) {
    const month = monthBounds(`${monthMatch[1]}-${monthMatch[2]}`)
    if (month && month.start === start && month.end === end) {
      return `${monthMatch[1]}年${Number(monthMatch[2])}月`
    }
    const year = yearBounds(Number(monthMatch[1]))
    if (year.start === start && year.end === end) return `${monthMatch[1]}年`
  }
  return `${start} 至 ${end}`
})

const markets = computed(() => {
  const seen = new Set<string>()
  props.rows.forEach((row) => seen.add(row.market))
  return [...seen]
})

/** 跟随市场筛选：只返回一个市场时按单市场（参考稿样式）展示，多市场时同图分组对比。 */
const isSingleMarket = computed(() => markets.value.length === 1)
const marketName = computed(() => markets.value[0] ?? '')

const marketTotals = computed(() =>
  markets.value.map((market) => ({
    market,
    count: props.rows
      .filter((row) => row.market === market)
      .reduce((total, row) => total + row.containerCount, 0),
  })),
)
const totalCount = computed(() =>
  props.rows.reduce((total, row) => total + row.containerCount, 0),
)

const chartTitle = computed(() =>
  isSingleMarket.value
    ? `${periodLabel.value} ${marketName.value}档口销售柜数统计（合计 ${formatNumber(totalCount.value)} 柜）`
    : `${periodLabel.value} 全部市场销售柜数统计（合计 ${formatNumber(totalCount.value)} 柜）`,
)

function marketColor(market: string): string {
  return PALETTE[markets.value.indexOf(market) % PALETTE.length]
}

/** 单市场：品牌维度；全部市场：市场维度。图例与饼图共用同一口径。 */
const legendRows = computed(() => {
  if (isSingleMarket.value) {
    const rows = props.rows.filter((row) => row.market === marketName.value)
    return rows.map((row, index) => ({
      key: row.brand,
      color: PALETTE[(markets.value.length + index) % PALETTE.length],
      label: row.brand,
      count: row.containerCount,
    }))
  }
  return marketTotals.value.map((row) => ({
    key: row.market,
    color: marketColor(row.market),
    label: row.market,
    count: row.count,
  }))
})

function share(count: number): number {
  return totalCount.value ? count / totalCount.value : 0
}

const pieTitleLabel = computed(() => (isSingleMarket.value ? '各品牌柜数占比' : '各市场柜数占比'))

const pieOption = computed<EChartsOption>(() => {
  const rows = legendRows.value
  const maxCount = Math.max(0, ...rows.map((row) => row.count))
  return {
    aria: { enabled: true },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as { data?: { label: string; count: number } }
        const data = item.data
        if (!data) return ''
        return [
          `<strong>${data.label}</strong>`,
          `<span>柜数占比：${formatPercent(share(data.count))}</span>`,
          `<span>柜数：${formatNumber(data.count)} 柜</span>`,
        ].join('<br/>')
      },
    },
    title: {
      text: formatNumber(totalCount.value),
      subtext: '总柜数',
      left: 'center',
      top: '38%',
      textStyle: { color: echartTheme.ink, fontSize: 16, fontWeight: 800 },
      subtextStyle: { color: echartTheme.muted, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '50%'],
        // 参考稿：最大扇区外扩突出。
        selectedMode: 'single',
        selectedOffset: 10,
        data: rows.map((row) => ({
          name: row.label,
          value: row.count,
          label: row.label,
          count: row.count,
          selected: rows.length > 1 && row.count === maxCount,
          itemStyle: { color: row.color },
        })),
        label: { show: false },
        emphasis: { scaleSize: 4 },
      },
    ],
  }
})

const barOption = computed<EChartsOption>(() => {
  const valueLabel = {
    show: true,
    position: 'top' as const,
    color: echartTheme.ink,
    fontWeight: 800,
    formatter: (params: unknown) => {
      const item = params as { value?: number }
      const value = Number(item.value ?? 0)
      return value > 0 ? `${formatNumber(value)} 柜` : ''
    },
  }
  if (isSingleMarket.value) {
    const rows = legendRows.value
    return {
      aria: { enabled: true },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? (params as Array<{ name?: string; value?: number }>) : []
          const item = items[0]
          if (!item) return ''
          return `<strong>${item.name ?? ''}</strong><br/><span>${formatNumber(Number(item.value ?? 0))} 柜</span>`
        },
      },
      grid: { left: 6, right: 6, top: 34, bottom: 2, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: echartTheme.lineStrong } },
        axisLabel: { color: echartTheme.ink, fontWeight: 700 },
      },
      yAxis: {
        type: 'value',
        name: '柜数',
        minInterval: 1,
        nameTextStyle: { color: echartTheme.muted },
        axisLabel: { color: echartTheme.muted },
        splitLine: { lineStyle: { color: echartTheme.line } },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 42,
          data: rows.map((row) => ({
            value: row.count,
            itemStyle: { color: row.color, borderRadius: [4, 4, 0, 0] },
          })),
          label: valueLabel,
        },
      ],
    }
  }
  // 全部市场：同一柱状图内按市场分组对比各品牌。
  const brands = [...new Set(props.rows.map((row) => row.brand))]
  const brandOrder = brands
    .map((brand) => ({
      brand,
      count: props.rows
        .filter((row) => row.brand === brand)
        .reduce((total, row) => total + row.containerCount, 0),
    }))
    .sort((left, right) => right.count - left.count)
    .map((row) => row.brand)
  return {
    aria: { enabled: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = Array.isArray(params)
          ? (params as Array<{ seriesName?: string; value?: number; marker?: string }>)
          : []
        const lines = items
          .filter((item) => Number(item.value ?? 0) > 0)
          .map((item) => `${item.marker ?? ''}${item.seriesName ?? ''}：${formatNumber(Number(item.value ?? 0))} 柜`)
        return lines.length ? `<strong>${items[0]?.name ?? ''}</strong><br/>${lines.join('<br/>')}` : ''
      },
    },
    legend: {
      top: 0,
      textStyle: { color: echartTheme.muted },
    },
    grid: { left: 6, right: 6, top: 44, bottom: 2, containLabel: true },
    xAxis: {
      type: 'category',
      data: brandOrder,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: echartTheme.lineStrong } },
      axisLabel: { color: echartTheme.ink, fontWeight: 700 },
    },
    yAxis: {
      type: 'value',
      name: '柜数',
      minInterval: 1,
      nameTextStyle: { color: echartTheme.muted },
      axisLabel: { color: echartTheme.muted },
      splitLine: { lineStyle: { color: echartTheme.line } },
    },
    series: markets.value.map((market) => ({
      name: market,
      type: 'bar' as const,
      barMaxWidth: 34,
      barGap: '30%',
      // 颜色必须设在系列级：图例与 tooltip marker 只取系列颜色，数据级 itemStyle 不生效。
      itemStyle: { color: marketColor(market), borderRadius: [4, 4, 0, 0] },
      data: brandOrder.map((brand) => {
        const row = props.rows.find((item) => item.market === market && item.brand === brand)
        return row?.containerCount ?? 0
      }),
      label: valueLabel,
    })),
  }
})

const pieAriaLabel = computed(() =>
  `${legendRows.value.map((row) => `${row.label} ${row.count} 柜`).join('、')}，${pieTitleLabel.value}环形图`,
)
const barAriaLabel = computed(() =>
  isSingleMarket.value
    ? `${legendRows.value.map((row) => `${row.label} ${row.count} 柜`).join('、')}，各品牌柜数对比柱状图`
    : `${marketTotals.value.map((row) => `${row.market} ${row.count} 柜`).join('、')}，各品牌分市场柜数对比分组柱状图`,
)
</script>

<template>
  <section class="dashboard-section market-sales-analysis" aria-labelledby="market-sales-title">
    <header class="section-heading">
      <div>
        <h2 id="market-sales-title">市场销售分析</h2>
        <p class="section-note">柜数按市场、品牌统计结算单（商号）数量，跟随顶部市场筛选</p>
      </div>
    </header>

    <div v-if="loading" class="market-skeleton skeleton-block" aria-live="polite">正在加载市场销售分析</div>
    <div v-else-if="!rows.length" class="empty-inline">当前筛选范围没有可统计的柜数数据</div>
    <template v-else>
      <p class="market-chart-title">{{ chartTitle }}</p>
      <div class="market-charts">
        <div class="market-chart market-chart--pie">
          <h3>{{ isSingleMarket ? `${marketName}档口${pieTitleLabel}` : pieTitleLabel }}</h3>
          <div class="market-pie-layout">
            <DeferredEChart :option="pieOption" height="190px" :aria-label="pieAriaLabel" />
            <ul class="market-legend" aria-label="柜数明细">
              <li v-for="row in legendRows" :key="row.key">
                <span class="pie-dot" :style="{ backgroundColor: row.color }" aria-hidden="true" />
                <span class="market-legend-name">{{ row.label }}</span>
                <strong>{{ formatPercent(share(row.count)) }}</strong>
                <small>{{ formatNumber(row.count) }} 柜</small>
              </li>
            </ul>
          </div>
        </div>
        <div class="market-chart market-chart--bar">
          <h3>{{ isSingleMarket ? `${marketName}档口各品牌柜数对比` : '各品牌分市场柜数对比' }}</h3>
          <DeferredEChart :option="barOption" height="190px" :aria-label="barAriaLabel" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.market-sales-analysis { min-width: 0; }
.market-skeleton { min-height: 240px; }
.market-chart-title {
  margin: 0 0 10px;
  color: var(--primary-dark);
  font-size: 1rem;
  font-weight: 800;
  text-align: center;
}
.market-charts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.market-chart {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}
.market-chart h3 { margin: 0; color: var(--ink); font-size: .9rem; }
.market-pie-layout {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr);
  align-items: center;
  gap: 10px;
}
.market-legend { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.market-legend li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 6px; }
.market-legend .pie-dot { width: 10px; height: 10px; border-radius: 50%; }
.market-legend-name { overflow: hidden; font-size: .84rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.market-legend strong { text-align: right; font-variant-numeric: tabular-nums; }
.market-legend small { grid-column: 2 / 4; margin-top: -4px; color: var(--muted); font-size: .78rem; }
.empty-inline { padding: 12px 2px; color: var(--muted); font-size: .9rem; }

@media (max-width: 820px) {
  .market-charts { grid-template-columns: minmax(0, 1fr); }
  .market-pie-layout { grid-template-columns: minmax(110px, .9fr) minmax(0, 1.1fr); }
}
</style>
