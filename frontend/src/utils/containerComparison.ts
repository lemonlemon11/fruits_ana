import type { ContainerComparisonItem, Grade, GradeMetric } from '../api/types'

export const MAX_COMPARISON_CONTAINERS = 3
export const MIN_COMPARISON_CONTAINERS = 2

export function toggleComparisonSelection(selectedIds: string[], containerId: string): string[] {
  if (selectedIds.includes(containerId)) return selectedIds.filter((id) => id !== containerId)
  if (selectedIds.length >= MAX_COMPARISON_CONTAINERS) return selectedIds
  return [...selectedIds, containerId]
}

export function initialComparisonSelection(items: ContainerComparisonItem[]): string[] {
  return items.slice(0, MAX_COMPARISON_CONTAINERS - 1).map((item) => item.containerId)
}

export function buildOtherContainerGradeBaseline(
  items: ContainerComparisonItem[],
  activeContainerId: string,
): GradeMetric[] {
  const grades: Grade[] = ['A', 'B', 'C']
  const peers = items.filter((item) => item.containerId !== activeContainerId)
  const overallQuantity = peers.reduce((total, item) => total + item.salesQuantity, 0)
  return grades.map((grade) => {
    const rows = peers.flatMap((item) => item.grades.filter((row) => row.grade === grade))
    const salesQuantity = rows.reduce((total, row) => total + row.salesQuantity, 0)
    const salesAmount = rows.reduce((total, row) => total + row.salesAmount, 0)
    return {
      grade,
      salesQuantity,
      salesAmount,
      weightedAvgPrice: salesQuantity ? salesAmount / salesQuantity : null,
      quantityShare: overallQuantity ? salesQuantity / overallQuantity : null,
    }
  })
}
