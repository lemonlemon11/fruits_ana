/**
 * 侧边导航槽位与管理端菜单的合并规则。
 *
 * 导航的「位置」（哪个进主导航、哪个进更多、手机底部放几个）仍由前端槽位决定，
 * 避免管理端误加菜单时把已确认的移动端布局挤坏；管理端菜单只负责覆盖名称、
 * 图标与启用状态，这样「菜单管理」改名后业务端立即生效。
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

/** 按路由路径索引管理端返回的菜单，便于槽位逐个匹配。 */
export function buildMenusByPath(menus: readonly AuthMenu[]): Map<string, AuthMenu> {
  const map = new Map<string, AuthMenu>()
  for (const menu of menus) map.set(menu.routePath, menu)
  return map
}

/**
 * 用管理端菜单覆盖本地兜底槽位：
 * - 命中且已停用 → 整项隐藏；
 * - 命中且启用 → 采用菜单名称与图标，图标名无法解析时保留本地图标；
 * - 未命中 → 保持本地兜底项，权限行为不变。
 */
export function applyMenuItems(
  items: readonly ShellMenuSlot[],
  menus: Map<string, AuthMenu>,
  resolveIcon: (name: string | null) => unknown | null,
): ShellMenuSlot[] {
  const result: ShellMenuSlot[] = []
  for (const item of items) {
    const menu = menus.get(item.path)
    if (menu && !menu.isActive) continue
    if (!menu) {
      result.push(item)
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
