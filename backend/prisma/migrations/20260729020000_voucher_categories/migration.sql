ALTER TABLE `vouchers`
  ADD COLUMN `category` ENUM('RECEIPT', 'PAYMENT', 'TRANSFER', 'ACCRUAL', 'CLOSING', 'OTHER') NOT NULL DEFAULT 'OTHER' AFTER `source_type`;

UPDATE `vouchers` v
INNER JOIN `accounting_events` e ON e.`voucher_id` = v.`id` AND e.`deleted_at` IS NULL
SET v.`category` = CASE
  WHEN e.`event_type` = 'DEPRECIATION' THEN 'ACCRUAL'
  WHEN e.`event_type` = 'YEAR_END' THEN 'CLOSING'
  ELSE v.`category`
END;

CREATE INDEX `vouchers_category_voucher_date_idx` ON `vouchers` (`category`, `voucher_date`);
