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
