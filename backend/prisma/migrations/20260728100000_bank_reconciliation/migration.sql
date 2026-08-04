CREATE TABLE `bank_reconciliations` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `reconciliation_no` VARCHAR(64) NOT NULL,
  `period_id` INTEGER UNSIGNED NOT NULL,
  `bank_account_id` INTEGER UNSIGNED NOT NULL,
  `statement_opening_balance` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `statement_closing_balance` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `book_closing_balance` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `difference` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `remark` VARCHAR(500) NULL,
  `completed_at` DATETIME(3) NULL,
  `completed_by` INTEGER UNSIGNED NULL,
  `created_by` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bank_rec_no` (`reconciliation_no`),
  UNIQUE KEY `uk_bank_rec_period_account` (`period_id`, `bank_account_id`),
  KEY `idx_bank_rec_status_period` (`status`, `period_id`),
  KEY `idx_bank_rec_deleted` (`deleted_at`),
  KEY `idx_bank_rec_completed_by` (`completed_by`),
  KEY `idx_bank_rec_created_by` (`created_by`),
  CONSTRAINT `fk_bank_rec_period` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_rec_account` FOREIGN KEY (`bank_account_id`) REFERENCES `accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_rec_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_rec_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bank_reconciliation_matches` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `reconciliation_id` INTEGER UNSIGNED NOT NULL,
  `bank_transaction_id` INTEGER UNSIGNED NOT NULL,
  `voucher_entry_id` INTEGER UNSIGNED NOT NULL,
  `matched_amount` DECIMAL(19,4) NOT NULL,
  `match_type` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  `matched_by` INTEGER UNSIGNED NOT NULL,
  `matched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bank_match_pair` (`reconciliation_id`, `bank_transaction_id`, `voucher_entry_id`),
  KEY `idx_bank_match_txn` (`bank_transaction_id`, `deleted_at`),
  KEY `idx_bank_match_entry` (`voucher_entry_id`, `deleted_at`),
  KEY `idx_bank_match_deleted` (`deleted_at`),
  KEY `idx_bank_match_user` (`matched_by`),
  CONSTRAINT `fk_bank_match_rec` FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_match_txn` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_match_entry` FOREIGN KEY (`voucher_entry_id`) REFERENCES `voucher_entries` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_bank_match_user` FOREIGN KEY (`matched_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `reimbursements` ADD COLUMN `bank_transaction_id` INTEGER UNSIGNED NULL;
CREATE UNIQUE INDEX `uk_reimbursement_bank_txn` ON `reimbursements` (`bank_transaction_id`);
ALTER TABLE `reimbursements` ADD CONSTRAINT `fk_reimbursement_bank_txn` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions` (`id`) ON DELETE RESTRICT;
