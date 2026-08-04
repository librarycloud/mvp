ALTER TABLE `budget_plans`
  ADD COLUMN `active_fiscal_year` SMALLINT UNSIGNED NULL AFTER `fiscal_year`;

UPDATE `budget_plans` bp
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `fiscal_year` ORDER BY `id`) AS `row_no`
  FROM `budget_plans`
  WHERE `status` = 1 AND `deleted_at` IS NULL
) ranked ON ranked.`id` = bp.`id`
SET bp.`status` = 0
WHERE ranked.`row_no` > 1;

UPDATE `budget_plans`
SET `active_fiscal_year` = CASE WHEN `status` = 1 AND `deleted_at` IS NULL THEN `fiscal_year` ELSE NULL END;

CREATE UNIQUE INDEX `budget_plans_active_fiscal_year_key`
  ON `budget_plans` (`active_fiscal_year`);
