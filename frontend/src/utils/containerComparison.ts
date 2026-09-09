import type { ContainerComparisonItem } from '../api/types'

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
