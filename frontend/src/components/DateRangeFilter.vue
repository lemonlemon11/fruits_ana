<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElConfigProvider, ElDatePicker, ElOption, ElOptionGroup, ElSelect } from 'element-plus'
import 'element-plus/es/components/config-provider/style/css'
import 'element-plus/es/components/date-picker/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import {
  monthBounds,
  monthOptionLabel,
  periodBoundsForOption,
  recentBounds,
  RECENT_DAY_OPTIONS,
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
   * 起止日期等于某快捷选项边界时是否自动回显该选项；默认开启。
   * 关闭后选项只随用户在下拉里的选择变化，
   * 用于「默认停在自定义时间 + 预填当年起止」的场景（卖得怎么样）。
   */
  autoMatchMode?: boolean
}>()

const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
  /** 快捷选项选中后触发；此时起止日期已同步更新，父级可直接刷新查询。 */
  change: []
}>()

const root = ref<HTMLElement | null>(null)
const quickSelectRef = ref<InstanceType<typeof ElSelect> | null>(null)

/** 快捷选项值：`custom`（默认）/ `recent:7` / `year:2026` / `month:2026-09`。 */
const quickValue = ref('custom')

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

// 起止日期等于某个快捷选项边界时，下拉回显该选项；否则回到「自定义时间」。
// autoMatchMode 关闭时不做该回显（选项保持用户所选/初始值），供默认自定义+预填日期的页面使用。
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
        quickValue.value = `year:${matchedYear}`
        return
      }
      const matchedMonth = monthOptions.value.find((month) => {
        const bounds = monthBounds(month)
        return bounds !== null && bounds.start === start && bounds.end === end
      })
      if (matchedMonth) {
        quickValue.value = `month:${matchedMonth}`
        return
      }
      const matchedRecent = RECENT_DAY_OPTIONS.find((option) => {
        const bounds = recentBounds(option.days)
        return bounds !== null && bounds.start === start && bounds.end === end
      })
      if (matchedRecent) {
        quickValue.value = `recent:${matchedRecent.days}`
        return
      }
    }
    if (quickValue.value !== 'custom') quickValue.value = 'custom'
  },
  { immediate: true },
)

function applyBounds(start: string, end: string) {
  emit('update:startDate', start)
  emit('update:endDate', end)
  emit('change')
}

function onQuickChange() {
  // 选中快捷选项即把区间写入右侧日历并触发查询；「自定义时间」由用户在日历里手动选择。
  // 点选即失焦（用户要求）：下拉选中后不再保持焦点编辑态。
  nextTick(() => quickSelectRef.value?.blur())
  if (quickValue.value === 'custom') return
  const bounds = periodBoundsForOption(quickValue.value)
  if (bounds) applyBounds(bounds.start, bounds.end)
}
</script>

<template>
  <div ref="root" class="date-range-filter">
    <span class="date-range-label">销售日期</span>
    <div class="date-range-control">
      <ElSelect
        ref="quickSelectRef"
        v-model="quickValue"
        class="date-range-quick"
        aria-label="时间快捷选项"
        @change="onQuickChange"
      >
        <ElOption value="custom" label="自定义时间" />
        <ElOptionGroup label="快捷区间">
          <ElOption
            v-for="item in RECENT_DAY_OPTIONS"
            :key="`recent-${item.days}`"
            :value="`recent:${item.days}`"
            :label="item.label"
          />
        </ElOptionGroup>
        <ElOptionGroup v-if="yearOptions.length" label="按年度">
          <ElOption v-for="item in yearOptions" :key="`year-${item}`" :value="`year:${item}`" :label="yearOptionLabel(item)" />
        </ElOptionGroup>
        <ElOptionGroup v-if="monthOptions.length" label="按月度">
          <ElOption v-for="item in monthOptions" :key="`month-${item}`" :value="`month:${item}`" :label="monthOptionLabel(item)" />
        </ElOptionGroup>
      </ElSelect>
      <ElConfigProvider :locale="zhCn">
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

/* 快捷下拉固定宽度（覆盖全局 .filter-bar select 的 100%），日期范围选择器吃满剩余行宽。 */
.date-range-quick {
  flex: 0 0 auto;
  width: 11rem;
}

.date-range-quick :deep(.el-select__wrapper) {
  min-height: 3.06rem;
  padding: 0 .65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: none;
  font-size: 1.05rem;
}

.date-range-quick :deep(.el-select__placeholder),
.date-range-quick :deep(.el-select__selected-item) {
  color: var(--ink);
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
