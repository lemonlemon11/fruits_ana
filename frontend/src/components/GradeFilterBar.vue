<script setup lang="ts">
import { gradeColors, gradeLabel, type Grade } from '../utils/grades'

const props = defineProps<{
  grades: Grade[]
  modelValue: Grade[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Grade[]]
}>()

const isChecked = (grade: Grade) => props.modelValue.includes(grade)

function toggle(grade: Grade) {
  const next = isChecked(grade)
    ? props.modelValue.filter((item) => item !== grade)
    : [...props.modelValue, grade]
  emit('update:modelValue', props.grades.filter((item) => next.includes(item)))
}
</script>

<template>
  <div class="grade-filter-bar" aria-label="选择要展示的等级">
    <span class="grade-filter-label">展示等级</span>
    <label v-for="grade in grades" :key="grade" class="grade-filter-chip">
      <input
        type="checkbox"
        :checked="isChecked(grade)"
        :aria-label="`展示${gradeLabel(grade)}`"
        @change="toggle(grade)"
      />
      <i :style="{ backgroundColor: gradeColors[grade] }" aria-hidden="true" />
      <span>{{ gradeLabel(grade) }}</span>
    </label>
  </div>
</template>

<style scoped>
.grade-filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.grade-filter-label {
  color: var(--muted);
  font-size: .85rem;
  font-weight: 800;
}

.grade-filter-chip {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  font-size: .82rem;
  font-weight: 800;
  user-select: none;
}

.grade-filter-chip:has(input:checked) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.grade-filter-chip input {
  width: 15px;
  height: 15px;
  accent-color: var(--primary);
}

.grade-filter-chip i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
}
</style>
