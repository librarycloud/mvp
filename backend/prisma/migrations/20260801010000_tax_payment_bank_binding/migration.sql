ALTER TABLE `tax_payments`
  ADD UNIQUE INDEX `tax_payments_bank_transaction_id_key` (`bank_transaction_id`),
  ADD CONSTRAINT `tax_payments_bank_transaction_id_fkey`
    FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- MySQL/MariaDB treats NULL values as distinct in a unique index. Normalize
-- annual declarations to a non-null key so one tax type can have one year row.
ALTER TABLE `tax_declarations`
  ADD COLUMN `period_key` VARCHAR(16)
    GENERATED ALWAYS AS (IF(`period` IS NULL, 'YEAR', CAST(`period` AS CHAR(16)))) STORED;

ALTER TABLE `tax_declarations`
  DROP INDEX `tax_declarations_tax_type_fiscal_year_period_type_period_key`,
  ADD UNIQUE INDEX `tax_declarations_tax_type_fiscal_year_period_type_period_key`
    (`tax_type`, `fiscal_year`, `period_type`, `period_key`);
