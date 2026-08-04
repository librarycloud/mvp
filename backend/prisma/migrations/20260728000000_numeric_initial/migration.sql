-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `tax_id` VARCHAR(64) NULL,
    `contact` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `address` VARCHAR(500) NULL,
    `remark` VARCHAR(500) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `customers_code_key`(`code`),
    INDEX `customers_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `tax_id` VARCHAR(64) NULL,
    `contact` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `address` VARCHAR(500) NULL,
    `remark` VARCHAR(500) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `suppliers_code_key`(`code`),
    INDEX `suppliers_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receivables` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER UNSIGNED NOT NULL,
    `document_no` VARCHAR(64) NOT NULL,
    `occurrence_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `settled_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `description` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `receivables_customer_id_status_idx`(`customer_id`, `status`),
    INDEX `receivables_due_date_status_idx`(`due_date`, `status`),
    INDEX `receivables_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `receivables_customer_id_document_no_key`(`customer_id`, `document_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payables` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `supplier_id` INTEGER UNSIGNED NOT NULL,
    `document_no` VARCHAR(64) NOT NULL,
    `occurrence_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `settled_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `description` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `payables_supplier_id_status_idx`(`supplier_id`, `status`),
    INDEX `payables_due_date_status_idx`(`due_date`, `status`),
    INDEX `payables_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `payables_supplier_id_document_no_key`(`supplier_id`, `document_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receivable_settlements` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `receipt_no` VARCHAR(64) NOT NULL,
    `receivable_id` INTEGER UNSIGNED NOT NULL,
    `bank_transaction_id` INTEGER UNSIGNED NULL,
    `payment_date` DATE NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `remark` VARCHAR(500) NULL,
    `event_id` INTEGER UNSIGNED NOT NULL,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `receivable_settlements_receipt_no_key`(`receipt_no`),
    UNIQUE INDEX `receivable_settlements_bank_transaction_id_key`(`bank_transaction_id`),
    UNIQUE INDEX `receivable_settlements_event_id_key`(`event_id`),
    UNIQUE INDEX `receivable_settlements_voucher_id_key`(`voucher_id`),
    INDEX `receivable_settlements_receivable_id_status_idx`(`receivable_id`, `status`),
    INDEX `receivable_settlements_payment_date_idx`(`payment_date`),
    INDEX `receivable_settlements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payable_settlements` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `payment_no` VARCHAR(64) NOT NULL,
    `payable_id` INTEGER UNSIGNED NOT NULL,
    `bank_transaction_id` INTEGER UNSIGNED NULL,
    `payment_date` DATE NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `remark` VARCHAR(500) NULL,
    `event_id` INTEGER UNSIGNED NOT NULL,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `payable_settlements_payment_no_key`(`payment_no`),
    UNIQUE INDEX `payable_settlements_bank_transaction_id_key`(`bank_transaction_id`),
    UNIQUE INDEX `payable_settlements_event_id_key`(`event_id`),
    UNIQUE INDEX `payable_settlements_voucher_id_key`(`voucher_id`),
    INDEX `payable_settlements_payable_id_status_idx`(`payable_id`, `status`),
    INDEX `payable_settlements_payment_date_idx`(`payment_date`),
    INDEX `payable_settlements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `file_name` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `extension` VARCHAR(20) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` BIGINT UNSIGNED NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `preview_path` VARCHAR(500) NULL,
    `category` VARCHAR(64) NULL,
    `uploaded_by` INTEGER UNSIGNED NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `attachments_sha256_key`(`sha256`),
    INDEX `attachments_uploaded_by_uploaded_at_idx`(`uploaded_by`, `uploaded_at`),
    INDEX `attachments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachment_relations` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `attachment_id` INTEGER UNSIGNED NOT NULL,
    `source_type` VARCHAR(64) NOT NULL,
    `source_id` INTEGER UNSIGNED NOT NULL,
    `relation_type` VARCHAR(32) NOT NULL,
    `remark` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `attachment_relations_source_type_source_id_deleted_at_idx`(`source_type`, `source_id`, `deleted_at`),
    INDEX `attachment_relations_attachment_id_deleted_at_idx`(`attachment_id`, `deleted_at`),
    INDEX `attachment_relations_created_by_idx`(`created_by`),
    UNIQUE INDEX `attachment_relations_uniq`(`attachment_id`, `source_type`, `source_id`, `relation_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_id` INTEGER UNSIGNED NULL,
    `action` ENUM('LOGIN', 'IMPORT', 'CREATE', 'UPDATE', 'DELETE', 'REVIEW', 'UNREVIEW', 'EXPORT') NOT NULL,
    `resource_type` VARCHAR(100) NOT NULL,
    `resource_id` INTEGER UNSIGNED NULL,
    `description` VARCHAR(500) NULL,
    `before_data` JSON NULL,
    `after_data` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `request_id` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `audit_logs_actor_id_created_at_idx`(`actor_id`, `created_at`),
    INDEX `audit_logs_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
    INDEX `audit_logs_action_created_at_idx`(`action`, `created_at`),
    INDEX `audit_logs_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `depreciation_records` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER UNSIGNED NOT NULL,
    `period_id` INTEGER UNSIGNED NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `event_id` INTEGER UNSIGNED NULL,
    `voucher_id` INTEGER UNSIGNED NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `depreciation_records_event_id_key`(`event_id`),
    UNIQUE INDEX `depreciation_records_voucher_id_key`(`voucher_id`),
    INDEX `depreciation_records_period_id_status_idx`(`period_id`, `status`),
    INDEX `depreciation_records_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `depreciation_records_asset_id_period_id_key`(`asset_id`, `period_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_categories` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `dictionary_categories_code_key`(`code`),
    INDEX `dictionary_categories_enabled_sort_idx`(`enabled`, `sort`),
    INDEX `dictionary_categories_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER UNSIGNED NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `color` VARCHAR(32) NULL,
    `icon` VARCHAR(100) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `dictionary_items_category_id_enabled_sort_idx`(`category_id`, `enabled`, `sort`),
    INDEX `dictionary_items_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `dictionary_items_category_id_code_key`(`category_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fixed_assets` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `asset_no` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `purchase_date` DATE NOT NULL,
    `start_use_date` DATE NOT NULL,
    `original_value` DECIMAL(19, 4) NOT NULL,
    `residual_rate` DECIMAL(9, 6) NOT NULL,
    `residual_value` DECIMAL(19, 4) NOT NULL,
    `depreciation_method` VARCHAR(32) NOT NULL,
    `useful_life_months` SMALLINT UNSIGNED NOT NULL,
    `accumulated_depreciation` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `net_value` DECIMAL(19, 4) NOT NULL,
    `department` VARCHAR(100) NULL,
    `custodian` VARCHAR(100) NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `event_id` INTEGER UNSIGNED NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `fixed_assets_asset_no_key`(`asset_no`),
    UNIQUE INDEX `fixed_assets_event_id_key`(`event_id`),
    INDEX `fixed_assets_category_status_idx`(`category`, `status`),
    INDEX `fixed_assets_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `token_id` CHAR(36) NOT NULL,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `refresh_tokens_token_id_key`(`token_id`),
    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_expires_at_idx`(`user_id`, `expires_at`),
    INDEX `refresh_tokens_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_profiles` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `unified_social_credit_code` VARCHAR(32) NOT NULL,
    `legal_representative` VARCHAR(100) NULL,
    `address` VARCHAR(500) NULL,
    `phone` VARCHAR(50) NULL,
    `bank_name` VARCHAR(200) NULL,
    `bank_account` VARCHAR(100) NULL,
    `base_currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `fiscal_year_start_month` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `company_profiles_unified_social_credit_code_key`(`unified_social_credit_code`),
    INDEX `company_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `category` ENUM('ASSET', 'LIABILITY', 'COMMON', 'EQUITY', 'COST', 'PROFIT_AND_LOSS') NOT NULL,
    `normal_direction` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `parent_id` INTEGER UNSIGNED NULL,
    `level` TINYINT UNSIGNED NOT NULL,
    `is_leaf` BOOLEAN NOT NULL DEFAULT true,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `cash_flow_code` VARCHAR(32) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `maintained_by_id` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `accounts_code_key`(`code`),
    INDEX `accounts_parent_id_sort_order_idx`(`parent_id`, `sort_order`),
    INDEX `accounts_category_is_enabled_idx`(`category`, `is_enabled`),
    INDEX `accounts_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounting_events` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(64) NOT NULL,
    `source_type` VARCHAR(64) NULL,
    `source_id` INTEGER UNSIGNED NULL,
    `voucher_id` INTEGER UNSIGNED NULL,
    `description` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `accounting_events_event_type_created_at_idx`(`event_type`, `created_at`),
    INDEX `accounting_events_voucher_id_idx`(`voucher_id`),
    INDEX `accounting_events_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opening_balance_batches` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `period_id` INTEGER UNSIGNED NOT NULL,
    `event_id` INTEGER UNSIGNED NULL,
    `voucher_id` INTEGER UNSIGNED NULL,
    `remark` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `opening_balance_batches_period_id_key`(`period_id`),
    UNIQUE INDEX `opening_balance_batches_event_id_key`(`event_id`),
    UNIQUE INDEX `opening_balance_batches_voucher_id_key`(`voucher_id`),
    INDEX `opening_balance_batches_created_by_idx`(`created_by`),
    INDEX `opening_balance_batches_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opening_balances` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `batch_id` INTEGER UNSIGNED NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `auxiliary_data` JSON NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `direction` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `remark` VARCHAR(500) NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `opening_balances_batch_id_deleted_at_idx`(`batch_id`, `deleted_at`),
    INDEX `opening_balances_account_id_idx`(`account_id`),
    INDEX `opening_balances_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reimbursements` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reimbursement_no` VARCHAR(64) NOT NULL,
    `applicant_name` VARCHAR(100) NOT NULL,
    `department` VARCHAR(100) NULL,
    `expense_date` DATE NOT NULL,
    `expense_type` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `description` VARCHAR(500) NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `expense_account_id` INTEGER UNSIGNED NULL,
    `payment_account_id` INTEGER UNSIGNED NULL,
    `input_tax_account_id` INTEGER UNSIGNED NULL,
    `paid_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `reject_reason` VARCHAR(500) NULL,
    `voucher_id` INTEGER UNSIGNED NULL,
    `event_id` INTEGER UNSIGNED NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `approved_by` INTEGER UNSIGNED NULL,
    `rejected_by` INTEGER UNSIGNED NULL,
    `paid_by` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `reimbursements_reimbursement_no_key`(`reimbursement_no`),
    UNIQUE INDEX `reimbursements_voucher_id_key`(`voucher_id`),
    UNIQUE INDEX `reimbursements_event_id_key`(`event_id`),
    INDEX `reimbursements_status_expense_date_idx`(`status`, `expense_date`),
    INDEX `reimbursements_applicant_name_expense_date_idx`(`applicant_name`, `expense_date`),
    INDEX `reimbursements_expense_account_id_idx`(`expense_account_id`),
    INDEX `reimbursements_payment_account_id_idx`(`payment_account_id`),
    INDEX `reimbursements_input_tax_account_id_idx`(`input_tax_account_id`),
    INDEX `reimbursements_created_by_created_at_idx`(`created_by`, `created_at`),
    INDEX `reimbursements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_templates` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `type` ENUM('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW_STATEMENT', 'CUSTOM') NOT NULL,
    `version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `effective_from` DATE NULL,
    `effective_to` DATE NULL,
    `description` VARCHAR(500) NULL,
    `maintained_by_id` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_templates_type_is_active_idx`(`type`, `is_active`),
    INDEX `report_templates_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `report_templates_code_version_key`(`code`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER UNSIGNED NOT NULL,
    `item_code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `line_number` SMALLINT UNSIGNED NULL,
    `sort_order` INTEGER NOT NULL,
    `normal_direction` ENUM('DEBIT', 'CREDIT') NULL,
    `value_type` ENUM('OPENING_BALANCE', 'CLOSING_BALANCE', 'PERIOD_DEBIT', 'PERIOD_CREDIT', 'PERIOD_NET', 'YEAR_TO_DATE_DEBIT', 'YEAR_TO_DATE_CREDIT', 'YEAR_TO_DATE_NET') NULL,
    `formula` VARCHAR(1000) NULL,
    `is_subtotal` BOOLEAN NOT NULL DEFAULT false,
    `display_level` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_items_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `report_items_template_id_item_code_key`(`template_id`, `item_code`),
    UNIQUE INDEX `report_items_template_id_sort_order_key`(`template_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_item_account_mappings` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_item_id` INTEGER UNSIGNED NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `operator` ENUM('ADD', 'SUBTRACT') NOT NULL DEFAULT 'ADD',
    `value_type` ENUM('OPENING_BALANCE', 'CLOSING_BALANCE', 'PERIOD_DEBIT', 'PERIOD_CREDIT', 'PERIOD_NET', 'YEAR_TO_DATE_DEBIT', 'YEAR_TO_DATE_CREDIT', 'YEAR_TO_DATE_NET') NOT NULL,
    `direction` ENUM('DEBIT', 'CREDIT') NULL,
    `include_children` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_item_account_mappings_account_id_idx`(`account_id`),
    INDEX `report_item_account_mappings_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `report_item_account_mappings_report_item_id_account_id_value_key`(`report_item_id`, `account_id`, `value_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_formula_dependencies` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `target_item_id` INTEGER UNSIGNED NOT NULL,
    `source_item_id` INTEGER UNSIGNED NOT NULL,
    `operator` ENUM('ADD', 'SUBTRACT') NOT NULL DEFAULT 'ADD',
    `coefficient` DECIMAL(19, 6) NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_formula_dependencies_source_item_id_idx`(`source_item_id`),
    INDEX `report_formula_dependencies_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `report_formula_dependencies_target_item_id_source_item_id_key`(`target_item_id`, `source_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER UNSIGNED NOT NULL,
    `period_type` ENUM('MONTH', 'QUARTER', 'YEAR') NOT NULL,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `generated_by_id` INTEGER UNSIGNED NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `reports_fiscal_year_period_type_idx`(`fiscal_year`, `period_type`),
    INDEX `reports_generated_by_id_idx`(`generated_by_id`),
    INDEX `reports_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `reports_template_id_period_type_period_start_period_end_key`(`template_id`, `period_type`, `period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_lines` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER UNSIGNED NOT NULL,
    `report_item_id` INTEGER UNSIGNED NOT NULL,
    `opening_amount` DECIMAL(19, 4) NULL,
    `current_amount` DECIMAL(19, 4) NULL,
    `closing_amount` DECIMAL(19, 4) NULL,
    `calculation_trace` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_lines_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `report_lines_report_id_report_item_id_key`(`report_id`, `report_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_no` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `id_number` VARCHAR(32) NULL,
    `department` VARCHAR(100) NULL,
    `position` VARCHAR(100) NULL,
    `bank_name` VARCHAR(200) NULL,
    `bank_account` VARCHAR(100) NULL,
    `join_date` DATE NULL,
    `base_salary` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `social_insurance` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `housing_fund` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `employees_employee_no_key`(`employee_no`),
    INDEX `employees_status_deleted_at_idx`(`status`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salary_items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `default_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `salary_items_code_key`(`code`),
    INDEX `salary_items_category_enabled_idx`(`category`, `enabled`),
    INDEX `salary_items_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salaries` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER UNSIGNED NOT NULL,
    `period_id` INTEGER UNSIGNED NOT NULL,
    `base_salary` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `bonus` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `allowance` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `deduction` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `social_insurance` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `housing_fund` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `individual_income_tax` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `gross_amount` DECIMAL(19, 4) NOT NULL,
    `net_amount` DECIMAL(19, 4) NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `event_id` INTEGER UNSIGNED NOT NULL,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `salaries_event_id_key`(`event_id`),
    UNIQUE INDEX `salaries_voucher_id_key`(`voucher_id`),
    INDEX `salaries_period_id_status_idx`(`period_id`, `status`),
    INDEX `salaries_employee_id_deleted_at_idx`(`employee_id`, `deleted_at`),
    INDEX `salaries_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `salaries_employee_id_period_id_key`(`employee_id`, `period_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_batches` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `type` ENUM('BANK_XLSX', 'BANK_CSV', 'INVOICE_XML', 'INVOICE_OFD') NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `original_name` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `total_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `error_summary` JSON NULL,
    `imported_by_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `import_batches_file_hash_idx`(`file_hash`),
    INDEX `import_batches_imported_by_id_created_at_idx`(`imported_by_id`, `created_at`),
    INDEX `import_batches_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_transactions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `import_batch_id` INTEGER UNSIGNED NOT NULL,
    `payer_account` VARCHAR(100) NULL,
    `payer_name` VARCHAR(200) NULL,
    `payer_bank` VARCHAR(200) NULL,
    `payer_currency` CHAR(3) NULL,
    `payee_account` VARCHAR(100) NULL,
    `payee_name` VARCHAR(200) NULL,
    `payee_bank` VARCHAR(200) NULL,
    `payee_currency` CHAR(3) NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `balance` DECIMAL(19, 4) NULL,
    `transaction_time` DATETIME(3) NOT NULL,
    `transaction_date` DATE NOT NULL,
    `import_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voucher_id` INTEGER UNSIGNED NULL,
    `transaction_no` VARCHAR(128) NOT NULL,
    `transaction_type` VARCHAR(100) NULL,
    `summary` VARCHAR(500) NULL,
    `raw_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `bank_transactions_transaction_no_key`(`transaction_no`),
    INDEX `bank_transactions_transaction_time_idx`(`transaction_time`),
    INDEX `bank_transactions_transaction_date_idx`(`transaction_date`),
    INDEX `bank_transactions_voucher_id_idx`(`voucher_id`),
    INDEX `bank_transactions_import_batch_id_idx`(`import_batch_id`),
    INDEX `bank_transactions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `import_batch_id` INTEGER UNSIGNED NOT NULL,
    `format` ENUM('XML', 'OFD') NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `direction` ENUM('PURCHASE', 'SALE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `invoice_number` VARCHAR(64) NOT NULL,
    `issue_time` DATETIME(3) NOT NULL,
    `issue_date` DATE NOT NULL,
    `import_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `voucher_id` INTEGER UNSIGNED NULL,
    `reimbursement_id` INTEGER UNSIGNED NULL,
    `tax_deduction_status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `deductible_tax_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `seller_name` VARCHAR(200) NOT NULL,
    `seller_id_num` VARCHAR(64) NOT NULL,
    `buyer_name` VARCHAR(200) NOT NULL,
    `buyer_id_num` VARCHAR(64) NOT NULL,
    `total_amount_without_tax` DECIMAL(19, 4) NOT NULL,
    `total_tax_amount` DECIMAL(19, 4) NOT NULL,
    `total_tax_included_amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `source_file_hash` CHAR(64) NOT NULL,
    `raw_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `invoices_buyer_id_num_issue_time_idx`(`buyer_id_num`, `issue_time`),
    INDEX `invoices_issue_date_idx`(`issue_date`),
    INDEX `invoices_voucher_id_idx`(`voucher_id`),
    INDEX `invoices_reimbursement_id_idx`(`reimbursement_id`),
    INDEX `invoices_tax_deduction_status_idx`(`tax_deduction_status`),
    INDEX `invoices_source_file_hash_idx`(`source_file_hash`),
    INDEX `invoices_import_batch_id_idx`(`import_batch_id`),
    INDEX `invoices_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `invoices_seller_id_num_invoice_number_key`(`seller_id_num`, `invoice_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER UNSIGNED NOT NULL,
    `line_no` SMALLINT UNSIGNED NOT NULL,
    `item_name` VARCHAR(500) NOT NULL,
    `specification` VARCHAR(200) NULL,
    `unit` VARCHAR(50) NULL,
    `quantity` DECIMAL(19, 6) NULL,
    `unit_price` DECIMAL(19, 6) NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `tax_rate` DECIMAL(9, 6) NULL,
    `tax_amount` DECIMAL(19, 4) NULL,
    `tax_classification_code` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `invoice_items_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `invoice_items_invoice_id_line_no_key`(`invoice_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voucher_sequences` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `next_value` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `voucher_sequences_fiscal_year_key`(`fiscal_year`),
    INDEX `voucher_sequences_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `voucher_no` VARCHAR(32) NOT NULL,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `fiscal_period` TINYINT UNSIGNED NOT NULL,
    `sequence_no` INTEGER UNSIGNED NOT NULL,
    `voucher_date` DATE NOT NULL,
    `posting_date` DATE NOT NULL,
    `period_id` INTEGER UNSIGNED NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `source_type` ENUM('BANK_TRANSACTION', 'INVOICE', 'MIXED', 'MANUAL') NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `attachment_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `total_debit` DECIMAL(19, 4) NOT NULL,
    `total_credit` DECIMAL(19, 4) NOT NULL,
    `created_by_id` INTEGER UNSIGNED NOT NULL,
    `reviewer_id` INTEGER UNSIGNED NULL,
    `reviewed_at` DATETIME(3) NULL,
    `posted_by` INTEGER UNSIGNED NULL,
    `posted_at` DATETIME(3) NULL,
    `void_by` INTEGER UNSIGNED NULL,
    `void_at` DATETIME(3) NULL,
    `void_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `vouchers_voucher_no_key`(`voucher_no`),
    INDEX `vouchers_fiscal_year_fiscal_period_status_idx`(`fiscal_year`, `fiscal_period`, `status`),
    INDEX `vouchers_voucher_date_idx`(`voucher_date`),
    INDEX `vouchers_period_id_posting_date_status_idx`(`period_id`, `posting_date`, `status`),
    INDEX `vouchers_created_by_id_idx`(`created_by_id`),
    INDEX `vouchers_reviewer_id_idx`(`reviewer_id`),
    INDEX `vouchers_posted_by_idx`(`posted_by`),
    INDEX `vouchers_void_by_idx`(`void_by`),
    INDEX `vouchers_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `vouchers_fiscal_year_sequence_no_key`(`fiscal_year`, `sequence_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounting_periods` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `year` SMALLINT UNSIGNED NOT NULL,
    `month` TINYINT UNSIGNED NOT NULL,
    `period_code` CHAR(7) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `closed_at` DATETIME(3) NULL,
    `closed_by` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `accounting_periods_period_code_key`(`period_code`),
    INDEX `accounting_periods_status_start_date_end_date_idx`(`status`, `start_date`, `end_date`),
    INDEX `accounting_periods_closed_by_idx`(`closed_by`),
    INDEX `accounting_periods_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `accounting_periods_year_month_key`(`year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voucher_entries` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `line_no` SMALLINT UNSIGNED NOT NULL,
    `account_id` INTEGER UNSIGNED NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `debit_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `credit_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `auxiliary_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `voucher_entries_account_id_idx`(`account_id`),
    INDEX `voucher_entries_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `voucher_entries_voucher_id_line_no_key`(`voucher_id`, `line_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voucher_attachments` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `voucher_attachments_voucher_id_idx`(`voucher_id`),
    INDEX `voucher_attachments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voucher_sources` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `bank_transaction_id` INTEGER UNSIGNED NULL,
    `invoice_id` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `voucher_sources_bank_transaction_id_idx`(`bank_transaction_id`),
    INDEX `voucher_sources_invoice_id_idx`(`invoice_id`),
    INDEX `voucher_sources_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `voucher_sources_voucher_id_bank_transaction_id_key`(`voucher_id`, `bank_transaction_id`),
    UNIQUE INDEX `voucher_sources_voucher_id_invoice_id_key`(`voucher_id`, `invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_suggestions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `bank_transaction_id` INTEGER UNSIGNED NULL,
    `invoice_id` INTEGER UNSIGNED NULL,
    `voucher_id` INTEGER UNSIGNED NULL,
    `requested_by_id` INTEGER UNSIGNED NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `model` VARCHAR(100) NOT NULL,
    `input_snapshot` JSON NOT NULL,
    `suggestion` JSON NULL,
    `error_message` TEXT NULL,
    `accepted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `ai_suggestions_bank_transaction_id_idx`(`bank_transaction_id`),
    INDEX `ai_suggestions_invoice_id_idx`(`invoice_id`),
    INDEX `ai_suggestions_voucher_id_idx`(`voucher_id`),
    INDEX `ai_suggestions_requested_by_id_created_at_idx`(`requested_by_id`, `created_at`),
    INDEX `ai_suggestions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `year_end_closings` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `status` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `revenue_amount` DECIMAL(19, 4) NOT NULL,
    `cost_amount` DECIMAL(19, 4) NOT NULL,
    `expense_amount` DECIMAL(19, 4) NOT NULL,
    `net_profit` DECIMAL(19, 4) NOT NULL,
    `event_id` INTEGER UNSIGNED NOT NULL,
    `voucher_id` INTEGER UNSIGNED NOT NULL,
    `report_data` JSON NULL,
    `created_by` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `year_end_closings_fiscal_year_key`(`fiscal_year`),
    UNIQUE INDEX `year_end_closings_event_id_key`(`event_id`),
    UNIQUE INDEX `year_end_closings_voucher_id_key`(`voucher_id`),
    INDEX `year_end_closings_status_deleted_at_idx`(`status`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `receivables` ADD CONSTRAINT `receivables_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivables` ADD CONSTRAINT `receivables_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payables` ADD CONSTRAINT `payables_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payables` ADD CONSTRAINT `payables_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivable_settlements` ADD CONSTRAINT `receivable_settlements_receivable_id_fkey` FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivable_settlements` ADD CONSTRAINT `receivable_settlements_bank_transaction_id_fkey` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivable_settlements` ADD CONSTRAINT `receivable_settlements_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivable_settlements` ADD CONSTRAINT `receivable_settlements_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receivable_settlements` ADD CONSTRAINT `receivable_settlements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payable_settlements` ADD CONSTRAINT `payable_settlements_payable_id_fkey` FOREIGN KEY (`payable_id`) REFERENCES `payables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payable_settlements` ADD CONSTRAINT `payable_settlements_bank_transaction_id_fkey` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payable_settlements` ADD CONSTRAINT `payable_settlements_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payable_settlements` ADD CONSTRAINT `payable_settlements_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payable_settlements` ADD CONSTRAINT `payable_settlements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachment_relations` ADD CONSTRAINT `attachment_relations_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachment_relations` ADD CONSTRAINT `attachment_relations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depreciation_records` ADD CONSTRAINT `depreciation_records_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depreciation_records` ADD CONSTRAINT `depreciation_records_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depreciation_records` ADD CONSTRAINT `depreciation_records_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depreciation_records` ADD CONSTRAINT `depreciation_records_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `depreciation_records` ADD CONSTRAINT `depreciation_records_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_items` ADD CONSTRAINT `dictionary_items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `dictionary_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fixed_assets` ADD CONSTRAINT `fixed_assets_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_maintained_by_id_fkey` FOREIGN KEY (`maintained_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounting_events` ADD CONSTRAINT `accounting_events_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounting_events` ADD CONSTRAINT `accounting_events_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balance_batches` ADD CONSTRAINT `opening_balance_batches_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balance_batches` ADD CONSTRAINT `opening_balance_batches_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balance_batches` ADD CONSTRAINT `opening_balance_batches_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balance_batches` ADD CONSTRAINT `opening_balance_batches_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balances` ADD CONSTRAINT `opening_balances_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `opening_balance_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balances` ADD CONSTRAINT `opening_balances_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_balances` ADD CONSTRAINT `opening_balances_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_expense_account_id_fkey` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_payment_account_id_fkey` FOREIGN KEY (`payment_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_input_tax_account_id_fkey` FOREIGN KEY (`input_tax_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_rejected_by_fkey` FOREIGN KEY (`rejected_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursements` ADD CONSTRAINT `reimbursements_paid_by_fkey` FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_templates` ADD CONSTRAINT `report_templates_maintained_by_id_fkey` FOREIGN KEY (`maintained_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_items` ADD CONSTRAINT `report_items_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `report_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_item_account_mappings` ADD CONSTRAINT `report_item_account_mappings_report_item_id_fkey` FOREIGN KEY (`report_item_id`) REFERENCES `report_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_item_account_mappings` ADD CONSTRAINT `report_item_account_mappings_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_formula_dependencies` ADD CONSTRAINT `report_formula_dependencies_target_item_id_fkey` FOREIGN KEY (`target_item_id`) REFERENCES `report_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_formula_dependencies` ADD CONSTRAINT `report_formula_dependencies_source_item_id_fkey` FOREIGN KEY (`source_item_id`) REFERENCES `report_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `report_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_generated_by_id_fkey` FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_lines` ADD CONSTRAINT `report_lines_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_lines` ADD CONSTRAINT `report_lines_report_item_id_fkey` FOREIGN KEY (`report_item_id`) REFERENCES `report_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salaries` ADD CONSTRAINT `salaries_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salaries` ADD CONSTRAINT `salaries_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salaries` ADD CONSTRAINT `salaries_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salaries` ADD CONSTRAINT `salaries_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salaries` ADD CONSTRAINT `salaries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_imported_by_id_fkey` FOREIGN KEY (`imported_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_import_batch_id_fkey` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_import_batch_id_fkey` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_reimbursement_id_fkey` FOREIGN KEY (`reimbursement_id`) REFERENCES `reimbursements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_posted_by_fkey` FOREIGN KEY (`posted_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_void_by_fkey` FOREIGN KEY (`void_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_period_id_fkey` FOREIGN KEY (`period_id`) REFERENCES `accounting_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounting_periods` ADD CONSTRAINT `accounting_periods_closed_by_fkey` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_entries` ADD CONSTRAINT `voucher_entries_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_entries` ADD CONSTRAINT `voucher_entries_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_attachments` ADD CONSTRAINT `voucher_attachments_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_sources` ADD CONSTRAINT `voucher_sources_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_sources` ADD CONSTRAINT `voucher_sources_bank_transaction_id_fkey` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_sources` ADD CONSTRAINT `voucher_sources_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_bank_transaction_id_fkey` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `year_end_closings` ADD CONSTRAINT `year_end_closings_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `accounting_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `year_end_closings` ADD CONSTRAINT `year_end_closings_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `year_end_closings` ADD CONSTRAINT `year_end_closings_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accounting and domain invariants that Prisma Schema cannot express.
ALTER TABLE `refresh_tokens`
    ADD CONSTRAINT `chk_refresh_tokens_expiry` CHECK (`expires_at` > `created_at`);

ALTER TABLE `company_profiles`
    ADD CONSTRAINT `chk_company_fiscal_year_start` CHECK (`fiscal_year_start_month` BETWEEN 1 AND 12);

ALTER TABLE `accounts`
    ADD CONSTRAINT `chk_accounts_level` CHECK (`level` >= 1);

ALTER TABLE `report_templates`
    ADD CONSTRAINT `chk_report_template_dates` CHECK (`effective_to` IS NULL OR `effective_from` IS NULL OR `effective_to` >= `effective_from`);

ALTER TABLE `report_formula_dependencies`
    ADD CONSTRAINT `chk_report_formula_coefficient` CHECK (`coefficient` > 0);

ALTER TABLE `reports`
    ADD CONSTRAINT `chk_report_period_dates` CHECK (`period_end` >= `period_start`);

ALTER TABLE `import_batches`
    ADD CONSTRAINT `chk_import_batch_counts` CHECK (
        `total_count` >= 0
        AND `success_count` >= 0
        AND `skipped_count` >= 0
        AND `failed_count` >= 0
        AND (`success_count` + `skipped_count` + `failed_count`) <= `total_count`
    );

ALTER TABLE `invoices`
    ADD CONSTRAINT `chk_invoice_totals` CHECK (
        `total_tax_included_amount` = `total_amount_without_tax` + `total_tax_amount`
    );

ALTER TABLE `invoice_items`
    ADD CONSTRAINT `chk_invoice_item_tax_rate` CHECK (`tax_rate` IS NULL OR `tax_rate` BETWEEN 0 AND 1);

ALTER TABLE `vouchers`
    ADD CONSTRAINT `chk_voucher_fiscal_period` CHECK (`fiscal_period` BETWEEN 1 AND 12),
    ADD CONSTRAINT `chk_voucher_balanced` CHECK (`total_debit` > 0 AND `total_debit` = `total_credit`);

ALTER TABLE `voucher_entries`
    ADD CONSTRAINT `chk_voucher_entry_single_side` CHECK (
        (`debit_amount` > 0 AND `credit_amount` = 0)
        OR (`credit_amount` > 0 AND `debit_amount` = 0)
    );

ALTER TABLE `accounting_periods`
    ADD CONSTRAINT `chk_accounting_period_month` CHECK (`month` BETWEEN 1 AND 12),
    ADD CONSTRAINT `chk_accounting_period_dates` CHECK (`end_date` >= `start_date`);

-- Built-in dictionaries. IDs are generated by MySQL and are never deployment constants.
INSERT INTO `dictionary_categories`
    (`code`, `description`, `sort`, `enabled`, `created_at`, `updated_at`)
VALUES
    ('voucher_status', '凭证状态', 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('period_status', '会计期间状态', 20, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('event_type', '会计事件类型', 30, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('invoice_type', '发票类型', 40, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('currency', '币种', 50, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('attachment_type', '附件类型', 60, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('tax_rate', '税率', 70, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('reimbursement_expense_type', '费用报销类型', 80, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('year_end_cost_account', '年末结转成本科目编码', 120, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `dictionary_items`
    (`category_id`, `code`, `name`, `value`, `sort`, `color`, `is_default`, `enabled`, `created_at`, `updated_at`)
SELECT c.id, v.code, v.name, v.value, v.sort, v.color, v.is_default, true,
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `dictionary_categories` c
JOIN (
    SELECT 'voucher_status' category_code, 'DRAFT' code, '草稿' name, '0' value, 10 sort, '#909399' color, 1 is_default UNION ALL
    SELECT 'voucher_status', 'PENDING', '待审核', '1', 20, '#e6a23c', 0 UNION ALL
    SELECT 'voucher_status', 'POSTED', '已记账', '2', 30, '#67c23a', 0 UNION ALL
    SELECT 'voucher_status', 'VOID', '作废', '3', 40, '#f56c6c', 0 UNION ALL
    SELECT 'period_status', 'OPEN', '打开', '0', 10, '#67c23a', 1 UNION ALL
    SELECT 'period_status', 'CLOSED', '已关账', '1', 20, '#909399', 0 UNION ALL
    SELECT 'period_status', 'LOCKED', '已锁定', '2', 30, '#f56c6c', 0 UNION ALL
    SELECT 'event_type', 'BANK_IMPORT', '银行导入', 'BANK_IMPORT', 10, NULL, 0 UNION ALL
    SELECT 'event_type', 'INVOICE_IMPORT', '发票导入', 'INVOICE_IMPORT', 20, NULL, 0 UNION ALL
    SELECT 'event_type', 'MANUAL_VOUCHER', '手工凭证', 'MANUAL_VOUCHER', 30, NULL, 0 UNION ALL
    SELECT 'event_type', 'AI_VOUCHER', 'AI凭证', 'AI_VOUCHER', 40, NULL, 0 UNION ALL
    SELECT 'event_type', 'FIXED_ASSET', '固定资产', 'FIXED_ASSET', 50, NULL, 0 UNION ALL
    SELECT 'event_type', 'DEPRECIATION', '折旧', 'DEPRECIATION', 60, NULL, 0 UNION ALL
    SELECT 'event_type', 'SALARY', '工资', 'SALARY', 70, NULL, 0 UNION ALL
    SELECT 'event_type', 'YEAR_END', '年末结转', 'YEAR_END', 80, NULL, 0 UNION ALL
    SELECT 'event_type', 'OPENING_BALANCE', '期初余额', 'OPENING_BALANCE', 90, NULL, 0 UNION ALL
    SELECT 'event_type', 'TAX_ADJUSTMENT', '税务调整', 'TAX_ADJUSTMENT', 100, NULL, 0 UNION ALL
    SELECT 'event_type', 'OTHER', '其他', 'OTHER', 110, NULL, 0 UNION ALL
    SELECT 'invoice_type', 'XML', 'XML发票', 'XML', 10, NULL, 1 UNION ALL
    SELECT 'invoice_type', 'OFD', 'OFD发票', 'OFD', 20, NULL, 0 UNION ALL
    SELECT 'invoice_type', 'PDF', 'PDF发票', 'PDF', 30, NULL, 0 UNION ALL
    SELECT 'currency', 'CNY', '人民币', 'CNY', 10, NULL, 1 UNION ALL
    SELECT 'currency', 'USD', '美元', 'USD', 20, NULL, 0 UNION ALL
    SELECT 'currency', 'EUR', '欧元', 'EUR', 30, NULL, 0 UNION ALL
    SELECT 'attachment_type', 'XML', 'XML', 'XML', 10, NULL, 0 UNION ALL
    SELECT 'attachment_type', 'PDF', 'PDF', 'PDF', 20, NULL, 0 UNION ALL
    SELECT 'attachment_type', 'ZIP', 'ZIP', 'ZIP', 30, NULL, 0 UNION ALL
    SELECT 'attachment_type', 'IMAGE', '图片', 'IMAGE', 40, NULL, 0 UNION ALL
    SELECT 'attachment_type', 'OTHER', '其他', 'OTHER', 50, NULL, 0 UNION ALL
    SELECT 'tax_rate', '0', '0%', '0%', 10, NULL, 0 UNION ALL
    SELECT 'tax_rate', '1', '1%', '1%', 20, NULL, 0 UNION ALL
    SELECT 'tax_rate', '3', '3%', '3%', 30, NULL, 0 UNION ALL
    SELECT 'tax_rate', '6', '6%', '6%', 40, NULL, 0 UNION ALL
    SELECT 'tax_rate', '9', '9%', '9%', 50, NULL, 0 UNION ALL
    SELECT 'tax_rate', '13', '13%', '13%', 60, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'OFFICE', '办公费', '办公费', 10, NULL, 1 UNION ALL
    SELECT 'reimbursement_expense_type', 'TRANSPORTATION', '交通费', '交通费', 20, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'TRAVEL', '差旅费', '差旅费', 30, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'BUSINESS_ENTERTAINMENT', '业务招待费', '业务招待费', 40, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'ADVERTISING', '广告宣传费', '广告宣传费', 50, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'BANK_FEE', '手续费', '手续费', 60, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'TECHNICAL_SERVICE', '技术服务费', '技术服务费', 70, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'RENT_PROPERTY', '房租物业费', '房租物业费', 80, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'COMMUNICATION', '通信费', '通信费', 90, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'INSURANCE', '保险费', '保险费', 100, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'TRAINING', '培训费', '培训费', 110, NULL, 0 UNION ALL
    SELECT 'reimbursement_expense_type', 'OTHER', '其他费用', '其他费用', 120, NULL, 0 UNION ALL
    SELECT 'year_end_cost_account', '6401', '主营业务成本', '6401', 10, NULL, 0 UNION ALL
    SELECT 'year_end_cost_account', '6402', '其他业务成本', '6402', 20, NULL, 0 UNION ALL
    SELECT 'year_end_cost_account', '6403', '税金及附加', '6403', 30, NULL, 0
) v ON v.category_code = c.code;
