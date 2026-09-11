<script setup lang="ts">
import type { ChartTooltipState } from '../utils/chartTooltip'

defineProps<{ tooltip: ChartTooltipState }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tooltip.visible"
      class="chart-tooltip"
      :class="{ 'is-below': tooltip.below }"
      role="tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <strong v-if="tooltip.title" class="chart-tooltip-title">{{ tooltip.title }}</strong>
      <dl v-if="tooltip.rows.length" class="chart-tooltip-rows">
        <div v-for="row in tooltip.rows" :key="`${row.label}-${row.value}`" class="chart-tooltip-row">
          <dt>
            <i v-if="row.color" class="chart-tooltip-dot" :style="{ backgroundColor: row.color }" aria-hidden="true" />
            {{ row.label }}
          </dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
      <small v-if="tooltip.note" class="chart-tooltip-note">{{ tooltip.note }}</small>
    </div>
  </Teleport>
</template>
