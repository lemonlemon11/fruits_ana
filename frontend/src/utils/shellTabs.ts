/** 页签栏状态：把「已打开的页面」从路由变化里推导出来，与组件解耦便于单测。 */
export interface ShellTab {
  path: string
  fullPath: string
}

export const HOME_TAB_PATH = '/overview'
export const TABS_STORAGE_KEY = 'fruits-ana:open-tabs'

export function isClosableTab(path: string): boolean {
  return path !== HOME_TAB_PATH
}

/** 打开页面：已打开就只更新地址（保持原位），没打开就追加到末尾。 */
export function openTab(tabs: ShellTab[], path: string, fullPath: string): ShellTab[] {
  const index = tabs.findIndex((tab) => tab.path === path)
  if (index < 0) return [...tabs, { path, fullPath }]
  if (tabs[index].fullPath === fullPath) return tabs
  const next = [...tabs]
  next[index] = { path, fullPath }
  return next
}

export function closeTab(tabs: ShellTab[], path: string): ShellTab[] {
  return tabs.filter((tab) => tab.path !== path)
}

/** 关闭其他页签：首页等不可关闭的页签始终保留。 */
export function closeOtherTabs(tabs: ShellTab[], activePath: string): ShellTab[] {
  return tabs.filter((tab) => !isClosableTab(tab.path) || tab.path === activePath)
}

/** 关掉当前页签后该激活谁：优先右侧邻居，没有右侧就退回左侧。 */
export function nextActivePath(tabs: ShellTab[], removedIndex: number): string {
  if (tabs.length === 0) return HOME_TAB_PATH
  const index = Math.min(Math.max(removedIndex, 0), tabs.length - 1)
  return tabs[index].path
}

/** 从会话存储恢复页签：过滤脏数据、按路径去重、首页固定排在最前。 */
export function restoreTabs(raw: unknown, isKnownPath: (path: string) => boolean): ShellTab[] {
  const home: ShellTab = { path: HOME_TAB_PATH, fullPath: HOME_TAB_PATH }
  if (!Array.isArray(raw)) return [home]
  const seen = new Set<string>()
  const restored: ShellTab[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { path, fullPath } = item as Partial<ShellTab>
    if (typeof path !== 'string' || typeof fullPath !== 'string') continue
    if (!fullPath.startsWith('/') || !isKnownPath(path) || seen.has(path)) continue
    seen.add(path)
    restored.push({ path, fullPath })
  }
  const homeIndex = restored.findIndex((tab) => tab.path === HOME_TAB_PATH)
  if (homeIndex < 0) return [home, ...restored]
  if (homeIndex === 0) return restored
  return [restored[homeIndex], ...restored.slice(0, homeIndex), ...restored.slice(homeIndex + 1)]
}
