<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import {
  filterSearchableOptions,
  searchableOptionLabel,
  type SearchableOption,
} from '../utils/searchableSelect'

const props = withDefaults(defineProps<{
  modelValue: string
  options: SearchableOption[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
}>(), {
  placeholder: '请选择',
  ariaLabel: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const highlightedIndex = ref(0)
const listboxId = `searchable-select-listbox-${useId()}`

const selectedLabel = computed(() => searchableOptionLabel(props.options, props.modelValue))
const filteredOptions = computed(() => filterSearchableOptions(props.options, query.value))

watch(() => props.modelValue, () => {
  if (!open.value) query.value = selectedLabel.value
}, { immediate: true })

watch(filteredOptions, (items) => {
  highlightedIndex.value = Math.min(highlightedIndex.value, Math.max(0, items.length - 1))
})

function openList() {
  if (props.disabled) return
  query.value = ''
  open.value = true
  highlightedIndex.value = Math.max(
    0,
    filteredOptions.value.findIndex((option) => option.value === props.modelValue),
  )
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function closeList() {
  open.value = false
  query.value = selectedLabel.value
}

function selectOption(option: SearchableOption) {
  query.value = option.label
  open.value = false
  if (option.value !== props.modelValue) {
    emit('update:modelValue', option.value)
    emit('change', option.value)
  }
  inputRef.value?.blur()
}

function onInput() {
  open.value = true
  highlightedIndex.value = 0
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    event.preventDefault()
    openList()
    return
  }
  if (!open.value) return

  const items = filteredOptions.value
  if (event.key === 'Escape') {
    event.preventDefault()
    closeList()
    return
  }
  if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % items.length
    return
  }
  if (event.key === 'ArrowUp' && items.length) {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value - 1 + items.length) % items.length
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const option = items[highlightedIndex.value]
    if (option) selectOption(option)
    else closeList()
    return
  }
  if (event.key === 'Tab') closeList()
}

function onBlur() {
  window.setTimeout(() => {
    if (open.value) closeList()
  }, 120)
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) closeList()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div
    ref="rootRef"
    class="searchable-select"
    :class="{ 'is-open': open, 'is-disabled': disabled }"
  >
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      :aria-activedescendant="open && filteredOptions.length ? `${listboxId}-${highlightedIndex}` : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      @focus="openList"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    >
    <span class="searchable-select-chevron" aria-hidden="true">⌄</span>
    <ul
      v-if="open"
      :id="listboxId"
      class="searchable-select-list"
      role="listbox"
    >
      <li v-if="!filteredOptions.length" class="searchable-select-empty">没有匹配选项</li>
      <li
        v-for="(option, index) in filteredOptions"
        :key="option.value"
        :id="`${listboxId}-${index}`"
        class="searchable-select-option"
        :class="{ 'is-highlighted': index === highlightedIndex, 'is-selected': option.value === modelValue }"
        role="option"
        :aria-selected="option.value === modelValue"
        @mousedown.prevent
        @click="selectOption(option)"
        @mouseenter="highlightedIndex = index"
      >
        <span>{{ option.label }}</span>
        <span v-if="option.value === modelValue" class="searchable-select-check" aria-hidden="true">✓</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
}

.searchable-select input {
  width: 100%;
  min-width: 0;
  padding-right: 2rem;
  cursor: pointer;
}

.searchable-select-chevron {
  position: absolute;
  top: 50%;
  right: .65rem;
  z-index: 1;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  pointer-events: none;
  transform: translateY(-50%);
}

.searchable-select.is-open .searchable-select-chevron {
  transform: translateY(-50%) rotate(180deg);
}

.searchable-select-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  max-height: min(320px, 44vh);
  margin: 0;
  padding: 6px;
  overflow: auto;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 14px 34px rgb(16 42 31 / 18%);
  list-style: none;
}

.searchable-select-option {
  display: flex;
  min-height: 2.6rem;
  align-items: center;
  justify-content: space-between;
  gap: .6rem;
  padding: .5rem .6rem;
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
}

.searchable-select-option:hover,
.searchable-select-option.is-highlighted {
  background: var(--primary-soft);
}

.searchable-select-option.is-selected {
  color: var(--primary-dark);
  font-weight: 700;
}

.searchable-select-check {
  color: var(--primary);
  font-weight: 800;
}

.searchable-select-empty {
  padding: .65rem .6rem;
  color: var(--muted);
  text-align: center;
}

.searchable-select.is-disabled input {
  cursor: not-allowed;
  opacity: .5;
}
</style>
