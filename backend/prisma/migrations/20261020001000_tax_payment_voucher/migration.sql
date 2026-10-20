ALTER TABLE `tax_payments`
  ADD COLUMN `voucher_id` INT UNSIGNED NULL,
  ADD UNIQUE INDEX `tax_payments_voucher_id_key` (`voucher_id`),
  ADD CONSTRAINT `tax_payments_voucher_id_fkey`
    FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
