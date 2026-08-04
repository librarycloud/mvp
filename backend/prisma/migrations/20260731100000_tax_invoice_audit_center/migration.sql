ALTER TABLE `import_batches`
  MODIFY `type` ENUM('BANK_XLSX', 'BANK_CSV', 'BANK_JSON', 'INVOICE_XML', 'INVOICE_OFD', 'INVOICE_PDF') NOT NULL;

ALTER TABLE `invoices`
  MODIFY `format` ENUM('XML', 'OFD', 'PDF') NOT NULL,
  ADD COLUMN `verification_status` ENUM('PENDING', 'VERIFIED', 'FAILED', 'MANUAL_CONFIRMED') NOT NULL DEFAULT 'PENDING' AFTER `deductible_tax_amount`,
  ADD COLUMN `verification_message` VARCHAR(500) NULL AFTER `verification_status`,
  ADD COLUMN `verified_at` DATETIME(3) NULL AFTER `verification_message`,
  ADD COLUMN `verified_by_id` INTEGER UNSIGNED NULL AFTER `verified_at`,
  ADD COLUMN `voided_at` DATETIME(3) NULL AFTER `verified_by_id`,
  ADD COLUMN `red_invoice_of_id` INTEGER UNSIGNED NULL AFTER `voided_at`,
  ADD INDEX `invoices_verification_status_idx` (`verification_status`),
  ADD INDEX `invoices_red_invoice_of_id_idx` (`red_invoice_of_id`),
  ADD CONSTRAINT `invoices_red_invoice_of_id_fkey` FOREIGN KEY (`red_invoice_of_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `invoice_usages` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` INTEGER UNSIGNED NOT NULL,
  `source_type` VARCHAR(64) NOT NULL,
  `source_id` INTEGER UNSIGNED NOT NULL,
  `amount` DECIMAL(19,4) NOT NULL,
  `created_by_id` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `invoice_usages_invoice_id_source_type_source_id_key` (`invoice_id`, `source_type`, `source_id`),
  INDEX `invoice_usages_source_type_source_id_idx` (`source_type`, `source_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `invoice_usages_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sales_invoice_requests` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_no` VARCHAR(64) NOT NULL,
  `buyer_name` VARCHAR(200) NOT NULL,
  `buyer_id_num` VARCHAR(64) NOT NULL,
  `invoice_type` ENUM('SPECIAL', 'ORDINARY', 'UNKNOWN') NOT NULL DEFAULT 'ORDINARY',
  `amount_without_tax` DECIMAL(19,4) NOT NULL,
  `tax_amount` DECIMAL(19,4) NOT NULL,
  `amount_including_tax` DECIMAL(19,4) NOT NULL,
  `items` JSON NULL,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `remark` VARCHAR(500) NULL,
  `reject_reason` VARCHAR(500) NULL,
  `issued_invoice_id` INTEGER UNSIGNED NULL,
  `requested_by_id` INTEGER UNSIGNED NOT NULL,
  `approved_by_id` INTEGER UNSIGNED NULL,
  `approved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `sales_invoice_requests_request_no_key` (`request_no`),
  UNIQUE INDEX `sales_invoice_requests_issued_invoice_id_key` (`issued_invoice_id`),
  INDEX `sales_invoice_requests_status_created_at_idx` (`status`, `created_at`),
  INDEX `sales_invoice_requests_buyer_id_num_status_idx` (`buyer_id_num`, `status`),
  INDEX `sales_invoice_requests_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tax_declarations` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `tax_type` ENUM('VAT', 'SURCHARGE', 'CORPORATE_INCOME') NOT NULL,
  `fiscal_year` SMALLINT UNSIGNED NOT NULL,
  `period_type` ENUM('MONTH', 'QUARTER', 'YEAR') NOT NULL,
  `period` TINYINT UNSIGNED NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` ENUM('DRAFT', 'REVIEWED', 'DECLARED', 'PAID') NOT NULL DEFAULT 'DRAFT',
  `payable_amount` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `declared_amount` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `declaration_no` VARCHAR(100) NULL,
  `declared_at` DATETIME(3) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_by_id` INTEGER UNSIGNED NOT NULL,
  `reviewed_by_id` INTEGER UNSIGNED NULL,
  `declared_by_id` INTEGER UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `tax_declarations_tax_type_fiscal_year_period_type_period_key` (`tax_type`, `fiscal_year`, `period_type`, `period`),
  INDEX `tax_declarations_status_period_start_period_end_idx` (`status`, `period_start`, `period_end`),
  INDEX `tax_declarations_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tax_declaration_lines` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `declaration_id` INTEGER UNSIGNED NOT NULL,
  `line_code` VARCHAR(64) NOT NULL,
  `line_name` VARCHAR(200) NOT NULL,
  `calculated_amount` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `adjustment_amount` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `declared_amount` DECIMAL(19,4) NOT NULL DEFAULT 0,
  `remark` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `tax_declaration_lines_declaration_id_line_code_key` (`declaration_id`, `line_code`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tax_declaration_lines_declaration_id_fkey` FOREIGN KEY (`declaration_id`) REFERENCES `tax_declarations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tax_payments` (
  `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  `declaration_id` INTEGER UNSIGNED NOT NULL,
  `amount` DECIMAL(19,4) NOT NULL,
  `payment_date` DATE NOT NULL,
  `payment_reference` VARCHAR(100) NULL,
  `bank_transaction_id` INTEGER UNSIGNED NULL,
  `paid_by_id` INTEGER UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `tax_payments_bank_transaction_id_idx` (`bank_transaction_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tax_payments_declaration_id_fkey` FOREIGN KEY (`declaration_id`) REFERENCES `tax_declarations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `audit_logs_request_id_idx` ON `audit_logs`(`request_id`);
