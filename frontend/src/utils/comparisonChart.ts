export function relativeBarWidth(value: number | null | undefined, maximum: number): number {
  if (!value || !maximum || value <= 0) return 0
  return Math.min(100, Math.max(0, (value / maximum) * 100))
}

export function metricMaximum(values: Array<number | null | undefined>): number {
  return Math.max(...values.map((value) => value ?? 0), 0)
}
