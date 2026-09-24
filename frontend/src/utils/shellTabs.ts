/** 页签栏状态：把「已打开的页面」从路由变化里推导出来，与组件解耦便于单测。 */
export interface ShellTab {
  path: string
  fullPath: string
}

export const WELCOME_TAB_PATH = '/welcome'
export const TABS_STORAGE_KEY = 'fruits-ana:open-tabs'

export function isClosableTab(path: string): boolean {
  return path !== WELCOME_TAB_PATH
}

/** 打开页面：已打开就只更新地址（保持原位），没打开就追加到末尾。 */
export function openTab(tabs: ShellTab[], path: string, fullPath: string): ShellTab[] {
  if (path === WELCOME_TAB_PATH) return [{ path, fullPath }]
  const businessTabs = tabs.filter((tab) => tab.path !== WELCOME_TAB_PATH)
  const index = businessTabs.findIndex((tab) => tab.path === path)
  if (index < 0) return [...businessTabs, { path, fullPath }]
  if (businessTabs[index].fullPath === fullPath) return businessTabs
  const next = [...businessTabs]
  next[index] = { path, fullPath }
  return next
}

export function closeTab(tabs: ShellTab[], path: string): ShellTab[] {
  return tabs.filter((tab) => tab.path !== path)
}

/** 关闭其他页签：业务页只保留当前项，欢迎页只保留自身。 */
export function closeOtherTabs(tabs: ShellTab[], activePath: string): ShellTab[] {
  if (activePath === WELCOME_TAB_PATH) {
    return [{ path: WELCOME_TAB_PATH, fullPath: WELCOME_TAB_PATH }]
  }
  return tabs.filter((tab) => tab.path === activePath)
}

/** 关掉当前页签后该激活谁：优先右侧邻居，没有右侧就退回左侧。 */
export function nextActivePath(tabs: ShellTab[], removedIndex: number): string {
  if (tabs.length === 0) return WELCOME_TAB_PATH
  const index = Math.min(Math.max(removedIndex, 0), tabs.length - 1)
  return tabs[index].path
}

/** 从会话存储恢复页签：过滤脏数据并按路径去重，无业务页时显示欢迎页。 */
export function restoreTabs(raw: unknown, isKnownPath: (path: string) => boolean): ShellTab[] {
  const welcome: ShellTab = { path: WELCOME_TAB_PATH, fullPath: WELCOME_TAB_PATH }
  if (!Array.isArray(raw)) return [welcome]
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
  const businessTabs = restored.filter((tab) => tab.path !== WELCOME_TAB_PATH)
  return businessTabs.length > 0 ? businessTabs : [welcome]
}
