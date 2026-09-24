<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  startDate?: string
  endDate?: string
}>()

const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
}>()

const root = ref<HTMLElement | null>(null)

function onStartInput(event: Event) {
  emit('update:startDate', (event.target as HTMLInputElement).value)
}

function onEndInput(event: Event) {
  emit('update:endDate', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div ref="root" class="date-range-filter">
    <span class="date-range-label">销售日期</span>
    <div class="date-range-fields">
      <label class="date-range-native-field">
        <span class="date-range-native-caption">开始日期</span>
        <input
          type="date"
          :value="startDate"
          :aria-label="`开始日期${startDate || ''}`"
          @input="onStartInput"
        />
      </label>
      <span class="date-range-native-sep" aria-hidden="true">至</span>
      <label class="date-range-native-field">
        <span class="date-range-native-caption">结束日期</span>
        <input
          type="date"
          :value="endDate"
          :aria-label="`结束日期${endDate || ''}`"
          @input="onEndInput"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.date-range-filter {
  display: grid;
  gap: .41rem;
  width: 100%;
  min-width: 0;
}

.date-range-label {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.date-range-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end;
  gap: .35rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.date-range-native-field {
  display: grid;
  gap: .29rem;
  min-width: 0;
}

.date-range-native-caption {
  color: var(--muted);
  font-size: .82rem;
  font-weight: 700;
  line-height: 1.2;
}

.date-range-native-sep {
  padding: 0;
  color: var(--muted);
  font-size: .9rem;
  text-align: center;
}

.date-range-fields input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 3.06rem;
  padding: 0 .55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 16px;
  box-shadow: none;
}
</style>
