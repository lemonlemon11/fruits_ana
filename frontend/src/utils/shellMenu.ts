/**
 * 侧边导航槽位与管理端菜单的合并规则。
 *
 * 「分组结构」由管理端菜单树（directory 一级菜单）驱动：目录决定一级分组，
 * 叶子菜单决定组内条目。本地槽位继续提供路由高亮规则（matches）、权限码与
 * 兜底文案/图标——路由本身仍由前端工程定义，管理端新增未知路由的菜单不会
 * 进入导航，避免出现死链接；名称、图标与停用状态以管理端为准，这样「菜单
 * 管理」改名后业务端立即生效。
 */
import type { AuthMenu } from '../api/types'

export interface ShellMenuSlot {
  path: string
  label: string
  icon: unknown
  /** 同一个菜单项下的其它页面前缀，用于侧栏 / 底部导航高亮。 */
  matches?: string[]
  /** 需要的权限码；不设置则所有登录用户可见。 */
  permission?: string
}

/** 侧栏一级分组：label 为 null 表示未挂目录的一级入口，直接平铺。 */
export interface ShellNavGroup {
  label: string | null
  items: ShellMenuSlot[]
}

export interface ApplyMenuItemsOptions {
  /** 非主导航的辅助页签可保留本地槽位（例如手工录单）。 */
  keepUnmatched?: boolean
}

/** 按路由路径索引管理端返回的叶子菜单，便于槽位逐个匹配。 */
export function buildMenusByPath(menus: readonly AuthMenu[]): Map<string, AuthMenu> {
  const map = new Map<string, AuthMenu>()
  for (const menu of menus) {
    if (menu.routePath) map.set(menu.routePath, menu)
  }
  return map
}

/**
 * 用管理端菜单覆盖本地兜底槽位：
 * - 命中且已停用 → 整项隐藏；
 * - 命中且启用 → 采用菜单名称与图标，图标名无法解析时保留本地图标；
 * - 未命中 → 主导航隐藏；仅辅助页签可通过 keepUnmatched 保留本地命名。
 */
export function applyMenuItems(
  items: readonly ShellMenuSlot[],
  menus: Map<string, AuthMenu>,
  resolveIcon: (name: string | null) => unknown | null,
  options: ApplyMenuItemsOptions = {},
): ShellMenuSlot[] {
  const result: ShellMenuSlot[] = []
  for (const item of items) {
    const menu = menus.get(item.path)
    if (menu && !menu.isActive) continue
    if (!menu) {
      if (options.keepUnmatched) result.push(item)
      continue
    }
    result.push({
      ...item,
      label: menu.name || item.label,
      icon: resolveIcon(menu.icon) || item.icon,
    })
  }
  return result
}

function compareMenus(a: AuthMenu, b: AuthMenu): number {
  return a.sortOrder - b.sortOrder || a.id - b.id
}

/**
 * 把管理端菜单树组装成「一级分组 + 子菜单」的侧栏结构：
 * - directory 作为分组标题，叶子按 parentId 归到所属目录下；
 * - 未挂目录（或目录未授权 / 已停用）的叶子作为无标题一级入口，
 *   按管理端排序与目录穿插，兜底旧数据或目录漏授权的场景；
 * - 叶子必须命中本地槽位才渲染（高亮规则与权限码来自槽位），
 *   名称与图标以管理端菜单为准；
 * - 没有可见子菜单的目录整组丢弃。
 */
export function buildMenuGroups(
  menus: readonly AuthMenu[],
  slots: readonly ShellMenuSlot[],
  resolveIcon: (name: string | null) => unknown | null,
): ShellNavGroup[] {
  const slotByPath = new Map(slots.map((slot) => [slot.path, slot]))
  const sorted = [...menus].sort(compareMenus)
  const directories = sorted.filter(
    (menu) => menu.menuType === 'directory' && menu.isActive && menu.id > 0,
  )
  const directoryIds = new Set(directories.map((menu) => menu.id))

  const toSlot = (menu: AuthMenu): ShellMenuSlot | null => {
    if (!menu.routePath) return null
    const slot = slotByPath.get(menu.routePath)
    if (!slot) return null
    return {
      ...slot,
      label: menu.name || slot.label,
      icon: resolveIcon(menu.icon) || slot.icon,
    }
  }

  const groups: ShellNavGroup[] = []
  let loose: ShellMenuSlot[] = []
  const flushLoose = () => {
    if (loose.length > 0) {
      groups.push({ label: null, items: loose })
      loose = []
    }
  }
  for (const menu of sorted) {
    if (directoryIds.has(menu.id)) {
      const children = sorted.filter(
        (item) =>
          item.menuType === 'menu' &&
          item.isActive &&
          item.parentId === menu.id,
      )
      const items = children
        .map(toSlot)
        .filter((item): item is ShellMenuSlot => item !== null)
      if (items.length === 0) continue
      flushLoose()
      groups.push({ label: menu.name || '', items })
      continue
    }
    if (menu.menuType !== 'menu' || !menu.isActive || !menu.routePath) continue
    if (menu.parentId !== null && directoryIds.has(menu.parentId)) continue
    const item = toSlot(menu)
    if (item) loose.push(item)
  }
  flushLoose()
  return groups
}
