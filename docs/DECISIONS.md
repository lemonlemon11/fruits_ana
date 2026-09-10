# Architecture Decisions

> 记录「为什么这么做」，防止不同模型反复推翻彼此的设计。
> 规则：已接受的决策若要推翻，必须新增一条 ADR 并说明原因，不要直接改写历史条目。
> 历史来源：`design/fruit-analysis 关键决策记录.md`（原型阶段，保持原样，不再续写）。
> 最后更新：2026-09-10

状态取值：`Accepted`（已生效）/ `Proposed`（待确认）/ `Superseded`（被取代）。

---

## ADR-001 — 使用 MySQL 作为唯一业务库

- Date：2026-09-09
- Status：Accepted
- Context：原型阶段以 SQLite 文件 + CSV 产物验证口径；正式系统需要并发访问、事务与
  多端共享数据。
- Decision：业务数据统一存 MySQL，应用通过 SQLAlchemy 2.0 + PyMySQL 访问。
- Why：1) 需要事务与并发写入；2) 需要长期运行的服务端存储；3) 已有 SQLite → MySQL
  迁移工具可平滑过渡。
- Alternatives：继续使用 SQLite（不采用：并发与部署形态不满足）；CSV/Excel 作为主存储
  （不采用：无法支撑查询与一致性）。
- Consequences：优点是可部署为服务并支持多人使用；缺点是引入了数据库运维与迁移成本，
  schema 变更必须配套可重复执行的迁移脚本。迁移工具见 `backend/scripts/migrate_sqlite_to_mysql.py`。

## ADR-002 — BC 等级归入 C 级

- Date：2026-09-08
- Status：Accepted
- Context：结算单品种规格存在 A / B / C / BC 四种等级标识，报表需要统一分级。
- Decision：`BC` 归入 `C`，界面显示为「C 果（含 BC）」。
- Why：历史报表标题「C 果（C/BC 级）」佐证口径一致。
- Consequences：导入后 `sale_record` 不再保留 BC 独立等级；展示文案需保持一致。

## ADR-003 — 第一期不做利润测算

- Date：2026-09-08
- Status：Accepted
- Context：最终目标包含利润测算，但当前没有采购成本与国内物流/报关费用数据。
- Decision：第一期只做存量销售数据的存档、导入与可视化；利润测算留待第二期，且必须先确认
  成本数据口径。
- Consequences：数据模型需为后续成本维度留出扩展空间，但不得凭空臆测字段结构。

## ADR-004 — 数据接入方式为整批文件上传

- Date：2026-09-08
- Status：Accepted
- Decision：用户维护 Excel/CSV 文件，通过 `/api/imports` 整批上传；暂不做粘贴文本解析或逐条表单录入。
- Consequences：解析器需兼容多种结算单版式（柜号在表头上方、日期合并、等级写在品种规格中）。

## ADR-005 — 认证采用服务端会话 + HttpOnly Cookie

- Date：2026-09-09
- Status：Accepted
- Context：需要登录才能访问业务页，但系统为单体应用、无第三方 OAuth 需求。
- Decision：使用 Argon2 哈希密码；登录后创建服务端会话，数据库只保存 token 的 SHA-256 哈希，
  浏览器通过 HttpOnly Cookie `fruit_session` 携带凭证，有效期 7 天。
- Why：1) 会话可服务端撤销（登出/失效）；2) Cookie 无法被前端 JS 读取，降低 XSS 窃取风险；
  3) 无需引入 JWT 签名密钥与刷新令牌机制。
- Alternatives：JWT（不采用：撤销成本高、需要额外密钥管理）；前端 localStorage 存 token
  （不采用：XSS 风险更高）。
- Consequences：水平扩展时需要共享会话存储；跨域部署需调整 Cookie 策略。

## ADR-006 — 指标口径以「金额 ÷ 数量」为准

- Date：2026-09-09
- Status：Accepted
- Decision：销售数量取 `quantity` 之和；销售金额取 `amount` 之和；加权均价 = 销售金额 / 销售数量，
  数量为 0 时返回空值；数量占比 = 某等级数量 / 同筛选范围总数量；日期筛选按销售日期计算。
- Consequences：所有新增报表必须复用同一口径，禁止在视图层重新定义平均值。

## ADR-007 — 前端不引入图表库与 UI 组件库

- Date：2026-09-09
- Status：Accepted
- Context：图表形态固定（趋势线、占比饼图、对比柱状），且需要适配移动端与换肤。
- Decision：图表以手写 SVG 组件实现，样式使用项目内 CSS 变量与 `styles-*.css`。
- Why：避免额外依赖体积与样式冲突，便于精确控制移动端布局与主题变量。
- Consequences：新增图表需要自行实现，改动时注意移动端断点与主题变量一致性。

## ADR-008 — 以「商号」作为结算单业务唯一键

- Date：2026-09-10
- Status：Accepted
- Context：柜号不唯一（637 与 640 两张结算单共用柜号 CBHU2970762），单号为客户侧编号且可能重复，
  仅用柜号会导致分析口径混淆；商号是我司记录的商业合同唯一单据号。
- Decision：`import_batch` 承担结算单职责并持有唯一业务键 `merchant_no`（商号），
  同时保存 `order_no`（单号）、`container_no`（柜号，可为空）、`vehicle_no`（转运车号）；
  分析、导出、前端全部以商号作为查询与归集维度，`sale_record` 不再保存柜号。
  同一商号再次导入默认返回 `conflict`，用户确认后以覆盖方式替换整张结算单。
- 界面约定：下拉框按用户要求展示**单号**，取值仍为商号（唯一键），避免重复柜号或重复单号造成误选。
- Why：1) 商号来自我司合同，业务上唯一且可追溯；2) 柜号可能缺失或重复，不适合做身份；
  3) 覆盖式导入保证「一张商号 = 一份最新结算单」，避免同一张单据出现多份明细。
- Alternatives：以单号 `settlement_no` 作唯一键（不采用：单号为客户侧编号，规则上允许重复）；
  以柜号作唯一键（不采用：已证明重复且可能缺失）。
- 依据文档：`docs/superpowers/specs/2026-09-10-merchant-number-dimension-design.md`、
  `docs/superpowers/plans/2026-09-10-merchant-number-dimension.md`；
  早期「单号唯一键」方案（`2026-09-10-settlement-number-identity-*`）已被本条目取代。
- Consequences：`sale_record.container_id/container_name`、`container_summary` 表已废弃，
  线上库需执行 `backend/scripts/backfill_settlement_identity.py` 完成表结构迁移与商号回填（含 SQL 快照）。
