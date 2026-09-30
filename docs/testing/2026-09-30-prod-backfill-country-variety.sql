-- =====================================================================
-- prod 数据回填：导入的结算单补 国家=越南 / 品种=金枕（仅 NULL 行）
-- 日期：2026-09-30
--
-- 背景：承接 2026-09-30-prod-migration-sale-record-variety.sql。发版时决策
--   「只加列不回填」（prod 补 sale_record.variety 列，import_batch.country
--   prod 本就存在），现按业务要求对已导入的历史单据回填国家与品种。
--
-- 口径：与 ADR-041 第 3 条及 dev 回填脚本
--   backend/scripts/add_country_variety_schema.py 完全一致：
--   - import_batch.country = '越南'（仅 NULL 行，一张单一个值）
--   - sale_record.variety = '金枕'（仅 NULL 行，销售行级）
--   - 不区分 source_type（字段上线前的手工单同样没有国家/品种）
--   - 不回写 grade_raw；已有非 NULL 值一律不动
--   - WHERE ... IS NULL，幂等，可安全重复执行
--
-- 执行方式：Navicat 连 prod（utf8mb4 连接）按顺序执行，或整文件喂给
--   mysql 客户端。建议在业务低峰 / 无并发导入时执行。
-- =====================================================================

-- 前置检查 1：应返回 1 行；结果为空说明 variety 列未加，
-- 先执行 docs/testing/2026-09-30-prod-migration-sale-record-variety.sql
SHOW COLUMNS FROM `sale_record` LIKE 'variety';

START TRANSACTION;

-- 前置检查 2：执行前核对待回填行数（记下来，应与各自 UPDATE 的影响行数一致）
SELECT COUNT(*) AS `batches_to_backfill` FROM `import_batch` WHERE `country` IS NULL;
SELECT COUNT(*) AS `records_to_backfill` FROM `sale_record` WHERE `variety` IS NULL;

-- 回填（两句影响行数应分别等于上面的计数）
UPDATE `import_batch` SET `country` = '越南' WHERE `country` IS NULL;
UPDATE `sale_record` SET `variety` = '金枕' WHERE `variety` IS NULL;

-- 执行后验证：两个计数必须为 0
SELECT COUNT(*) AS `batches_still_null` FROM `import_batch` WHERE `country` IS NULL;
SELECT COUNT(*) AS `records_still_null` FROM `sale_record` WHERE `variety` IS NULL;

-- 结果分布抽查：应只出现 越南 / 金枕（及 NULL 之外的既有值）
SELECT `country`, COUNT(*) AS `cnt` FROM `import_batch` GROUP BY `country`;
SELECT `variety`, COUNT(*) AS `cnt` FROM `sale_record` GROUP BY `variety`;

-- 验证无误后提交；若异常，把下一行改为 ROLLBACK;
COMMIT;
