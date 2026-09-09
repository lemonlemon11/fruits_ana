import assert from 'node:assert/strict'
import test from 'node:test'

import { metricMaximum, relativeBarWidth } from '../src/utils/comparisonChart.ts'

test('normalizes comparison bars against the selected maximum', () => {
  assert.equal(metricMaximum([10, 25, null]), 25)
  assert.equal(relativeBarWidth(10, 25), 40)
  assert.equal(relativeBarWidth(100, 25), 100)
  assert.equal(relativeBarWidth(null, 25), 0)
})
