<script setup lang="ts">
import { ElCheckbox } from 'element-plus'
import 'element-plus/es/components/checkbox/style/css'

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
    <ElCheckbox
      v-for="grade in grades"
      :key="grade"
      class="grade-filter-chip"
      :model-value="isChecked(grade)"
      :aria-label="`展示${gradeLabel(grade)}`"
      @change="toggle(grade)"
    >
      <i :style="{ backgroundColor: gradeColors[grade] }" aria-hidden="true" />
      <span>{{ gradeLabel(grade) }}</span>
    </ElCheckbox>
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

/* 等级筛选胶囊：ElCheckbox 承载选中态与无障碍，去掉默认方框只留色点+文字。 */
.grade-filter-chip {
  height: auto;
  min-height: 34px;
  margin-right: 0;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font-size: .82rem;
  user-select: none;
}

.grade-filter-chip.is-checked {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.grade-filter-chip .el-checkbox__inner {
  display: none;
}

.grade-filter-chip .el-checkbox__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink);
  font-size: .82rem;
  font-weight: 800;
}

.grade-filter-chip i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
}
</style>
