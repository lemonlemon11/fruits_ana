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

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const triggerId = `date-range-filter-${useId()}`
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const draftStart = ref('')
const draftEnd = ref('')
const error = ref('')
const visibleMonth = ref(new Date())

const label = computed(() => {
  if (props.startDate && props.endDate) return `${props.startDate} 至 ${props.endDate}`
  if (props.startDate) return `${props.startDate} 起`
  if (props.endDate) return `至 ${props.endDate}`
  return '全部时间'
})

const visibleYear = computed(() => visibleMonth.value.getFullYear())
const visibleMonthIndex = computed(() => visibleMonth.value.getMonth())
const monthTitle = computed(() => `${visibleYear.value}年${visibleMonthIndex.value + 1}月`)
const draftLabel = computed(() => {
  if (draftStart.value && draftEnd.value) return `${draftStart.value} 至 ${draftEnd.value}`
  if (draftStart.value) return `已选开始日期 ${draftStart.value}，请选择结束日期`
  return '请选择开始日期'
})

const days = computed(() => {
  const firstDay = new Date(visibleYear.value, visibleMonthIndex.value, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(visibleYear.value, visibleMonthIndex.value + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let index = 0; index < mondayOffset; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(visibleYear.value, visibleMonthIndex.value, day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
})

function toDateOnly(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function openPicker() {
  draftStart.value = props.startDate ?? ''
  draftEnd.value = props.endDate ?? ''
  error.value = ''
  const base = toDateOnly(draftStart.value || draftEnd.value) ?? new Date()
  visibleMonth.value = new Date(base.getFullYear(), base.getMonth(), 1)
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

function changeMonth(offset: number) {
  visibleMonth.value = new Date(visibleYear.value, visibleMonthIndex.value + offset, 1)
}

function selectDate(date: Date) {
  const value = toDateValue(date)
  if (!draftStart.value || (draftStart.value && draftEnd.value)) {
    draftStart.value = value
    draftEnd.value = ''
    return
  }
  if (value < draftStart.value) {
    draftEnd.value = draftStart.value
    draftStart.value = value
  } else {
    draftEnd.value = value
  }
}

function isStart(date: Date) {
  return draftStart.value === toDateValue(date)
}

function isEnd(date: Date) {
  return draftEnd.value === toDateValue(date)
}

function isInRange(date: Date) {
  if (!draftStart.value || !draftEnd.value) return false
  const value = toDateValue(date)
  return value > draftStart.value && value < draftEnd.value
}

function isToday(date: Date) {
  return toDateValue(new Date()) === toDateValue(date)
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
      <span class="date-range-label">销售日期</span>
      <span class="date-range-value">{{ label }}</span>
    </button>

    <div v-if="open" class="date-range-popover" role="dialog" :aria-labelledby="triggerId" @keydown.esc="open = false">
      <div class="calendar-panel">
        <header class="calendar-header">
          <button type="button" class="calendar-nav" aria-label="上个月" @click="changeMonth(-1)">‹</button>
          <strong class="calendar-title">{{ monthTitle }}</strong>
          <button type="button" class="calendar-nav" aria-label="下个月" @click="changeMonth(1)">›</button>
        </header>

        <div class="calendar-weekdays" aria-hidden="true">
          <span v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</span>
        </div>

        <div class="calendar-grid">
          <template v-for="(date, index) in days" :key="`${monthTitle}-${index}`">
            <span v-if="!date" class="calendar-day is-empty" aria-hidden="true"></span>
            <button
              v-else
              type="button"
              class="calendar-day"
              :class="{
                'is-today': isToday(date),
                'is-start': isStart(date),
                'is-end': isEnd(date),
                'is-in-range': isInRange(date),
              }"
              :aria-pressed="isStart(date) || isEnd(date)"
              :aria-label="toDateValue(date)"
              @click="selectDate(date)"
            >
              {{ date.getDate() }}
            </button>
          </template>
        </div>
      </div>

      <p class="date-range-draft" aria-live="polite">{{ draftLabel }}</p>
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

.calendar-panel {
  display: grid;
  gap: 9px;
}

.calendar-header {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 8px;
}

.calendar-title {
  color: var(--ink);
  font-size: .95rem;
  font-weight: 800;
  text-align: center;
}

.calendar-nav {
  min-height: 32px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--primary-dark);
  cursor: pointer;
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1;
}

.calendar-nav:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.calendar-weekdays,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.calendar-weekdays span {
  color: var(--muted);
  font-size: .75rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.calendar-day {
  min-height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  font-size: .88rem;
  font-weight: 700;
}

.calendar-day:hover {
  border-color: var(--primary);
}

.calendar-day.is-empty {
  background: transparent;
  pointer-events: none;
}

.calendar-day.is-today {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.calendar-day.is-in-range {
  border-radius: 0;
  background: var(--primary-soft);
}

.calendar-day.is-start,
.calendar-day.is-end {
  border-color: var(--primary-dark);
  background: var(--primary);
  color: white;
}

.date-range-draft {
  margin: 0;
  color: var(--muted);
  font-size: .82rem;
  line-height: 1.4;
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
