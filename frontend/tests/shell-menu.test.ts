import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyMenuItems,
  buildMenuGroups,
  buildMenusByPath,
  type ShellMenuSlot,
} from '../src/utils/shellMenu.ts'

type MenuLike = Parameters<typeof applyMenuItems>[1] extends Map<string, infer M> ? M : never

function menu(overrides: Partial<MenuLike> & { routePath: string | null }): MenuLike {
  return {
    id: 1,
    routePath: overrides.routePath,
    name: '管理端名称',
    parentId: null,
    menuType: 'menu',
    icon: 'Upload',
    permissionCode: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }
}

function directory(overrides: Partial<MenuLike> & { id: number }): MenuLike {
  return menu({ routePath: null, menuType: 'directory', name: '目录', ...overrides })
}

const slot: ShellMenuSlot = {
  path: '/imports',
  label: '录单 / 导入',
  icon: 'local-icon',
  permission: 'import:view',
}

const slots: ShellMenuSlot[] = [
  { path: '/overview', label: '卖得怎么样', icon: 'overview-icon', permission: 'overview:view' },
  { path: '/settlements', label: '每一单', icon: 'settlements-icon', permission: 'settlement:list' },
  slot,
  { path: '/settlement-detail', label: '结算单详情', icon: 'detail-icon', permission: 'settlement:detail' },
  { path: '/series-comparison', label: '品牌对比', icon: 'series-icon', permission: 'series:comparison' },
]

test('buildMenusByPath 按路由路径索引菜单，目录不进索引', () => {
  const map = buildMenusByPath([
    menu({ id: 2, routePath: '/imports' }),
    menu({ id: 1, routePath: '/overview' }),
    directory({ id: 10, routePath: null }),
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

test('未命中菜单的槽位不显示本地兜底，导航以角色菜单分配为准', () => {
  const result = applyMenuItems([slot], buildMenusByPath([]), () => null)
  assert.deepEqual(result, [])
})

test('buildMenuGroups 按目录分组，未挂目录的叶子作为无标题一级入口穿插', () => {
  const groups = buildMenuGroups(
    [
      directory({ id: 30, name: '销售分析', sortOrder: 30 }),
      directory({ id: 20, name: '销售单管理', sortOrder: 20 }),
      menu({ id: 1, routePath: '/overview', sortOrder: 10 }),
      menu({ id: 2, routePath: '/settlements', parentId: 20, name: '每一单', sortOrder: 10 }),
      menu({ id: 3, routePath: '/imports', parentId: 20, sortOrder: 20 }),
      menu({ id: 4, routePath: '/settlement-detail', parentId: 30, sortOrder: 10 }),
      menu({ id: 5, routePath: '/series-comparison', parentId: 30, sortOrder: 20 }),
    ],
    slots,
    () => null,
  )

  assert.deepEqual(
    groups.map((group) => ({ label: group.label, paths: group.items.map((item) => item.path) })),
    [
      { label: null, paths: ['/overview'] },
      { label: '销售单管理', paths: ['/settlements', '/imports'] },
      { label: '销售分析', paths: ['/settlement-detail', '/series-comparison'] },
    ],
  )
  // 子菜单沿用本地槽位的权限码，名称可用管理端覆盖。
  assert.equal(groups[1].items[0].permission, 'settlement:list')
  assert.equal(groups[1].items[0].label, '每一单')
})

test('目录未授权或已停用时，子菜单退化为无标题一级入口', () => {
  const groups = buildMenuGroups(
    [
      directory({ id: 20, name: '销售单管理', isActive: false, sortOrder: 20 }),
      menu({ id: 2, routePath: '/settlements', name: '每一单', parentId: 20, sortOrder: 10 }),
      menu({ id: 3, routePath: '/imports', name: '录单 / 导入', parentId: 99, sortOrder: 20 }),
    ],
    slots,
    () => null,
  )

  assert.deepEqual(groups, [
    {
      label: null,
      items: [
        { ...slots[1], label: '每一单' },
        { ...slots[2], label: '录单 / 导入' },
      ],
    },
  ])
})

test('子菜单未命中本地槽位时不渲染，空目录整组丢弃', () => {
  const groups = buildMenuGroups(
    [
      directory({ id: 20, name: '销售单管理', sortOrder: 20 }),
      menu({ id: 2, routePath: '/unknown-page', parentId: 20, sortOrder: 10 }),
      menu({ id: 1, routePath: '/overview', name: '卖得怎么样', sortOrder: 10 }),
    ],
    slots,
    () => null,
  )

  assert.deepEqual(groups, [{ label: null, items: [{ ...slots[0], label: '卖得怎么样' }] }])
})

test('停用的叶子菜单不进分组', () => {
  const groups = buildMenuGroups(
    [
      directory({ id: 20, name: '销售单管理', sortOrder: 20 }),
      menu({ id: 2, routePath: '/settlements', parentId: 20, isActive: false, sortOrder: 10 }),
      menu({ id: 3, routePath: '/imports', name: '录单 / 导入', parentId: 20, sortOrder: 20 }),
    ],
    slots,
    () => null,
  )

  assert.deepEqual(groups, [{ label: '销售单管理', items: [{ ...slots[2], label: '录单 / 导入' }] }])
})
