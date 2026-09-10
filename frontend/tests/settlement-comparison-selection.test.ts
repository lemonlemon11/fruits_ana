import assert from 'node:assert/strict'
import test from 'node:test'

import * as comparisonUtils from '../src/utils/containerComparison.ts'

const { initialComparisonSelection, toggleComparisonSelection } = comparisonUtils

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

test('builds grade price baseline from other containers only', () => {
  const buildBaseline = (comparisonUtils as Record<string, unknown>).buildOtherContainerGradeBaseline
  assert.equal(typeof buildBaseline, 'function')

  const items = [
    {
      containerId: 'C1',
      grades: [
        { grade: 'A', salesQuantity: 10, salesAmount: 100 },
        { grade: 'B', salesQuantity: 2, salesAmount: 12 },
      ],
    },
    {
      containerId: 'C2',
      grades: [
        { grade: 'A', salesQuantity: 4, salesAmount: 80 },
        { grade: 'B', salesQuantity: 0, salesAmount: 0 },
      ],
    },
    {
      containerId: 'C3',
      grades: [
        { grade: 'A', salesQuantity: 6, salesAmount: 60 },
        { grade: 'B', salesQuantity: 3, salesAmount: 30 },
      ],
    },
  ]

  const baseline = (buildBaseline as Function)(items, 'C1')

  assert.equal(baseline.find((item: { grade: string }) => item.grade === 'A').weightedAvgPrice, 14)
  assert.equal(baseline.find((item: { grade: string }) => item.grade === 'B').weightedAvgPrice, 10)
})
