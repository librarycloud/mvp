ALTER TABLE `bank_transactions`
  ADD COLUMN `reconciliation_direction` VARCHAR(16) NULL,
  ADD COLUMN `direction_confirmed_at` DATETIME(3) NULL,
  ADD COLUMN `direction_confirmed_by` INTEGER UNSIGNED NULL;

CREATE INDEX `idx_bank_txn_direction_user` ON `bank_transactions` (`direction_confirmed_by`);

ALTER TABLE `bank_transactions`
  ADD CONSTRAINT `fk_bank_txn_direction_user`
  FOREIGN KEY (`direction_confirmed_by`) REFERENCES `users` (`id`)
  ON DELETE SET NULL;
