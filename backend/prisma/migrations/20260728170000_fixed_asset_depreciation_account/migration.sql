ALTER TABLE `fixed_assets`
  ADD COLUMN `depreciation_expense_account_id` INTEGER UNSIGNED NULL;

CREATE INDEX `fixed_assets_depreciation_expense_account_id_idx`
  ON `fixed_assets`(`depreciation_expense_account_id`);

ALTER TABLE `fixed_assets`
  ADD CONSTRAINT `fixed_assets_depreciation_expense_account_id_fkey`
  FOREIGN KEY (`depreciation_expense_account_id`) REFERENCES `accounts`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
