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

test('页面内部不出现跨菜单跳转入口', () => {
  const pageFiles = ['OverviewView.vue']
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

test('商号/国家/市场下拉与日期快捷筛选在切换后自动查询，手动日期仍需点击按钮', () => {
  const autoQuery = /@change\s*=\s*["'][^"']*(refresh|loadBatches)[^"']*["']/g
  const merchantSelectViews = ['SettlementView.vue', 'SettlementListView.vue']
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const matches = content.match(autoQuery) ?? []
    const name = path.basename(file)
    if (name === 'OverviewView.vue') {
      // 卖得怎么样：日期快捷筛选 + 国家 + 市场三处切换即查询；商号下拉已下线。
      assert.deepEqual(
        matches,
        ['@change="refresh"', '@change="refresh"', '@change="refresh"'],
        'OverviewView 日期快捷/国家/市场切换后应自动查询',
      )
      assert.match(content, /<SearchableSelect[\s\S]*?v-model="filters\.country"[\s\S]*?@change="refresh/)
      assert.match(content, /<SearchableSelect[\s\S]*?v-model="filters\.market"[\s\S]*?@change="refresh/)
      assert.doesNotMatch(content, /filters\.merchantNo/)
      assert.doesNotMatch(content, /type="date"[^>]*@change/)
    } else if (merchantSelectViews.includes(name)) {
      const expected = name === 'SettlementView.vue'
        // 详情页：日期快捷 + 商号 + 品牌三处切换即查询。
        ? ['@change="refresh"', '@change="refresh"', '@change="refresh"']
        // 列表页有分页：日期快捷 / 商号 / 品牌都要回到第 1 页再查询。
        : ['@change="refresh({ resetPage: true })"', '@change="refresh({ resetPage: true })"', '@change="refresh({ resetPage: true })"']
      assert.deepEqual(matches, expected, `${name} 日期快捷/商号/品牌下拉应在切换后自动查询`)
      assert.match(content, /<SearchableSelect[\s\S]*?v-model="filters\.merchantNo"[\s\S]*?@change="refresh/)
      assert.match(content, /<DateRangeFilter[\s\S]*?:months="quickMonths"[\s\S]*?@change/)
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

test('销售详情保留链接日期回填，趋势/同期对比/异常提醒/结算明细抽屉已删除', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /route\.query\.start_date/)
  assert.match(detailView, /route\.query\.end_date/)
  assert.doesNotMatch(detailView, /getOverview|getTrend|TrendChart/)
  assert.doesNotMatch(detailView, /buildOtherSettlementGradeBaseline|同期均价对比/)
  assert.doesNotMatch(detailView, /需要关注|formatAnomalyValue/)
  assert.doesNotMatch(detailView, /查看结算与明细|secondary-drawer/)
})

test('销售详情区块标题带单号前缀，等级表现更名为销售表现', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /const sectionTitlePrefix = computed\(\(\) =>/)
  assert.match(detailView, /displayOrderNo\(selectedOption\.value \?\? detail\.value \?\? \{\}\)/)
  assert.match(detailView, /`\$\{sectionTitlePrefix\} 销售表现`/)
  assert.match(detailView, /`\$\{sectionTitlePrefix\} 规格件数与均价`/)
  assert.match(detailView, /:title="`\$\{sectionTitlePrefix\} 同品牌经营分析`"/)
  assert.doesNotMatch(detailView, /等级表现|等级图表/)
})

test('销售详情新增按日均价走势折线图，跟随等级筛选与单号前缀', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /import SettlementDailyPriceChart from '\.\.\/components\/SettlementDailyPriceChart\.vue'/)
  assert.match(detailView, /:records="detail\?\.records \?\? \[\]"/)
  assert.match(detailView, /:grade-order="visibleGradeOrder"/)
  assert.match(detailView, /:title="`\$\{sectionTitlePrefix\} 按日均价走势`"/)
  // 按日均价走势与规格件数与均价同行展示（图左窄、表右宽、等高拉伸），窄屏回落单列；
  // 与上方「销售表现」的间隔由 margin-top 提供（面板内区块分隔线已清零）。
  assert.match(detailView, /class="detail-row-layout"/)
  assert.match(detailView, /\.detail-row-layout \{ display: grid; grid-template-columns: minmax\(260px, \.6fr\) minmax\(0, 1\.4fr\)/)
  assert.match(detailView, /align-items: stretch/)
  assert.match(detailView, /margin-top: 24px/)
  assert.match(detailView, /@media \(max-width: 1079px\)[\s\S]*?\.detail-row-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/)
  const chart = fs.readFileSync(path.join(root, 'components', 'SettlementDailyPriceChart.vue'), 'utf8')
  // 均价按当日金额÷当日件数加权，排除未选等级的记录；说明固定一行（多天=口径、单天=提示），
  // 保证与右侧「规格件数与均价」的标题区对齐。
  assert.match(chart, /dailyGradeOrder\.value\.includes\(record\.grade\)/)
  assert.match(chart, /point\.amount \/ point\.quantity/)
  assert.match(chart, /'本单销售集中在 1 天' : '每件均价 = 当日金额 ÷ 当日件数'/)
  // 样式：柱线组合（量+价）——浅色圆角柱=当日件数（左轴），折线+圆点=每件均价（右轴）。
  assert.match(chart, /type: 'bar'/)
  assert.match(chart, /yAxisIndex: 1/)
  assert.match(chart, /name: '元\/件'/)
  // 图高随右侧规格表等高撑满（height 100% + flex），单列/移动端回落 280px 兜底。
  assert.match(chart, /height="100%"/)
  assert.match(chart, /\.daily-price-figure \{ display: flex; flex: 1 1 auto; min-height: 280px; \}/)
})

test('销售详情经营指标挪入销售表现区，单号后展示国家', () => {
  const detailView = fs.readFileSync(path.join(root, 'views', 'SettlementView.vue'), 'utf8')
  assert.match(detailView, /const settlementMetrics = computed/)
  assert.match(detailView, /class="settlement-fact-grid metric-strip" aria-label="结算单经营指标"/)
  for (const label of ['来货数量（件）', '销量', '销售金额', '售后金额/售后比', '市场费用', '应付贵方金额']) {
    assert.match(detailView, new RegExp(`label: '${label}'`))
  }
  // 经营指标条插在「销售表现」标题与等级卡片之间（GradeSummary 的 after-heading 插槽）。
  assert.match(detailView, /<template #after-heading>/)
  // 基础信息条只保留登记类字段，国家紧跟单号。
  const factsMatch = detailView.match(/const settlementFacts = computed\(\(\) => \{[\s\S]*?\n\}\)/)
  assert.ok(factsMatch, 'settlementFacts not found')
  assert.match(factsMatch[0], /label: '商号'[\s\S]*?label: '市场'[\s\S]*?label: '单号'[\s\S]*?label: '国家'/)
  assert.doesNotMatch(factsMatch[0], /来货数量|售后金额\/售后比|应付贵方金额|市场费用/)
  assert.match(detailView, /hide-total-strip/)
  // banner 已删除，商号收进基础信息条第一位；手工录单操作改为信息条下方的操作行。
  assert.doesNotMatch(detailView, /settlement-banner|settlement-identity/)
  assert.match(detailView, /class="manual-entry-bar"/)
  // 规格表品牌列用详情接口返回的品牌，避免落到「未识别品牌」。
  assert.match(detailView, /:brand="detail\?\.brand"/)
})

test('筛选字段用商号取值、按「商号（单号）」展示', () => {
  // 卖得怎么样已改为国家/市场筛选，不在商号下拉清单内。
  for (const view of ['SettlementView.vue', 'SettlementListView.vue']) {
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
  const options = pickerCss.match(/\.series-options \{[^}]*\}/)?.[0] ?? ''

  // 抽屉本体改用 ElDrawer，结算单选项改用 ElCheckbox（选中态用 is-checked 类表达）。
  assert.match(picker, /<ElDrawer/)
  assert.match(picker, /direction="rtl"/)
  assert.match(picker, /<ElCheckbox[\s\S]*?class="series-option"/)
  assert.match(picker, /:model-value="draft\.includes\(item\.merchantNo\)"/)
  assert.match(pickerCss, /\.series-option\.is-checked/)
  assert.match(options, /repeat\(auto-fill,\s*minmax\(\d+px,\s*1fr\)\)/)
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
  for (const view of ['OverviewView.vue', 'SettlementView.vue', 'SettlementListView.vue', 'SeriesComparisonView.vue', 'ImportView.vue']) {
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

test('区块标题下的辅助说明文案已清理（状态类提示保留）', () => {
  // 用户要求移除标题旁的静态辅助描述；加载中 / 空态 / 计数等状态文案不在清理范围。
  const sweptNotes = [
    ['components/GradeSummary.vue', /每件均价 = 销售金额 ÷ 销量/],
    ['components/SettlementGradeBreakdown.vue', /sectionNote/],
    ['components/MarketSalesAnalysis.vue', /柜数按市场、品牌统计/],
    ['components/DailySalesTrendChart.vue', /按销售日期汇总当日/],
    ['components/GradePieChart.vue', /按件数占比/],
    ['components/SeriesGradeTables.vue', /各等级独立核算/],
    ['views/ImportView.vue', /只在需要时展开问题明细/],
  ]
  for (const [file, pattern] of sweptNotes) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), pattern, `${file} 仍含标题辅助说明`)
  }
})
