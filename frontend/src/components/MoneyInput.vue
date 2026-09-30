<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElInput } from 'element-plus'
import 'element-plus/es/components/input/style/css'
import { roundMoney } from '../utils/entryForm'

/**
 * 金额输入：失焦后按两位小数展示（260 → 260.00），聚焦时显示原始值便于修改；
 * 失焦同时把数据四舍五入到分。number 输入框原生会丢末尾 0，故用文本框 + inputmode。
 */
const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const focused = ref(false)
const raw = ref('')
const display = computed(() => (focused.value ? raw.value : roundMoney(Number(props.modelValue || 0)).toFixed(2)))

function onFocus() {
  focused.value = true
  raw.value = String(props.modelValue ?? '')
}

function onInput(value: string) {
  raw.value = value
  if (value.trim() === '') {
    emit('update:modelValue', 0)
    return
  }
  const parsed = Number(value)
  emit('update:modelValue', Number.isFinite(parsed) ? parsed : 0)
}

function onBlur() {
  focused.value = false
  emit('update:modelValue', roundMoney(Number(props.modelValue || 0)))
}
</script>

<template>
  <ElInput
    :model-value="display"
    type="text"
    inputmode="decimal"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
  />
</template>
