ALTER TABLE `invoices`
    ADD COLUMN `invoice_type` ENUM('SPECIAL', 'ORDINARY', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN' AFTER `direction`;

UPDATE `invoices`
SET `invoice_type` = 'SPECIAL'
WHERE `invoice_type` = 'UNKNOWN'
  AND (
    JSON_SEARCH(`raw_data`, 'one', '%专用发票%') IS NOT NULL
    OR JSON_SEARCH(`raw_data`, 'one', '%专票%') IS NOT NULL
  );

UPDATE `invoices`
SET `invoice_type` = 'ORDINARY'
WHERE `invoice_type` = 'UNKNOWN'
  AND (
    JSON_SEARCH(`raw_data`, 'one', '%普通发票%') IS NOT NULL
    OR JSON_SEARCH(`raw_data`, 'one', '%普票%') IS NOT NULL
  );
