-- =====================================================================
-- dev → prod 结构迁移：sale_record 补 variety 列
-- 日期：2026-09-30
--
-- 背景：发版前将 dev（120.48.117.234:13306 / MySQL 8.3.0）库结构迁移到
--   prod（rm-t4nn74ccz39i936qtqo.mysql.singapore.rds.aliyuncs.com:3306 /
--   MySQL 8.0.36）。对两份 Navicat 结构导出逐表比对（31 张表）：
--   - 表 / 索引 / 外键 / CHECK 约束两边完全一致；
--   - 唯一结构差异：prod 缺 `sale_record.variety`；
--   - `import_batch.country` prod 已存在，无需处理；
--   - 其余差异仅为 AUTO_INCREMENT 计数（数据层面，不迁移）。
--
-- 决策：只加列，不回填历史数据（不走 ADR-041 的
--   UPDATE ... SET variety='金枕' / country='越南'），
--   历史行 variety 保持 NULL，由后续导入 / 业务自然填充。
--
-- 列定义与 dev 库及模型 backend/app/models.py SaleRecord.variety
-- （String(64), nullable=True，无注释 / 默认值 / 索引）逐字对齐；
-- AFTER `review_note` 还原 dev 的物理列序（表尾）。
-- =====================================================================

ALTER TABLE `sale_record`
    ADD COLUMN `variety` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL AFTER `review_note`;

-- 执行后验证：结果应与 dev 库 SHOW CREATE TABLE sale_record 一致（AUTO_INCREMENT 除外）
SHOW CREATE TABLE `sale_record`;
