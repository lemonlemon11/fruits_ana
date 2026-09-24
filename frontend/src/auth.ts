import { ref } from 'vue'

import { ApiError, getCurrentUser, type AuthUser } from './api/client.ts'
import type { AuthMenu } from './api/types.ts'

export const currentUser = ref<AuthUser | null>(null)
export const authReady = ref(false)

let restorePromise: Promise<AuthUser | null> | null = null

export function setCurrentUser(user: AuthUser | null): void {
  currentUser.value = user
  authReady.value = true
}

export function hasPermission(code: string): boolean {
  return currentUser.value?.permissions.includes(code) === true
}

const ROUTE_PERMISSIONS = [
  { path: '/overview', permission: 'overview:view' },
  { path: '/settlements', permission: 'settlement:list' },
  { path: '/settlement-detail', permission: 'settlement:detail' },
  { path: '/settlement-comparison', permission: 'settlement:comparison' },
  { path: '/series-comparison', permission: 'series:comparison' },
  { path: '/imports', permission: 'import:view' },
  { path: '/import-review', permission: 'import:view' },
  { path: '/entry', permission: 'entry:view' },
] as const

// 与 AppShell 的业务导航槽位顺序保持一致；管理端菜单负责授权与文案，
// 业务端既有导航结构负责决定“第一个菜单”。
const DEFAULT_ROUTE_ORDER = [
  '/overview',
  '/settlements',
  '/imports',
  '/settlement-detail',
  '/settlement-comparison',
  '/series-comparison',
] as const

export function routePermission(path: string): string | undefined {
  return ROUTE_PERMISSIONS.find((item) => item.path === path)?.permission
}

export function hasRoutePermission(path: string, permissions: readonly string[]): boolean {
  const permission = routePermission(path)
  return !permission || permissions.includes(permission)
}

export function firstAllowedPath(
  permissions: readonly string[],
  menus: readonly AuthMenu[] = [],
): string | null {
  const allowedMenuPaths = new Set(
    menus
      .filter((menu) => menu.isActive && Boolean(routePermission(menu.routePath)))
      .filter((menu) => !menu.permissionCode || permissions.includes(menu.permissionCode))
      .map((menu) => menu.routePath),
  )
  return DEFAULT_ROUTE_ORDER.find(
    (path) => allowedMenuPaths.has(path) && hasRoutePermission(path, permissions),
  ) ?? null
}

export function restoreSession(): Promise<AuthUser | null> {
  if (authReady.value) return Promise.resolve(currentUser.value)
  if (restorePromise) return restorePromise
  restorePromise = getCurrentUser()
    .then((user) => {
      setCurrentUser(user)
      return user
    })
    .catch((error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      setCurrentUser(null)
      return null
    })
    .finally(() => { restorePromise = null })
  return restorePromise
}

export function safeRedirect(value: unknown): string {
  const raw = typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
  const requestedPath = raw ? value.split('?')[0] : ''
  const permissions = currentUser.value?.permissions ?? []
  const menus = currentUser.value?.menus ?? []
  const requestedMenu = menus.find(
    (menu) => menu.routePath === requestedPath && menu.isActive,
  )
  const menuAllowsRequest = Boolean(
    requestedMenu
    && routePermission(requestedPath)
    && (!requestedMenu.permissionCode || permissions.includes(requestedMenu.permissionCode)),
  )
  if (raw && requestedPath === '/welcome') return value
  if (raw && menuAllowsRequest && hasRoutePermission(requestedPath, permissions)) return value
  return firstAllowedPath(permissions, menus) ?? '/welcome'
}
