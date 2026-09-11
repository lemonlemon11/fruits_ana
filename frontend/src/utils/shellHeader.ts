export const SIDEBAR_STORAGE_KEY = 'fruits-ana:sidebar-collapsed'
export const HEADER_CLOCK_REFRESH_MS = 1_000

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
