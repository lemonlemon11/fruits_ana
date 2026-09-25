<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElConfigProvider, ElDatePicker } from 'element-plus'
import 'element-plus/es/components/config-provider/style/css'
import 'element-plus/es/components/date-picker/style/css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const props = defineProps<{
  startDate?: string
  endDate?: string
}>()

const emit = defineEmits<{
  'update:startDate': [value: string]
  'update:endDate': [value: string]
}>()

const root = ref<HTMLElement | null>(null)

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
</script>

<template>
  <div ref="root" class="date-range-filter">
    <span class="date-range-label">销售日期</span>
    <div class="date-range-control">
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
}

.date-range-picker {
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
