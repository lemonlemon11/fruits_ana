<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElConfigProvider, ElDatePicker } from 'element-plus'
import 'element-plus/es/components/config-provider/style/css'
import 'element-plus/es/components/date-picker/style/css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import {
  monthBounds,
  monthOptionLabel,
  yearBounds,
  yearOptionLabel,
} from '../utils/salePeriods.ts'

const props = defineProps<{
  startDate?: string
  endDate?: string
  /** 数据驱动快捷选项：有销售记录的年份（如 2026）。 */
  years?: number[]
  /** 数据驱动快捷选项：有销售记录的月份（如 2026-09）。 */
  months?: string[]
  /**
   * 起止日期等于年/月自然边界时是否自动回显对应方式；默认开启。
   * 关闭后方式只随用户在方式下拉/快捷选项里的选择变化，
   * 用于「默认停在自定义时间 + 预填当年起止」的场景（卖得怎么样）。
   */
  autoMatchMode?: boolean
}>()

const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
  /** 年度/月度选项选中后触发；此时起止日期已同步更新，父级可直接刷新查询。 */
  change: []
}>()

const root = ref<HTMLElement | null>(null)

/** 时间筛选三种方式：按年度 / 按月度 / 自定义时间。 */
type QuickMode = 'year' | 'month' | 'custom'
const mode = ref<QuickMode>('custom')
const yearValue = ref('')
const monthValue = ref('')

// 年度选项 = 数据年份 ∪ 当前年份（降序去重），保证无数据时也能选今年。
const yearOptions = computed(() => {
  const years = new Set(props.years ?? [])
  years.add(new Date().getFullYear())
  return [...years].sort((left, right) => right - left)
})
const monthOptions = computed(() => props.months ?? [])

const range = computed<[string, string] | null>({
  get: () => (props.startDate && props.endDate ? [props.startDate, props.endDate] : null),
  set: (value) => {
    if (Array.isArray(value) && value.length === 2) {
      emit('update:startDate', value[0] ?? '')
      emit('update:endDate', value[1] ?? '')
      return
    }
    emit('update:startDate', '')
    emit('update:endDate', '')
  },
})

// 起止日期等于某个年/月自然边界时，控件回显对应方式与选项；否则视为自定义。
// autoMatchMode 关闭时不做该回显（方式保持用户所选/初始值），供默认自定义+预填日期的页面使用。
watch(
  () => [props.startDate, props.endDate, yearOptions.value, monthOptions.value],
  () => {
    if (props.autoMatchMode === false) return
    const start = props.startDate
    const end = props.endDate
    if (start && end) {
      const matchedYear = yearOptions.value.find(
        (year) => yearBounds(year).start === start && yearBounds(year).end === end,
      )
      if (matchedYear) {
        mode.value = 'year'
        yearValue.value = String(matchedYear)
        return
      }
      const matchedMonth = monthOptions.value.find((month) => {
        const bounds = monthBounds(month)
        return bounds !== null && bounds.start === start && bounds.end === end
      })
      if (matchedMonth) {
        mode.value = 'month'
        monthValue.value = matchedMonth
        return
      }
    }
    if (mode.value !== 'custom') mode.value = 'custom'
  },
  { immediate: true },
)

function applyBounds(start: string, end: string) {
  emit('update:startDate', start)
  emit('update:endDate', end)
  emit('change')
}

function onModeChange() {
  // 只切换展示方式不改日期；年度/月度选中具体选项（或自定义里手动改日期）才触发查询。
  if (mode.value === 'year' && yearValue.value) {
    const bounds = yearBounds(Number(yearValue.value))
    if (props.startDate !== bounds.start || props.endDate !== bounds.end) {
      applyBounds(bounds.start, bounds.end)
    }
  } else if (mode.value === 'month' && monthValue.value) {
    const bounds = monthBounds(monthValue.value)
    if (bounds && (props.startDate !== bounds.start || props.endDate !== bounds.end)) {
      applyBounds(bounds.start, bounds.end)
    }
  }
}

function onYearChange() {
  if (!yearValue.value) return
  const bounds = yearBounds(Number(yearValue.value))
  applyBounds(bounds.start, bounds.end)
}

function onMonthChange() {
  if (!monthValue.value) return
  const bounds = monthBounds(monthValue.value)
  if (bounds) applyBounds(bounds.start, bounds.end)
}
</script>

<template>
  <div ref="root" class="date-range-filter">
    <span class="date-range-label">销售日期</span>
    <div class="date-range-control">
      <select
        v-model="mode"
        class="date-range-mode"
        aria-label="时间筛选方式"
        @change="onModeChange"
      >
        <option value="year">按年度</option>
        <option value="month">按月度</option>
        <option value="custom">自定义时间</option>
      </select>
      <select
        v-if="mode === 'year'"
        v-model="yearValue"
        class="date-range-quick"
        aria-label="选择年度"
        @change="onYearChange"
      >
        <option v-if="!yearOptions.length" value="" disabled>暂无年度</option>
        <option v-for="item in yearOptions" :key="`year-${item}`" :value="String(item)">
          {{ yearOptionLabel(item) }}
        </option>
      </select>
      <select
        v-else-if="mode === 'month'"
        v-model="monthValue"
        class="date-range-quick"
        aria-label="选择月度"
        @change="onMonthChange"
      >
        <option v-if="!monthOptions.length" value="" disabled>暂无月度</option>
        <option v-for="item in monthOptions" :key="`month-${item}`" :value="item">
          {{ monthOptionLabel(item) }}
        </option>
      </select>
      <ElConfigProvider v-else :locale="zhCn">
        <ElDatePicker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          range-separator="至"
          clearable
          aria-label="销售日期"
          class="date-range-picker"
        />
      </ElConfigProvider>
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

.date-range-control {
  min-width: 0;
  display: flex;
  gap: .5rem;
  align-items: stretch;
}

/* 方式下拉固定宽度；年/月下拉与日期范围选择器都吃满剩余行宽——
   切换不同选项（如 2026年 / 2026年9月）或切换方式时输入框长度保持不变。
   width:auto 覆盖全局 .filter-bar select 的 100%，避免与 flex 撑宽叠加。 */
.date-range-mode {
  flex: 0 0 auto;
  width: auto;
  min-width: 6.4rem;
  min-height: 3.06rem;
  padding: 0 .55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

.date-range-quick {
  flex: 1 1 auto;
  width: auto;
  min-width: 7.2rem;
  min-height: 3.06rem;
  padding: 0 .55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

.date-range-picker {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.date-range-control :deep(.el-date-editor) {
  width: 100%;
  min-height: 3.06rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 1.05rem;
  box-shadow: none;
}
</style>
