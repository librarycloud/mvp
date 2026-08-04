ALTER TABLE `customers`
  ADD COLUMN `credit_limit` DECIMAL(19,4) NOT NULL DEFAULT 0 AFTER `remark`;

ALTER TABLE `suppliers`
  ADD COLUMN `credit_limit` DECIMAL(19,4) NOT NULL DEFAULT 0 AFTER `remark`;

CREATE TABLE `accounting_dimensions` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `accounting_dimensions_code_key` (`code`),
  INDEX `accounting_dimensions_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `accounting_dimension_members` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `dimension_id` INTEGER UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `accounting_dimension_members_dimension_id_code_key` (`dimension_id`, `code`),
  INDEX `accounting_dimension_members_dimension_id_enabled_idx` (`dimension_id`, `enabled`),
  INDEX `accounting_dimension_members_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `accounting_dimension_members_dimension_id_fkey` FOREIGN KEY (`dimension_id`) REFERENCES `accounting_dimensions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `account_dimension_rules` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` INTEGER UNSIGNED NOT NULL,
  `dimension_id` INTEGER UNSIGNED NOT NULL,
  `required` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `account_dimension_rules_account_id_dimension_id_key` (`account_id`, `dimension_id`),
  INDEX `account_dimension_rules_dimension_id_idx` (`dimension_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `account_dimension_rules_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `account_dimension_rules_dimension_id_fkey` FOREIGN KEY (`dimension_id`) REFERENCES `accounting_dimensions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voucher_entry_dimensions` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `voucher_entry_id` INTEGER UNSIGNED NOT NULL,
  `dimension_id` INTEGER UNSIGNED NOT NULL,
  `dimension_member_id` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `voucher_entry_dimensions_voucher_entry_id_dimension_id_key` (`voucher_entry_id`, `dimension_id`),
  INDEX `voucher_entry_dimensions_dimension_member_id_idx` (`dimension_member_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `voucher_entry_dimensions_voucher_entry_id_fkey` FOREIGN KEY (`voucher_entry_id`) REFERENCES `voucher_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `voucher_entry_dimensions_dimension_id_fkey` FOREIGN KEY (`dimension_id`) REFERENCES `accounting_dimensions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `voucher_entry_dimensions_dimension_member_id_fkey` FOREIGN KEY (`dimension_member_id`) REFERENCES `accounting_dimension_members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `budget_plans` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `fiscal_year` SMALLINT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `budget_plans_fiscal_year_name_key` (`fiscal_year`, `name`),
  INDEX `budget_plans_fiscal_year_status_idx` (`fiscal_year`, `status`),
  INDEX `budget_plans_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `budget_lines` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_id` INTEGER UNSIGNED NOT NULL,
  `expense_type` VARCHAR(100) NOT NULL,
  `department` VARCHAR(100) NOT NULL DEFAULT '',
  `amount` DECIMAL(19,4) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `budget_lines_plan_id_expense_type_department_key` (`plan_id`, `expense_type`, `department`),
  INDEX `budget_lines_expense_type_department_idx` (`expense_type`, `department`),
  PRIMARY KEY (`id`),
  CONSTRAINT `budget_lines_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `budget_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `budget_reservations` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_line_id` INTEGER UNSIGNED NOT NULL,
  `reimbursement_id` INTEGER UNSIGNED NOT NULL,
  `amount` DECIMAL(19,4) NOT NULL,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `warning` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `budget_reservations_reimbursement_id_key` (`reimbursement_id`),
  INDEX `budget_reservations_budget_line_id_status_idx` (`budget_line_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `budget_reservations_budget_line_id_fkey` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `budget_reservations_reimbursement_id_fkey` FOREIGN KEY (`reimbursement_id`) REFERENCES `reimbursements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ar_ap_follow_ups` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INTEGER UNSIGNED NULL,
  `supplier_id` INTEGER UNSIGNED NULL,
  `source_type` VARCHAR(32) NULL,
  `source_id` INTEGER UNSIGNED NULL,
  `scheduled_date` DATE NOT NULL,
  `content` VARCHAR(500) NOT NULL,
  `result` VARCHAR(500) NULL,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_by_id` INTEGER UNSIGNED NOT NULL,
  `completed_by_id` INTEGER UNSIGNED NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `ar_ap_follow_ups_scheduled_date_status_idx` (`scheduled_date`, `status`),
  INDEX `ar_ap_follow_ups_customer_id_status_idx` (`customer_id`, `status`),
  INDEX `ar_ap_follow_ups_supplier_id_status_idx` (`supplier_id`, `status`),
  INDEX `ar_ap_follow_ups_source_type_source_id_idx` (`source_type`, `source_id`),
  INDEX `ar_ap_follow_ups_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ar_ap_follow_ups_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ar_ap_follow_ups_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ar_ap_follow_ups_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ar_ap_follow_ups_completed_by_id_fkey` FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Convert the legacy voucher auxiliary JSON into normalized dimensions before
-- removing the old column. Keys become dimensions and scalar values become members.
CREATE TEMPORARY TABLE `_legacy_voucher_dimensions` (
  `entry_id` INTEGER UNSIGNED NOT NULL,
  `dimension_code` VARCHAR(64) NOT NULL,
  `dimension_name` VARCHAR(100) NOT NULL,
  `member_code` VARCHAR(64) NOT NULL,
  `member_name` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`entry_id`, `dimension_code`)
) ENGINE=InnoDB;

INSERT INTO `_legacy_voucher_dimensions` (`entry_id`, `dimension_code`, `dimension_name`, `member_code`, `member_name`)
SELECT
  ve.`id`,
  CONCAT('LEGACY_', LEFT(SHA2(jt.`key_name`, 256), 57)),
  LEFT(jt.`key_name`, 100),
  LEFT(SHA2(CONCAT(jt.`key_name`, ':', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ve.`auxiliary_data`, CONCAT('$.', jt.`key_name`))), '')), 256), 64),
  LEFT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ve.`auxiliary_data`, CONCAT('$.', jt.`key_name`))), ''), 100)
FROM `voucher_entries` ve
JOIN JSON_TABLE(
  JSON_KEYS(ve.`auxiliary_data`),
  '$[*]' COLUMNS (`key_name` VARCHAR(64) PATH '$')
) AS jt
WHERE ve.`auxiliary_data` IS NOT NULL
  AND JSON_TYPE(ve.`auxiliary_data`) = 'OBJECT';

INSERT IGNORE INTO `accounting_dimensions` (`code`, `name`, `enabled`, `created_at`, `updated_at`)
SELECT DISTINCT `dimension_code`, `dimension_name`, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `_legacy_voucher_dimensions`;

INSERT IGNORE INTO `accounting_dimension_members` (`dimension_id`, `code`, `name`, `enabled`, `created_at`, `updated_at`)
SELECT d.`id`, x.`member_code`, x.`member_name`, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `_legacy_voucher_dimensions` x
JOIN `accounting_dimensions` d ON d.`code` = x.`dimension_code`;

INSERT IGNORE INTO `voucher_entry_dimensions` (`voucher_entry_id`, `dimension_id`, `dimension_member_id`, `created_at`)
SELECT x.`entry_id`, d.`id`, m.`id`, CURRENT_TIMESTAMP(3)
FROM `_legacy_voucher_dimensions` x
JOIN `accounting_dimensions` d ON d.`code` = x.`dimension_code`
JOIN `accounting_dimension_members` m ON m.`dimension_id` = d.`id` AND m.`code` = x.`member_code`;

DROP TEMPORARY TABLE `_legacy_voucher_dimensions`;

ALTER TABLE `voucher_entries` DROP COLUMN `auxiliary_data`;
