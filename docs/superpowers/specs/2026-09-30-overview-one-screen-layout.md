# 销售总览「一屏看板」布局存档（已回退前的完整设计）

> 状态：**已从 dev 回退存档**。本文件完整记录 2026-09-30 落地到真实页面的销售总览
> 看板设计（设计定稿 = dev-preview v4.2.3，见
> `docs/superpowers/plans/2026-09-29-overview-one-screen-spec-detail.md` 全程记录）。
> 代码备份于分支 **`backup/overview-one-screen-dashboard`**（含 64f0d92 落地 +
> 3f7c9f2 压缩两提交）；恢复方法见文末。

## 一、整页结构（自上而下，应用外壳内）

```
┌ 应用外壳：左侧导航 + 顶栏 + 页签栏（本页隐藏页脚、收紧 main 底部留白） ┐
│ 1 筛选栏（紧凑）：日期范围（吃满剩余行宽）｜国家｜市场｜查看结果      │
│ 2 通栏大数带（单卡，1px 竖线分格）                                  │
│   [销售金额 hero·选中态][总件数][每件均价·绿底面板][总柜数]          │
│   副行：A果 ¥x/件 · B果 ¥x/件 · C果(含BC) ¥x/件 ｜ 近期单据小注     │
│ 3 每日趋势（全宽，flex 吸收余量）：直线折线 + 全点两档上置数值标注   │
│   标题右注「指标名 · 单位：万元/件/元每件/柜」                       │
│ 4 三卡行（内容首行同线顶对齐）                                       │
│   [等级件数结构 ConicDonut][等级均价横条][市场销售分析 环图+条形]    │
│ 5 规格件数与均价：A/B/C 三列摘要卡（共用网格模板纵向对齐）           │
│   每卡：小计行 + 前3规格行 + 其他N个 + 底部「查看明细 ▾」           │
│   点查看明细 → ElDialog 弹层：该等级六列明细表（品牌小计+等级合计）  │
└ 固定填充高度 + overflow hidden：整页永不滚动 ─────────────────────┘
```

## 二、核心交互

1. **大数带 ↔ 每日趋势联动**：四格可点击（role=button/键盘/aria-pressed），点击切换
   趋势指标。四档口径（`utils/trendMetrics.ts`）：金额=Σ、件数=Σ、
   **每日均价=当日金额÷当日件数**、**每日柜数=当日在售结算单数**（trend 接口的
   container_count，`normalize.ts` 已补映射）。选中格=primary-soft 底+2px 描边。
2. **趋势图标注纪律**（穿模问题的最终解）：直线段（smooth:false）；数值标签**全部在
   点上方**、近/远两档交错（label distance 交替 5/19）——点下方与日期行之间永无标签；
   y 轴隐藏、单位上移标题注；峰值/末值加粗深墨绿；柜数 0 值日不标注；
   `grid.containLabel` + 日期标签 margin 10 + hideOverlap。
3. **等级明细弹层**：各等级卡「查看明细」→ ElDialog（append-to-body），标题
   「A果 · 规格明细（共 X 件 · 加权均价 ¥Y）」，六列表（品牌/头数/KG/备注/总件数/
   每件均价）数字右对齐、浅绿表头、品牌小计 + 等级合计行；遵循品牌筛选。

## 三、CSS 系统（一屏保证）

- **流体字号**：页面容器 `font-size: clamp(12.5px, 6px + 0.35vw, 15px)`，内部一律
  em（脱离全站 17px 基准）；数字 Bahnschrift + tabular-nums；¥ 前缀 46% 缩小。
- **固定填充高度**：`height: calc(100dvh − var(--app-header-height) −
  var(--app-tabs-height) − 2.83rem)`（100vh 回退）+ `overflow: hidden`；
  ≤760px 极矮窗口回退可滚动。外壳配合（仅本页生效）：
  `main#main-content:has(> .overview-page) { padding-bottom: 1.18rem }` 与
  `.app-workspace:has(...) > .app-footer { display: none }`。
- **弹性分配**：趋势卡 `flex: 1.08 1 200px`、规格卡 `flex: 1 1 190px` 吸收视口余量；
  摘要行容器 `space-evenly`。
- **压缩项**：筛选控件 :deep 覆盖 2.2rem 高/0.92em 字号（仅本页）；市场×品牌条形限
  前 6 行 + 「其他 N 项 · 合计」；趋势图 min-height 136。
- **断点**：<1560 三卡 2+1；<1120 大数带 2×2、摘要单列（三卡仍 2+1）；
  ≤1060 高 三卡强制横排；≤800 高 字号降档/间距再收；≤760 高 回退滚动。

## 四、实测矩阵（均恰一屏，PAGE_HEIGHT=视口高）

1920×1080 / 1710×1014（用户实际）/ 2560×1350 / 2560×1440 / 1376×1032（iPad 13 横）/
1366×1024（iPad 12.9 横）/ 1032×1376 与 1024×1366（竖）/ 1366×768（回退滚动兜底）。
验证方法（可复用）：恢复库 sqlite 副本起本地后端（老库需按模型 ALTER 补列）+ 注册
临时用户 seed 权限 + dist 静态代理 Cookie 注入 + 无头探针（?probe=modal/height）。

## 五、文件清单（backup 分支内）

- `frontend/src/views/OverviewView.vue`（整体重写）
- `frontend/src/components/DailySalesTrendChart.vue`（重写：metric prop + 标注纪律）
- `frontend/src/components/ConicDonut.vue`（新增：纯 CSS conic 环图 + 图例）
- `frontend/src/components/MarketSalesAnalysis.vue`（重写：紧凑 CSS 版，弃 echarts）
- `frontend/src/components/SettlementGradeBreakdown.vue`（overview 变体=三列摘要+弹层；
  detail 变体七列整表与回退前完全相同）
- `frontend/src/utils/trendMetrics.ts`（新增：四档指标口径）
- `frontend/src/api/normalize.ts`（trend 补 container_count 映射）
- `frontend/tests/overview-filters.test.ts`（断言新版）
- 设计语言依据：variant-O 通栏大数带定稿（`dev-preview/redesign-20260929/`）

## 六、恢复方法

```bash
# 方式一：整批恢复（推荐）
git cherry-pick 64f0d92 3f7c9f2        # 或 git merge backup/overview-one-screen-dashboard

# 方式二：查看/挑文件
git checkout backup/overview-one-screen-dashboard -- <path>
```

回退时 dev 已重建 dist 并全绿验证（314/314）。回退不影响：结算单详情页七列规格表
（detail 变体从未改）、市场销售分析以外的其它页面、以及 dev-preview 演示稿（53005）。
