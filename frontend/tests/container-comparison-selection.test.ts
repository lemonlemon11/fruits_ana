import assert from 'node:assert/strict'
import test from 'node:test'

import { initialComparisonSelection, toggleComparisonSelection } from '../src/utils/containerComparison.ts'

test('defaults to two containers and caps selection at three', () => {
  const items = [{ containerId: 'A' }, { containerId: 'B' }, { containerId: 'C' }, { containerId: 'D' }] as never[]
  assert.deepEqual(initialComparisonSelection(items), ['A', 'B'])
  assert.deepEqual(toggleComparisonSelection(['A', 'B'], 'C'), ['A', 'B', 'C'])
  assert.deepEqual(toggleComparisonSelection(['A', 'B', 'C'], 'D'), ['A', 'B', 'C'])
})

test('allows deselection and re-selection without duplicates', () => {
  assert.deepEqual(toggleComparisonSelection(['A', 'B'], 'A'), ['B'])
  assert.deepEqual(toggleComparisonSelection(['B'], 'A'), ['B', 'A'])
})
