import { ref } from 'vue'

/** 悬浮提示中的一行指标，color 用于展示与图表一致的色标。 */
export interface ChartTooltipRow {
  label: string
  value: string
  color?: string
}

/** 悬浮提示的内容，图表只负责把数据整理成这种结构。 */
export interface ChartTooltipContent {
  title: string
  rows: ChartTooltipRow[]
  note?: string
}

export interface ChartTooltipState extends ChartTooltipContent {
  visible: boolean
  x: number
  y: number
  below: boolean
}

/** 提示框距鼠标的间距（px）。 */
const OFFSET = 14
/** 贴边判断用的半宽估值（px），只用于横向避让，不会影响实际尺寸。 */
const HALF_WIDTH = 140
/** 顶部空间不足时改为向下展开。 */
const TOP_SAFE_ZONE = 140

function place(event: MouseEvent): { x: number; y: number; below: boolean } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const minX = HALF_WIDTH + OFFSET
  const maxX = viewportWidth - HALF_WIDTH - OFFSET
  const x = maxX <= minX ? viewportWidth / 2 : Math.min(Math.max(event.clientX, minX), maxX)
  const y = Math.min(event.clientY, viewportHeight - OFFSET)
  return { x, y, below: event.clientY < TOP_SAFE_ZONE }
}

/**
 * 手写图表的统一悬浮提示：mouseenter 时展示内容，mousemove 时跟随鼠标。
 * 只做定位与显隐，具体文案由图表传入。
 */
export function useChartTooltip() {
  const tooltip = ref<ChartTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    below: false,
    title: '',
    rows: [],
  })

  function showTooltip(event: MouseEvent, content: ChartTooltipContent) {
    tooltip.value = { ...content, ...place(event), visible: true }
  }

  function moveTooltip(event: MouseEvent) {
    if (!tooltip.value.visible) return
    tooltip.value = { ...tooltip.value, ...place(event) }
  }

  function hideTooltip() {
    if (!tooltip.value.visible) return
    tooltip.value = { ...tooltip.value, visible: false }
  }

  return { tooltip, showTooltip, moveTooltip, hideTooltip }
}
