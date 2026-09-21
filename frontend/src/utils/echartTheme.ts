/** ECharts 统一从项目 CSS 变量读取颜色，保持和现有主题一致。 */
export function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export const echartTheme = {
  primary: readCssVar('--primary', '#2f7d57'),
  ink: readCssVar('--ink', '#163226'),
  muted: readCssVar('--muted', '#5c6b63'),
  line: readCssVar('--line', '#dfe7e1'),
  lineStrong: readCssVar('--line-strong', '#b8c9bf'),
}
