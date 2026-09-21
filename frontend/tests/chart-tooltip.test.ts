import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (file: string) => fs.readFileSync(path.join(src, file), 'utf8')

/** 所有需要「鼠标悬浮出提示」的图表组件与页面。 */
const chartFiles = [
  'components/GradeSummary.vue',
  'components/SeriesGradeDetail.vue',
  'components/SeriesOverviewTable.vue',
  'views/PublicPreviewView.vue',
]

/** 有颜色/形状编码的图表必须给出图例；卡片和表格自带表头说明，不在此列。 */
const chartsWithLegend = [
  'components/GradePieChart.vue',
  'components/SeriesGradeDetail.vue',
  'views/PublicPreviewView.vue',
]

test('每个图表都接入统一的悬浮提示', () => {
  for (const file of chartFiles) {
    const source = read(file)
    assert.match(source, /import ChartTooltip from/, `${file} 未引入 ChartTooltip`)
    assert.match(source, /useChartTooltip\(\)/, `${file} 未创建 tooltip 状态`)
    assert.match(source, /@mouseenter=/, `${file} 缺少鼠标移入处理`)
    assert.match(source, /@mousemove=/, `${file} 缺少鼠标跟随处理`)
    assert.match(source, /@mouseleave=/, `${file} 缺少鼠标移出处理`)
    assert.match(source, /<ChartTooltip :tooltip="tooltip" \/>/, `${file} 未挂载 ChartTooltip`)
  }
})

test('每个图表都有图例', () => {
  for (const file of chartsWithLegend) {
    assert.match(read(file), /ChartLegend|pie-legend|share-legend/, `${file} 缺少图例`)
  }
})

test('ECharts 图表通过统一封装接入并包含图例', () => {
  const base = read('components/BaseEChart.vue')

  const echartsCharts = [
    'components/TrendChart.vue',
    'components/GradePieChart.vue',
    'components/SeriesGradePriceChart.vue',
    'components/SeriesGradeShareChart.vue',
  ]

  for (const file of echartsCharts) {
    const source = read(file)
    assert.match(source, /import BaseEChart from/, `${file} 未接入统一 ECharts 封装`)
    assert.match(source, /legend: \{|pie-legend/, `${file} 未配置图例`)
  }

  assert.match(base, /echarts\/core/, 'BaseEChart 未使用 ECharts 核心包')
  assert.match(base, /CanvasRenderer/, 'BaseEChart 未启用 Canvas 渲染')
})

test('图表不再依赖浏览器原生 title 作为提示', () => {
  for (const file of chartFiles) {
    assert.doesNotMatch(read(file), /<title>/, `${file} 仍在使用原生 title 提示`)
  }
})

test('悬浮提示组件通过 Teleport 挂到 body，避免被图表容器裁切', () => {
  const component = read('components/ChartTooltip.vue')

  assert.match(component, /<Teleport to="body">/)
  assert.match(component, /role="tooltip"/)
  assert.match(component, /tooltip\.title/)
  assert.match(component, /tooltip\.rows/)
})

test('图例组件同时渲染色标与文字，并带无障碍名称', () => {
  const legend = read('components/ChartLegend.vue')

  assert.match(legend, /class="chart-legend"/)
  assert.match(legend, /aria-label/)
  assert.match(legend, /chart-legend-mark/)
  assert.match(legend, /chart-legend-item/)
})

test('提示定位跟随鼠标并做视口避让', () => {
  const tooltip = read('utils/chartTooltip.ts')

  assert.match(tooltip, /event\.clientX/)
  assert.match(tooltip, /event\.clientY/)
  assert.match(tooltip, /window\.innerWidth/)
  assert.match(tooltip, /window\.innerHeight/)
  assert.match(tooltip, /visible: true/)
})

test('提示样式为固定定位且不遮挡鼠标', () => {
  const styles = read('styles-dashboard.css')

  assert.match(styles, /\.chart-tooltip \{[^}]*position: fixed/)
  assert.match(styles, /\.chart-tooltip \{[^}]*pointer-events: none/)
  assert.match(styles, /\.chart-legend \{/)
})
