<script setup lang="ts">
type LegendVariant = 'dot' | 'line' | 'dashed' | 'block'

interface ChartLegendItem {
  label: string
  color?: string
  variant?: LegendVariant
}

const props = defineProps<{ items: ChartLegendItem[]; label?: string }>()

const legendLabel = props.label ?? '图例'

function markStyle(item: ChartLegendItem): Record<string, string> | undefined {
  if (!item.color) return undefined
  return item.variant === 'dashed' ? { borderColor: item.color } : { backgroundColor: item.color }
}
</script>

<template>
  <ul class="chart-legend" :aria-label="legendLabel">
    <li v-for="item in items" :key="item.label" class="chart-legend-item">
      <i
        class="chart-legend-mark"
        :class="`is-${item.variant ?? 'dot'}`"
        :style="markStyle(item)"
        aria-hidden="true"
      />
      <span>{{ item.label }}</span>
    </li>
  </ul>
</template>
