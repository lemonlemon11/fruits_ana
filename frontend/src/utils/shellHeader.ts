export const SIDEBAR_STORAGE_KEY = 'fruits-ana:sidebar-collapsed'
export const FONT_SIZE_STORAGE_KEY = 'fruits-ana:font-size'
export const HEADER_CLOCK_REFRESH_MS = 1_000

export type FontSizePreference = 'small' | 'standard' | 'large' | 'xlarge'

export const FONT_SIZE_OPTIONS: ReadonlyArray<{
  value: FontSizePreference
  label: string
  scale: number
}> = [
  { value: 'small', label: '小', scale: 0.9 },
  { value: 'standard', label: '标准', scale: 1 },
  { value: 'large', label: '大', scale: 1.125 },
  { value: 'xlarge', label: '特大', scale: 1.25 },
]

const weekdays = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function restoreSidebarCollapsed(value: string | null): boolean {
  return value === 'true'
}

export function restoreFontSize(value: string | null): FontSizePreference {
  if (FONT_SIZE_OPTIONS.some((option) => option.value === value)) {
    return value as FontSizePreference
  }
  return 'small'
}

export function fontScaleFor(value: FontSizePreference): number {
  return FONT_SIZE_OPTIONS.find((option) => option.value === value)?.scale ?? 1
}

export function formatHeaderClock(value: Date): {
  date: string
  time: string
  datetime: string
} {
  const calendarDate = [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join('-')
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`
  const seconds = pad(value.getSeconds())
  return {
    date: `${calendarDate} ${weekdays[value.getDay()]}`,
    time: `${time}:${seconds}`,
    datetime: `${calendarDate}T${time}:${seconds}`,
  }
}
