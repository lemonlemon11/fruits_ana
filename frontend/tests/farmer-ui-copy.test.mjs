import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const files = fs.readdirSync(root, { recursive: true })
  .filter((file) => file.endsWith('.vue'))
  .map((file) => path.join(root, file))
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

test('菜单使用确认后的中文入口', () => {
  const shell = fs.readFileSync(path.join(root, 'AppShell.vue'), 'utf8')
  // 面向果农的主导航只保留三个大白话入口，其余收进「更多功能」。
  for (const label of ['卖得怎么样', '每一单', '数据导入']) assert.match(shell, new RegExp(label))
  for (const icon of ['ChartColumn', 'Table2', 'Upload']) assert.match(shell, new RegExp(icon))
  assert.match(shell, /const primaryNavItems = \[[\s\S]*?\]/)
  assert.doesNotMatch(shell, /经营总览|单柜详情|导入数据|货柜对比|货柜详情|销售总览|数据明细/)
})

test('移动端用底部大按钮导航，完整功能收进「更多」', () => {
  const shell = fs.readFileSync(path.join(root, 'AppShell.vue'), 'utf8')
  assert.match(shell, /class="mobile-tabbar"/)
  assert.match(shell, /mobile-tabbar-more/)
  assert.match(shell, /const moreNavItems = \[[\s\S]*?\]/)
  for (const label of ['结算单详情', '结算单对比', '系列对比']) {
    assert.match(shell.split('const moreNavItems')[1].split(']')[0], new RegExp(label))
  }
})

test('页面内部不出现跨菜单跳转入口', () => {
  const pageFiles = ['OverviewView.vue', 'SettlementComparisonView.vue', 'SettlementView.vue', 'SettlementListView.vue', 'ImportView.vue']
    .map((file) => path.join(root, 'views', file))
  const pageSource = pageFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(pageSource, /RouterLink|router\.push|router\.replace/)
})

test('结算单列表只展示当前页面的对比结果', () => {
  const comparison = fs.readFileSync(path.join(root, 'components', 'SettlementComparison.vue'), 'utf8')
  assert.doesNotMatch(comparison, /RouterLink|router\.push|router\.replace/)
  assert.doesNotMatch(comparison, /查看详情|前往详情|进入详情/)
})

test('所有商号下拉在切换后自动查询，日期筛选仍需点击按钮', () => {
  const autoQuery = /@change\s*=\s*["'][^"']*(refresh|loadBatches)[^"']*["']/g
  const merchantSelectViews = ['OverviewView.vue', 'SettlementView.vue', 'SettlementListView.vue']
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const matches = content.match(autoQuery) ?? []
    const name = path.basename(file)
    if (merchantSelectViews.includes(name)) {
      assert.deepEqual(matches, ['@change="refresh"'], `${name} 商号下拉应在切换后自动查询`)
      assert.match(content, /<select v-model="filters\.merchantNo"[^>]*@change="refresh"/)
      assert.doesNotMatch(content, /type="date"[^>]*@change/)
    } else {
      assert.deepEqual(matches, [], `${name} 不应在 change 时自动查询`)
    }
  }
})

test('结算单详情商号下拉默认选中第一张，范围变化后回落到新的第一张', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /filters\.merchantNo = options\.value\[0\]\?\.merchantNo \?\? ''/)
  assert.match(detailView, /!options\.value\.some\(\(item\) => item\.merchantNo === filters\.merchantNo\)/)
})

test('结算单详情只使用最近一次成功查询的商号展示结果', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /const activeMerchantNo = ref\(''\)/)
  assert.match(detailView, /activeMerchantNo\.value = requestedMerchantNo/)
  assert.match(detailView, /item\.merchantNo === activeMerchantNo\.value/)
  assert.doesNotMatch(detailView, /销售周期：\{\{ filters\.merchantNo/)
})

test('结算单详情使用同期其他结算单作为价格基线并保留链接日期', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /buildOtherSettlementGradeBaseline/)
  assert.match(detailView, /其他结算单/)
  assert.match(detailView, /route\.query\.start_date/)
  assert.match(detailView, /route\.query\.end_date/)
  assert.doesNotMatch(detailView, /getOverview/)
})

test('筛选字段用商号取值、按「商号（单号）」展示', () => {
  for (const view of ['OverviewView.vue', 'SettlementView.vue', 'SettlementListView.vue']) {
    const content = fs.readFileSync(path.join(root, 'views', view), 'utf8')
    assert.match(content, /<label>商号/)
    assert.match(content, /settlementOptionLabel/)
    assert.doesNotMatch(content, /<label>单号/)
    assert.doesNotMatch(content, /<label>货柜/)
  }
})

test('导入结果明确区分失败、重复和成功', () => {
  const importView = fs.readFileSync(path.join(root, 'views', 'ImportView.vue'), 'utf8')
  assert.match(importView, /summarizeImportResults/)
  assert.match(importView, /await loadBatches\(\)[\s\S]*const summary = summarizeImportResults/)
  assert.doesNotMatch(importView, /解析结果已进入质量检查/)
})

test('结算单多选使用自绘勾选框与自适应卡片，避免整行拉出一条空白', () => {
  const view = fs.readFileSync(path.join(root, 'views', 'SeriesComparisonView.vue'), 'utf8')
  const checkbox = view.match(/\.series-option input\[type='checkbox'\] \{[^}]*\}/)?.[0] ?? ''
  const options = view.match(/\.series-options \{[^}]*\}/)?.[0] ?? ''

  assert.match(checkbox, /appearance:\s*none/)
  assert.match(view, /:checked \{[\s\S]{0,240}data:image\/svg\+xml/)
  assert.match(options, /repeat\(auto-fill,\s*minmax\(\d+px,\s*1fr\)\)/)
  assert.match(view, /:class="\{ selected: selected\.includes\(item\.merchantNo\) \}"/)
})

test('数据导入支持多文件拖入，并保留文件选择与清空入口', () => {
  const importView = fs.readFileSync(path.join(root, 'views', 'ImportView.vue'), 'utf8')
  assert.match(importView, /@drop\.prevent\.stop="onDrop"/)
  assert.match(importView, /@dragenter\.prevent\.stop="onDragEnter"/)
  assert.match(importView, /addSelectedFiles/)
  assert.match(importView, /clearFiles/)
  assert.match(importView, /type="file" multiple/)
  assert.doesNotMatch(importView, /@drop="onDrop"/)
})

test('宽屏内容区域使用已确认的紧凑布局', () => {
  const shellStyles = fs.readFileSync(path.join(root, 'styles-shell.css'), 'utf8')
  assert.match(shellStyles, /width:\s*min\(100%,\s*1680px\)/)
  assert.match(shellStyles, /padding:\s*24px 28px 56px/)
})

test('认证页面和业务路由保护已接入', () => {
  const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8')
  const shell = fs.readFileSync(path.join(root, 'AppShell.vue'), 'utf8')
  assert.match(main, /path:\s*['"]\/login['"]/)
  assert.match(main, /path:\s*['"]\/register['"]/)
  assert.match(main, /requiresAuth:\s*true/)
  assert.match(main, /beforeEach/)
  assert.match(shell, /currentUser/)
  assert.match(shell, /退出登录/)
})

test('登录和注册页面使用用户名，不要求邮箱', () => {
  const login = fs.readFileSync(path.join(root, 'views', 'LoginView.vue'), 'utf8')
  const register = fs.readFileSync(path.join(root, 'views', 'RegisterView.vue'), 'utf8')
  assert.match(login, /用户名/)
  assert.match(register, /用户名|姓名/)
  assert.doesNotMatch(login, /邮箱/)
  assert.doesNotMatch(register, /邮箱/)
})

test('五个页面都提供清晰的两步查看说明', () => {
  for (const view of ['OverviewView.vue', 'SettlementComparisonView.vue', 'SettlementView.vue', 'SettlementListView.vue', 'SeriesComparisonView.vue', 'ImportView.vue']) {
    const content = fs.readFileSync(path.join(root, 'views', view), 'utf8')
    assert.match(content, /class="how-to"/)
    assert.match(content, /怎么查看/)
    assert.match(content, /第一步/)
    assert.match(content, /第二步/)
  }
  assert.doesNotMatch(source, /scenario-switch|view-switch|drop-zone|progress-line/)
})

test('可见界面不含英文装饰标题或状态词', () => {
  const visibleTemplates = files.map((file) => {
    const content = fs.readFileSync(file, 'utf8')
    return content.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''
  }).join('\n')
  const withoutBindings = visibleTemplates.replace(/\{\{[\s\S]*?\}\}/g, '')
  assert.doesNotMatch(withoutBindings, />[^<]*\b(?:MANAGEMENT|CURRENT|CONTAINER|DATA|STEP|IMPORT|GRADE|BENCHMARK|ATTENTION|CSV|XLSX|failed|warning|success)\b[^<]*</i)
})
