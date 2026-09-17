<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const props = defineProps<{
  startDate?: string
  endDate?: string
}>()

const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
}>()

const triggerId = `date-range-filter-${useId()}`
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const draftStart = ref('')
const draftEnd = ref('')
const error = ref('')

const label = computed(() => {
  if (props.startDate && props.endDate) return `${props.startDate} 至 ${props.endDate}`
  if (props.startDate) return `${props.startDate} 起`
  if (props.endDate) return `至 ${props.endDate}`
  return '全部时间'
})

function openPicker() {
  draftStart.value = props.startDate ?? ''
  draftEnd.value = props.endDate ?? ''
  error.value = ''
  open.value = !open.value
}

function clearRange() {
  draftStart.value = ''
  draftEnd.value = ''
  error.value = ''
  emit('update:startDate', '')
  emit('update:endDate', '')
  open.value = false
}

function applyRange() {
  if (draftStart.value && draftEnd.value && draftStart.value > draftEnd.value) {
    error.value = '开始日期不能晚于结束日期'
    return
  }
  emit('update:startDate', draftStart.value)
  emit('update:endDate', draftEnd.value)
  open.value = false
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
</script>

<template>
  <div ref="root" class="date-range-filter">
    <button
      :id="triggerId"
      type="button"
      class="date-range-trigger"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="openPicker"
    >
      <span class="date-range-label">到达日期</span>
      <span class="date-range-value">{{ label }}</span>
    </button>

    <div v-if="open" class="date-range-popover" role="dialog" :aria-labelledby="triggerId">
      <label>
        开始日期
        <input v-model="draftStart" type="date" @keydown.esc="open = false">
      </label>
      <label>
        结束日期
        <input v-model="draftEnd" type="date" @keydown.esc="open = false">
      </label>
      <p v-if="error" class="date-range-error" role="alert">{{ error }}</p>
      <div class="date-range-actions">
        <button type="button" class="date-range-clear" @click="clearRange">清空</button>
        <button type="button" class="date-range-confirm" @click="applyRange">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.date-range-filter {
  position: relative;
  display: grid;
  gap: .41rem;
}

.date-range-trigger {
  display: grid;
  gap: .14rem;
  width: 100%;
  min-height: 3.06rem;
  padding: .42rem .65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.date-range-trigger:hover {
  border-color: var(--primary);
}

.date-range-label {
  color: var(--muted);
  font-size: .72rem;
  font-weight: 800;
  line-height: 1.2;
}

.date-range-value {
  overflow: hidden;
  font-size: .95rem;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-range-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  display: grid;
  gap: 10px;
  width: min(340px, calc(100vw - 28px));
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 14px 34px rgba(16, 42, 31, .18);
}

.date-range-popover label {
  display: grid;
  gap: 5px;
  color: var(--ink);
  font-size: .82rem;
  font-weight: 800;
}

.date-range-popover input {
  width: 100%;
  min-height: 42px;
  padding: 0 .6rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: .95rem;
}

.date-range-error {
  margin: 0;
  color: var(--danger);
  font-size: .82rem;
  line-height: 1.4;
}

.date-range-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.date-range-actions button {
  min-height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  font-size: .9rem;
  font-weight: 800;
}

.date-range-clear {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--primary-dark);
}

.date-range-confirm {
  border: 1px solid var(--primary-dark);
  background: var(--primary);
  color: white;
}
</style>
