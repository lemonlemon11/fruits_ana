import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyMenuItems,
  buildMenusByPath,
  type ShellMenuSlot,
} from '../src/utils/shellMenu.ts'

type MenuLike = Parameters<typeof applyMenuItems>[1] extends Map<string, infer M> ? M : never

function menu(overrides: Partial<MenuLike> & { routePath: string }): MenuLike {
  return {
    name: '管理端名称',
    icon: 'Upload',
    permissionCode: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }
}

const slot: ShellMenuSlot = {
  path: '/imports',
  label: '录单 / 导入',
  icon: 'local-icon',
  permission: 'import:view',
}

test('buildMenusByPath 按路由路径索引菜单', () => {
  const map = buildMenusByPath([
    menu({ routePath: '/imports' }),
    menu({ routePath: '/overview' }),
  ])
  assert.equal(map.size, 2)
  assert.equal(map.get('/overview')?.routePath, '/overview')
})

test('管理端改名后覆盖本地兜底文案', () => {
  const menus = buildMenusByPath([menu({ routePath: '/imports', name: '卖的怎么样' })])
  const [result] = applyMenuItems([slot], menus, () => null)

  assert.equal(result.label, '卖的怎么样')
  // 权限与高亮规则仍沿用本地槽位，不因菜单改名而丢失。
  assert.equal(result.permission, 'import:view')
  assert.equal(result.path, '/imports')
})

test('图标名命中白名单时替换，未命中时保留本地图标', () => {
  const hit = applyMenuItems(
    [slot],
    buildMenusByPath([menu({ routePath: '/imports', icon: 'Table2' })]),
    (name) => (name === 'Table2' ? 'resolved-table' : null),
  )
  assert.equal(hit[0].icon, 'resolved-table')

  const miss = applyMenuItems(
    [slot],
    buildMenusByPath([menu({ routePath: '/imports', icon: 'NotAnIcon' })]),
    () => null,
  )
  assert.equal(miss[0].icon, 'local-icon')
})

test('管理端停用菜单后业务端整项隐藏', () => {
  const menus = buildMenusByPath([menu({ routePath: '/imports', isActive: false })])
  assert.deepEqual(applyMenuItems([slot], menus, () => null), [])
})

test('菜单名称为空时回退到本地文案', () => {
  const menus = buildMenusByPath([menu({ routePath: '/imports', name: '' })])
  assert.equal(applyMenuItems([slot], menus, () => null)[0].label, '录单 / 导入')
})

test('未命中菜单的槽位保持兜底，避免未授权时导航整块消失', () => {
  const result = applyMenuItems([slot], buildMenusByPath([]), () => null)
  assert.deepEqual(result, [slot])
})
