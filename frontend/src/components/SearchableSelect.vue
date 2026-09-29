<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ElOption, ElSelect } from 'element-plus'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'

import type { SearchableOption } from '../utils/searchableSelect'

const props = withDefaults(defineProps<{
  modelValue: string
  options: SearchableOption[]
  label?: string
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  loading?: boolean
}>(), {
  label: '',
  placeholder: '请选择',
  ariaLabel: '',
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const selectRef = ref<InstanceType<typeof ElSelect> | null>(null)

function onUpdate(value: string) {
  emit('update:modelValue', value)
}

function onChange(value: string) {
  emit('change', value)
  // 点选即失焦（用户要求）：el-select 选中后默认保持焦点，filterable 时内嵌输入框
  // 仍可继续输入，视觉上像"还在编辑"；选完主动 blur 收起编辑态。
  nextTick(() => selectRef.value?.blur())
}

// 聚焦（点击）时隐藏提示语，失焦未选择后恢复；已选值的展示不受影响
const focused = ref(false)
</script>

<template>
  <div class="searchable-select" :aria-busy="loading">
    <label v-if="label" class="searchable-select-label">{{ label }}</label>
    <ElSelect
      ref="selectRef"
      :model-value="modelValue"
      :placeholder="focused ? '' : placeholder"
      :disabled="disabled || loading"
      :loading="loading"
      loading-text="正在加载"
      filterable
      clearable
      :aria-label="ariaLabel || label || placeholder"
      class="searchable-select-control"
      @update:model-value="onUpdate"
      @change="onChange"
      @focus="focused = true"
      @blur="focused = false"
    >
      <ElOption
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </ElSelect>
  </div>
</template>

<style scoped>
.searchable-select {
  display: block;
  width: 100%;
  min-width: 0;
}

.searchable-select-control {
  width: 100%;
}

.searchable-select-label {
  display: block;
  margin-bottom: .41rem;
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.searchable-select :deep(.el-select__wrapper) {
  min-height: 3.06rem;
  padding: 0 .65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: none;
  font-size: 1.05rem;
}

.searchable-select :deep(.el-select__input) {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.searchable-select :deep(.el-select__placeholder) {
  color: var(--muted);
}
</style>
