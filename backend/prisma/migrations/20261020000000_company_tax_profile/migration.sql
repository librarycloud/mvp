ALTER TABLE `company_profiles`
  ADD COLUMN `vat_taxpayer_type` ENUM('UNKNOWN', 'SMALL_SCALE', 'GENERAL') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `vat_filing_period` ENUM('UNKNOWN', 'MONTH', 'QUARTER') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `cit_filing_period` ENUM('UNKNOWN', 'MONTH', 'QUARTER') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `cit_tax_collection_method` ENUM('UNKNOWN', 'ACCOUNTING', 'ASSESSED') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `small_profit_enterprise_eligible` ENUM('UNKNOWN', 'YES', 'NO') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `urban_maintenance_rate` DECIMAL(5, 4) NULL,
  ADD COLUMN `education_surcharge_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.0300,
  ADD COLUMN `local_education_surcharge_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.0200,
  ADD COLUMN `surcharge_reduction_eligible` ENUM('UNKNOWN', 'YES', 'NO') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `surcharge_reduction_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.0000;
