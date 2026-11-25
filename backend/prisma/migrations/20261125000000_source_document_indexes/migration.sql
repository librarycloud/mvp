-- CreateIndex
CREATE INDEX `bank_transactions_voucher_id_transaction_date_idx` ON `bank_transactions`(`voucher_id`, `transaction_date`);

-- CreateIndex
CREATE INDEX `invoices_direction_issue_date_idx` ON `invoices`(`direction`, `issue_date`);

-- CreateIndex
CREATE INDEX `invoices_status_issue_date_idx` ON `invoices`(`status`, `issue_date`);
