# TODO

> 规则：只保留尚未完成的事项；完成后删除条目或移入 `DECISIONS.md` / Git 历史。
> 最后更新：2026-09-10

## P0 — 当前必须完成

- [ ] 端口描述：并发会话已在工作区把 `start.sh` / `vite.config.ts` 改为 `53000`（与 README 一致），
  尚未提交；确认其改动完整后收口提交

> 已完成并移除：在途改动拆分提交（`33a5aef`..`f892c49`）、修复 `farmer-ui-copy` 断言失败。

## P1 — 当前阶段

- [ ] 浏览器端手工验收：登录 / 注册 / 登出、数据导入、公开预览页 `/preview`、移动端布局
- [ ] 评估把 `.superpowers/`、`.superpowersigeria/`、`attachments/` 加入 `.gitignore`，
  降低 `git status` 噪音并避免真实结算单误提交（属于配置变更，需确认后再改）
- [ ] 为前端补 `npm test` / `typecheck` 脚本，统一测试入口，避免手写 `node --experimental-strip-types`
- [ ] 结算单单号身份（`settlement_no`）：按 `docs/superpowers/plans/2026-09-10-settlement-number-identity.md` 实施，
  实施前确认已有 MySQL 数据的回填与覆盖策略（ADR-008 仍为 Proposed）
- [ ] 补充导入异常路径与问题明细（`data_issue`）的回归测试

## P2 — 后续优化

- [ ] 销售地区维度：`sales_region` 字段已预留，待源数据带上地区后回填并出报表
- [ ] 利润测算（第二期）：依赖成本数据口径确认，见 ADR-003
- [ ] `analytics_service` 等模块按职责拆分，降低单文件复杂度（随 ADR-008 一并评估）
- [ ] 提升测试覆盖率；为「中间态提交」补一次 bisect 友好的验证策略

## Blocked

### 利润测算

- Blocked by：采购成本与国内物流/报关费用数据尚未提供，口径未确认。
- 下一步：用户提供成本表后，先确认主键与成本口径，再进入设计。

### 销售地区维度

- Blocked by：现有结算单没有销售地区字段。
- 下一步：确认数据来源后再回填，不得臆测地区值。
