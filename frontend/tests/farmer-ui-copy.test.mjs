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
  // 「录单 / 导入」是文件导入与手工录单合并后的单一入口（方案 C）。
  for (const label of ['卖得怎么样', '每一单', '录单 / 导入']) assert.match(shell, new RegExp(label))
  for (const icon of ['ChartColumn', 'Table2', 'ClipboardPen']) assert.match(shell, new RegExp(icon))
  const primaryNav = shell.match(/const primaryNavItems(?:\s*:\s*\w+\[\])? = \[[\s\S]*?\]/)?.[0] ?? ''
  const moreNav = shell.match(/const moreNavItems(?:\s*:\s*\w+\[\])? = \[[\s\S]*?\]/)?.[0] ?? ''
  assert.ok(primaryNav)
  assert.ok(moreNav)
  const navLabels = `${primaryNav}\n${moreNav}`
  assert.doesNotMatch(navLabels, /经营总览|单柜详情|导入数据|货柜对比|货柜详情|销售总览|数据明细/)
})

test('移动端用底部大按钮导航，完整功能收进「更多」', () => {
  const shell = fs.readFileSync(path.join(root, 'AppShell.vue'), 'utf8')
  assert.match(shell, /class="mobile-tabbar"/)
  assert.match(shell, /mobile-tabbar-more/)
  assert.match(shell, /const moreNavItems(:\s*\w+\[])? = \[[\s\S]*?\]/)
  for (const label of ['结算单详情', '结算单对比', '品牌对比']) {
    const match = shell.match(/const moreNavItems(?::\s*\w+\[])? = \[([\s\S]*?)\]/)
    assert.ok(match, 'moreNavItems definition not found')
    assert.match(match[1], new RegExp(label))
  }
})

test('页面内部不出现跨菜单跳转入口', () => {
  const pageFiles = ['OverviewView.vue', 'SettlementComparisonView.vue']
    .map((file) => path.join(root, 'views', file))
  const pageSource = pageFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(pageSource, /RouterLink|router\.push|router\.replace/)

  // 结算单列表的“查看明细”已改为复用导入二次确认页，属于已确认的单点查看入口。
  const settlementListView = fs.readFileSync(path.join(root, 'views', 'SettlementListView.vue'), 'utf8')
  assert.match(settlementListView, /router\.push\(\{ path: '\/import-review', query: \{ merchant_no: item\.merchantNo, readonly: '1' \} \}\)/)
  assert.doesNotMatch(settlementListView, /RouterLink|router\.replace/)

  // 数据导入可在当前流程内跳转到“二次确认”，不提供跨菜单入口。
  const importView = fs.readFileSync(path.join(root, 'views', 'ImportView.vue'), 'utf8')
  assert.match(importView, /router\.push\(\{ path: '\/import-review'/)
  assert.doesNotMatch(importView, /RouterLink|router\.replace/)

  // 结算单详情对“手工录单”需要提供“修改录单”入口，这是已确认的单点跳转。
  const settlementView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(settlementView, /router\.push/)
  assert.doesNotMatch(settlementView, /RouterLink|router\.replace/)
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
      const expected = name === 'SettlementView.vue'
        ? ['@change="refresh"', '@change="refresh"']
        : name === 'SettlementListView.vue'
          // 列表页有分页：切换商号 / 品牌都要回到第 1 页再查询。
          ? ['@change="refresh({ resetPage: true })"', '@change="refresh({ resetPage: true })"']
          : ['@change="refresh"']
      assert.deepEqual(matches, expected, `${name} 商号/品牌下拉应在切换后自动查询`)
      assert.match(content, /<SearchableSelect[\s\S]*?v-model="filters\.merchantNo"[\s\S]*?@change="refresh/)
      assert.doesNotMatch(content, /type="date"[^>]*@change/)
    } else {
      assert.deepEqual(matches, [], `${name} 不应在 change 时自动查询`)
    }
  }
})

test('结算单详情商号下拉默认选中当前品牌第一张，范围变化后回落到新的第一张', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /filters\.merchantNo = filteredOptions\.value\[0\]\?\.merchantNo \?\? ''/)
  assert.match(detailView, /!filteredOptions\.value\.some\(\(item\) => item\.merchantNo === filters\.merchantNo\)/)
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
    assert.match(content, /aria-label="商号"/)
    assert.match(content, /settlementOptionLabel/)
    assert.doesNotMatch(content, /<label>单号/)
    assert.doesNotMatch(content, /<label>货柜/)
  }
})

test('导入结果明确区分失败、重复和成功', () => {
  const importView = fs.readFileSync(path.join(root, 'views', 'ImportView.vue'), 'utf8')
  assert.match(importView, /await previewImports\(files\)/)
  assert.match(importView, /await loadBatches\(\)[\s\S]*router\.push\(\{ path: '\/import-review'/)
  assert.match(importView, /已生成 \$\{result\.draftCount\} 条待确认草稿/)
  assert.doesNotMatch(importView, /解析结果已进入质量检查/)
})

test('结算单选择器收进抽屉，靠搜索与品牌折叠定位，不平铺全部结算单', () => {
  const picker = fs.readFileSync(path.join(root, 'components', 'SettlementPicker.vue'), 'utf8')
  const pickerCss = fs.readFileSync(path.join(root, 'components', 'SettlementPicker.css'), 'utf8')
  const checkbox = pickerCss.match(/\.series-option input\[type='checkbox'\] \{[^}]*\}/)?.[0] ?? ''
  const options = pickerCss.match(/\.series-options \{[^}]*\}/)?.[0] ?? ''

  assert.match(checkbox, /appearance:\s*none/)
  assert.match(pickerCss, /:checked \{[\s\S]{0,240}data:image\/svg\+xml/)
  assert.match(options, /repeat\(auto-fill,\s*minmax\(\d+px,\s*1fr\)\)/)
  assert.match(picker, /:class="\{ selected: draft\.includes\(item\.merchantNo\) \}"/)
  // 单量变大后要靠搜索和折叠定位，并且只在点「确定」时刷新一次。
  assert.match(picker, /placeholder="搜品牌名"/)
  assert.match(picker, /placeholder="搜商号、单号或柜号"/)
  assert.match(picker, /filterSettlementOptions/)
  assert.match(picker, /paginateSettlementOptions/)
  assert.match(picker, /emit\('apply'/)
  const view = fs.readFileSync(path.join(root, 'views', 'SeriesComparisonView.vue'), 'utf8')
  assert.doesNotMatch(view, /class="series-picker"/)
  assert.match(view, /SettlementPicker/)
})

test('数据导入支持一次选择多个文件拖入，并保留文件选择与清空入口', () => {
  const importView = fs.readFileSync(path.join(root, 'views', 'ImportView.vue'), 'utf8')
  assert.match(importView, /@drop\.prevent\.stop="onDrop"/)
  assert.match(importView, /@dragenter\.prevent\.stop="onDragEnter"/)
  assert.match(importView, /selectedFiles\.value = supported/)
  assert.match(importView, /clearFiles/)
  assert.match(importView, /type="file" multiple/)
  assert.doesNotMatch(importView, /@drop="onDrop"/)
})

test('宽屏内容区域使用已确认的紧凑布局', () => {
  const shellStyles = fs.readFileSync(path.join(root, 'styles-shell.css'), 'utf8')
  assert.match(shellStyles, /width:\s*min\(100%,\s*2400px\)/)
  assert.match(shellStyles, /padding:\s*1\.41rem 1\.18rem 3\.29rem/)
  assert.match(shellStyles, /padding:\s*\.82rem 1\.18rem 1\.18rem/)
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

test('登录和注册页面支持邮箱', () => {
  const login = fs.readFileSync(path.join(root, 'views', 'LoginView.vue'), 'utf8')
  const register = fs.readFileSync(path.join(root, 'views', 'RegisterView.vue'), 'utf8')

  assert.ok(login.includes('用户名'))
  assert.ok(register.includes('用户名'))
  assert.ok(register.includes('密码'))
  assert.ok(register.includes('邮箱'))
  assert.ok(register.includes('验证码'))
  assert.ok(login.includes('邮箱'))
})

test('业务页面不再显示旧的两步查看说明', () => {
  for (const view of ['OverviewView.vue', 'SettlementComparisonView.vue', 'SettlementView.vue', 'SettlementListView.vue', 'SeriesComparisonView.vue', 'ImportView.vue']) {
    const content = fs.readFileSync(path.join(root, 'views', view), 'utf8')
    assert.doesNotMatch(content, /class="how-to"/)
    assert.doesNotMatch(content, /怎么查看/)
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

test('结算单详情只在同品牌还有别的结算单时才请求同品牌分析', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  // 后端要求「同品牌至少还有一张结算单」，前端先做同一判断，避免必然失败的请求。
  assert.match(detailView, /countSameBrandPeers\(options\.value, activeMerchantNo\.value\)/)
  assert.match(detailView, /sameBrandPeerCount\.value > 0/)
  assert.match(detailView, /empty-title="该品牌暂无其他结算单"/)
  const card = fs.readFileSync(path.join(root, 'components', 'AiAnalysisCard.vue'), 'utf8')
  assert.match(card, /emptyTitle: '先勾选结算单'/)
  assert.match(card, /<strong>\{\{ emptyTitle \}\}<\/strong>/)
})
