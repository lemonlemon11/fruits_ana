# TODO

> 规则：只保留尚未完成的事项；完成后删除条目或移入 `DECISIONS.md` / Git 历史。
> 最后更新：2026-09-10

## P0 — 当前必须完成

- [ ] 处理 42 个已修改文件 + 未跟踪文件组成的在途改动：先跑通验证，再按功能拆分提交
  （建议顺序：设计文档归档 → 后端认证 → 前端认证与公开预览 → 测试与样式）
- [ ] 修复 `frontend/tests/farmer-ui-copy.test.mjs` 中关于 `ImportView.vue` 语句顺序的陈旧断言
- [ ] 统一 README 与代码的前端端口描述（README 写 `53000`，`start.sh` / `vite.config.ts` 用 `53001`）

## P1 — 当前阶段

- [ ] 完成公开预览页验收：未登录访问 `/` 与 `/preview` 可见只读演示页，受保护路由仍跳转登录
- [ ] 评估把 `.superpowers/`、`.superpowersigeria/`、`attachments/` 加入 `.gitignore`，
  降低 `git status` 噪音并避免真实结算单误提交（属于配置变更，需确认后再改）
- [ ] 结算单单号身份（`settlement_no`）：按 `docs/superpowers/plans/2026-09-10-settlement-number-identity.md` 实施，
  实施前确认已有 MySQL 数据的回填与覆盖策略（ADR-008 仍为 Proposed）
- [ ] 为前端补 `npm test` / `typecheck` 脚本，统一测试入口，避免手写 `node --experimental-strip-types`
- [ ] 补充导入异常路径与问题明细（`data_issue`）的回归测试

## P2 — 后续优化

- [ ] 销售地区维度：`sales_region` 字段已预留，待源数据带上地区后回填并出报表
- [ ] 利润测算（第二期）：依赖成本数据口径确认，见 ADR-003
- [ ] `analytics_service` 等模块按职责拆分，降低单文件复杂度（随 ADR-008 一并评估）
- [ ] 提升测试覆盖率与端到端冒烟脚本

## Blocked

### 利润测算

- Blocked by：采购成本与国内物流/报关费用数据尚未提供，口径未确认。
- 下一步：用户提供成本表后，先确认主键与成本口径，再进入设计。

### 销售地区维度

- Blocked by：现有结算单没有销售地区字段。
- 下一步：确认数据来源后再回填，不得臆测地区值。
