import assert from 'node:assert/strict'
import test from 'node:test'

import { currentUser, firstAllowedPath, safeRedirect, setCurrentUser } from '../src/auth.ts'
import { applyMenuItems, type ShellMenuSlot } from '../src/utils/shellMenu.ts'
import type { AuthMenu } from '../src/api/types.ts'

function menu(overrides: Partial<AuthMenu> & Pick<AuthMenu, 'routePath'>): AuthMenu {
  return {
    routePath: overrides.routePath,
    name: '菜单',
    icon: null,
    permissionCode: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }
}

const overview = menu({ routePath: '/overview', permissionCode: 'overview:view', sortOrder: 10 })
const settlements = menu({ routePath: '/settlements', name: '每一单', permissionCode: 'settlement:list', sortOrder: 20 })
const imports = menu({ routePath: '/imports', permissionCode: 'import:view', sortOrder: 30 })

test('默认入口只从角色已分配菜单选择，不因残留权限打开卖得怎么样', () => {
  assert.equal(
    firstAllowedPath(['overview:view', 'settlement:list'], [settlements]),
    '/settlements',
  )
})

test('默认入口遵循业务端导航顺序，不受不同目录下重复 sortOrder 影响', () => {
  assert.equal(
    firstAllowedPath(
      ['settlement:list', 'settlement:detail'],
      [
        menu({ routePath: '/settlement-detail', permissionCode: 'settlement:detail', sortOrder: 10 }),
        settlements,
      ],
    ),
    '/settlements',
  )
})

test('角色没有分配任何菜单时不回落到卖得怎么样', () => {
  assert.equal(firstAllowedPath(['overview:view'], []), null)
})

test('停用菜单不能作为默认入口，继续选择下一个启用菜单', () => {
  assert.equal(
    firstAllowedPath(
      ['overview:view', 'settlement:list'],
      [
        { ...overview, isActive: false, sortOrder: 10 },
        settlements,
      ],
    ),
    '/settlements',
  )
})

test('角色未分配的导航槽位不应继续显示本地兜底菜单', () => {
  const slots: ShellMenuSlot[] = [
    { path: '/overview', label: '卖得怎么样', icon: 'overview', permission: 'overview:view' },
    { path: '/settlements', label: '每一单', icon: 'settlements', permission: 'settlement:list' },
  ]

  assert.deepEqual(
    applyMenuItems(slots, new Map([['/settlements', settlements]]), () => null),
    [slots[1]],
  )
})

test('角色没有任何菜单时导航为空，不应显示本地兜底菜单', () => {
  const slot: ShellMenuSlot = {
    path: '/overview',
    label: '卖得怎么样',
    icon: 'overview',
    permission: 'overview:view',
  }

  assert.deepEqual(applyMenuItems([slot], new Map(), () => null), [])
})

test('没有可用菜单时登录落到欢迎页', () => {
  setCurrentUser({
    id: 1,
    displayName: '无菜单用户',
    permissions: ['overview:view'],
    menus: [],
  })

  assert.equal(safeRedirect(undefined), '/welcome')
  setCurrentUser(null)
  assert.equal(currentUser.value, null)
})

test('登录链接残留未分配菜单地址时仍落到欢迎页', () => {
  setCurrentUser({
    id: 1,
    displayName: '无菜单用户',
    permissions: ['overview:view'],
    menus: [],
  })

  assert.equal(safeRedirect('/overview'), '/welcome')
  setCurrentUser(null)
})
