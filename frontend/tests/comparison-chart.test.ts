import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { metricMaximum, relativeBarWidth } from '../src/utils/comparisonChart.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

test('normalizes comparison bars against the selected maximum', () => {
  assert.equal(metricMaximum([10, 25, null]), 25)
  assert.equal(relativeBarWidth(10, 25), 40)
  assert.equal(relativeBarWidth(100, 25), 100)
  assert.equal(relativeBarWidth(null, 25), 0)
})

test('价格柱状图的柱高容器必须拉伸，否则百分比高度会塌成细线', () => {
  const chart = fs.readFileSync(path.join(src, 'components', 'SeriesGradePriceChart.vue'), 'utf8')
  const barTrack = chart.match(/\.price-bars \{[^}]*\}/)?.[0] ?? ''

  assert.match(barTrack, /align-items:\s*stretch/)
  assert.match(barTrack, /min-height:\s*\d+px/)
  assert.doesNotMatch(barTrack, /align-items:\s*flex-end/)
})

test('价格柱状图的柱区与左侧刻度等高，柱顶才对得上刻度线', () => {
  const chart = fs.readFileSync(path.join(src, 'components', 'SeriesGradePriceChart.vue'), 'utf8')
  const bars = chart.match(/\.price-bars \{[^}]*\}/)?.[0] ?? ''
  const axis = chart.match(/\.price-axis \{[^}]*\}/)?.[0] ?? ''
  const gridLines = chart.match(/\.price-grid-lines \{[^}]*\}/)?.[0] ?? ''
  const heightOf = (rule: string) => rule.match(/height:\s*(\d+)px/)?.[1]

  assert.ok(heightOf(bars), '柱区必须有确定高度，否则柱高百分比无处计算')
  assert.equal(heightOf(axis), heightOf(bars))
  assert.equal(heightOf(gridLines), heightOf(bars))
})

test('所选结算单总览以商号作为首列', () => {
  const table = fs.readFileSync(path.join(src, 'components', 'SeriesOverviewTable.vue'), 'utf8')
  const columns = table.match(/return \[\n([\s\S]*?)\n  \]/)?.[1] ?? ''

  // 首列是商号（行标题 + 加粗），单号并进同一单元格而不是单独占列。
  assert.match(columns, /key: 'merchant', label: '商号', rowHeader: true, emphasis: true/)
  assert.doesNotMatch(columns, /label: '单号'/)
  assert.match(table, /displayOrderNo\(row\)/)
})
